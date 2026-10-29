/**
 * Dvigatel qaytargan o'zgarishlar to'plamini Feature Layerga yozish (applyEdits).
 *
 * To'plam (dvigatel/tahrir.ts → fl_ozgarishlar):
 *   { liniya: { qosh: [{GLOBALID, attributes, geometry}], yangila: [{GLOBALID, attributes, geometry?}], ochir: [GLOBALID] },
 *     qurilma: { ... } }
 * Atribut nomlari katta-kichik harfga qaramay Feature Layer maydoniga moslanadi; geometriya GeoJSON (WGS84).
 * Har bir yozishda teskari to'plam ham tuziladi — "Ortga qaytarish" shuni xuddi shu funksiya bilan qo'llaydi.
 */
import { fieldName } from "./layers";
import { fromGeoJson, project } from "./geo";
import { graphicToFeature, normalizeGlobalId } from "./fl-oqish";
import type { Qatlam, Tarmoq } from "./network";

export interface Ozgarish {
  qosh?: Array<{ GLOBALID?: string; attributes: Record<string, any>; geometry: any }>;
  yangila?: Array<{ GLOBALID: string; attributes: Record<string, any>; geometry?: any }>;
  ochir?: string[];
}
export type Toplam = Partial<Record<Qatlam, Ozgarish>>;

export interface QollashNatija {
  teskari: Toplam;
  /** Rejadagi (yoki tiklangan obyektning eski) GLOBALID → Feature Layer bergan haqiqiy GLOBALID. */
  gidlar: Record<string, string>;
}

const TIZIM_TURLARI = new Set([
  "oid", "global-id", "geometry", "blob", "raster", "xml",
  "esriFieldTypeOID", "esriFieldTypeGlobalID", "esriFieldTypeGeometry", "esriFieldTypeBlob",
  "esriFieldTypeRaster", "esriFieldTypeXML",
]);
const SONLI = /integer|double|single|small|big/i;

/**
 * Qatlamga yozish mumkinmi. WebMap da "tahrirlash" o'chirilgan bo'lsa JS API editingEnabled=false qiladi va
 * applyEdits ni rad etadi — servis tahrirga ruxsat bersa, bu faqat mijoz tomonidagi bayroq, uni yoqamiz
 * (ruxsatni baribir server tekshiradi). Yozib bo'lmasa — sababi matn sifatida qaytadi.
 */
export function yozishMumkinmi(layer: any): string | null {
  if (!layer) return "qatlam topilmadi";
  const nom = `«${layer.title || layer.url || "qatlam"}»`;
  if (typeof layer.applyEdits !== "function") return `${nom} qatlami (${layer.type}) tahrirlashni qo'llamaydi`;
  const op = layer.capabilities?.operations;
  if (op) {
    const yoq = [!op.supportsAdd && "qo'shish", !op.supportsUpdate && "o'zgartirish", !op.supportsDelete && "o'chirish"].filter(Boolean);
    if (op.supportsEditing === false) return `${nom}: Feature servisda tahrirlash yoqilmagan (Portalda qatlam sozlamasi: Enable editing)`;
    if (yoq.length) return `${nom}: servis quyidagiga ruxsat bermaydi: ${yoq.join(", ")}`;
  }
  if (layer.editingEnabled === false) layer.editingEnabled = true;
  return null;
}

/** JS API xatosidan foydalanuvchiga tushunarli matn (server xabarlari details ichida bo'ladi). */
export function xatoMatni(e: any): string {
  const d = e?.details;
  const ichki = [d?.messages, d?.raw?.messages, d?.error?.details, d?.raw?.error?.message]
    .flat().filter(Boolean).map(String);
  const matn = [e?.message || String(e), ...ichki].filter((v, i, a) => v && a.indexOf(v) === i).join(" — ");
  if (/user type extension|Advanced Editing/i.test(matn)) {
    return "Utility Network qatlamini tahrirlash uchun Portal foydalanuvchingizga \"ArcGIS Advanced Editing\" " +
      "kengaytmasi berilmagan. Portal administratori: Organization → Licenses → ArcGIS Advanced Editing → " +
      `foydalanuvchini qo'shish. (Server: ${matn})`;
  }
  if (e?.details?.httpStatus === 403 || /permission|not authorized|does not have permissions/i.test(matn)) {
    return `Bu qatlamni tahrirlashga ruxsatingiz yo'q (Portal huquqlari). (Server: ${matn})`;
  }
  return matn;
}

/** Xato Feature Layerga yozish ruxsati / litsenziyasi yo'qligidanmi (unda o'zgarish mahalliy saqlanadi). */
export function ruxsatXatosimi(e: any): boolean {
  return /Advanced Editing|user type extension|ruxsat|permission|not authorized|yozib bo'lmaydi|tahrirlash yoqilmagan|qo'llamaydi|ruxsat bermaydi/i
    .test(String(e?.message || e));
}

function bosh(o?: Ozgarish): boolean {
  return !o || (!o.qosh?.length && !o.yangila?.length && !o.ochir?.length);
}

/** To'plamda Feature Layerga yoziladigan narsa yo'q (masalan, faqat qo'shimcha atributlar o'zgargan). */
export function toplamBosh(t?: Toplam): boolean {
  return !t || (bosh(t.liniya) && bosh(t.qurilma));
}


class QatlamYozuvchi {
  private maydon = new Map<string, any>();
  private oidF: string;
  private gidF: string;

  constructor(private layer: any, private qatlam: Qatlam, private tarmoq: Tarmoq, private Graphic: any,
    private keshsiz = false) {
    for (const f of layer.fields || []) this.maydon.set(String(f.name).toUpperCase(), f);
    this.oidF = layer.objectIdField || "OBJECTID";
    this.gidF = layer.globalIdField || fieldName(layer, ["GLOBALID", "GlobalID"]);
  }

  private atributlar(src: Record<string, any>): Record<string, any> {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(src || {})) {
      const f = this.maydon.get(k.toUpperCase());
      if (!f || f.editable === false || TIZIM_TURLARI.has(f.type)) continue;
      if (f.name === this.oidF || f.name === this.gidF) continue;
      if (SONLI.test(f.type)) out[f.name] = v == null || v === "" ? null : Number(v);
      else if (/string/i.test(f.type)) out[f.name] = v == null ? null : String(v);
      else out[f.name] = v;
    }
    return out;
  }

  private geometriya(g: any): any {
    return project(fromGeoJson(g, !!this.layer.hasZ), this.layer.spatialReference);
  }

  /** GLOBALID bo'yicha obyekt (avval keshdan, bo'lmasa qatlamdan so'raladi). */
  private async olish(gid: string): Promise<{ oid: number; raw: Record<string, any>; geom: any }> {
    const f = this.keshsiz ? null : this.tarmoq.get(gid);
    if (f && f.qatlam === this.qatlam && !f.mahalliy) return { oid: f.oid, raw: f.raw, geom: f.geom };
    const q = this.layer.createQuery();
    q.where = `${this.gidF} = '${normalizeGlobalId(gid).replace(/'/g, "''")}'`;
    q.outFields = ["*"];
    q.returnGeometry = true;
    q.returnZ = false;
    q.outSpatialReference = { wkid: 4326 };
    const res = await this.layer.queryFeatures(q);
    const g = res?.features?.[0];
    if (!g) throw new Error(`Obyekt Feature Layerda topilmadi: ${gid}`);
    const feat = graphicToFeature(g);
    return { oid: g.attributes[this.oidF], raw: g.attributes, geom: feat.geometry };
  }

  /** Servis rollback qilmagan bo'lsa — shu so'rovda muvaffaqiyatli yozilgan qismni teskarisi bilan qaytaradi. */
  private async qismanQaytar(res: any, teskari: Ozgarish, yangilaOid: number[]) {
    const ok = (r: any) => r && !r.error;
    const qayta = {
      addFeatures: (res?.deleteFeatureResults || []).map((r: any, i: number) => ok(r) && teskari.qosh[i]).filter(Boolean)
        .map((q: any) => new this.Graphic({ geometry: this.geometriya(q.geometry), attributes: this.atributlar(q.attributes) })),
      updateFeatures: (res?.updateFeatureResults || []).map((r: any, i: number) => ok(r) && i)
        .filter((i: any) => i !== false)
        .map((i: number) => new this.Graphic({
          attributes: { ...this.atributlar(teskari.yangila[i].attributes), [this.oidF]: yangilaOid[i] },
          ...(teskari.yangila[i].geometry ? { geometry: this.geometriya(teskari.yangila[i].geometry) } : {}),
        })),
      deleteFeatures: (res?.addFeatureResults || []).filter(ok).map((r: any) => ({ objectId: r.objectId })),
    };
    if (!qayta.addFeatures.length && !qayta.updateFeatures.length && !qayta.deleteFeatures.length) return;
    try {
      await this.layer.applyEdits(qayta);
    } catch (e) {
      console.error("[UnElektr] qisman yozilgan o'zgarishni qaytarib bo'lmadi", e);
    }
  }

  async yoz(oz: Ozgarish): Promise<{ teskari: Ozgarish; gidlar: Record<string, string> }> {
    const teskari: Ozgarish = { qosh: [], yangila: [], ochir: [] };
    const gidlar: Record<string, string> = {};
    if (bosh(oz)) return { teskari, gidlar };

    const qosh = (oz.qosh || []).map(
      (q) => new this.Graphic({ geometry: this.geometriya(q.geometry), attributes: this.atributlar(q.attributes) }),
    );
    const yangila = [];
    const yangilaOid: number[] = [];
    for (const u of oz.yangila || []) {
      const asl = await this.olish(u.GLOBALID);
      const a = this.atributlar(u.attributes);
      a[this.oidF] = asl.oid;
      yangilaOid.push(asl.oid);
      const aslUpper: Record<string, any> = {};
      for (const [k, v] of Object.entries(asl.raw)) aslUpper[k.toUpperCase()] = v;
      const eski: Record<string, any> = {};
      for (const k of Object.keys(u.attributes || {})) eski[k] = aslUpper[k.toUpperCase()] ?? null;
      teskari.yangila.push({ GLOBALID: normalizeGlobalId(u.GLOBALID), attributes: eski, ...(u.geometry ? { geometry: asl.geom } : {}) });
      yangila.push(new this.Graphic({ attributes: a, ...(u.geometry ? { geometry: this.geometriya(u.geometry) } : {}) }));
    }
    const ochir = [];
    for (const gid of oz.ochir || []) {
      const asl = await this.olish(gid);
      teskari.qosh.push({ GLOBALID: normalizeGlobalId(gid), attributes: { ...asl.raw }, geometry: asl.geom });
      ochir.push({ objectId: asl.oid });
    }

    const sabab = yozishMumkinmi(this.layer);
    if (sabab) throw new Error(`Feature Layerga yozib bo'lmaydi: ${sabab}`);
    let res: any;
    // rollbackOnFailureEnabled faqat servis qo'llasa yuboriladi (UN qatlamlari ko'pincha qo'llamaydi —
    // bunda bitta yozuvdagi xato natijalar ichida qaytadi, yozilgan qismi pastda qo'lda qaytariladi)
    const rollback = this.layer.capabilities?.editing?.supportsRollbackOnFailure === true;
    try {
      res = await this.layer.applyEdits(
        { addFeatures: qosh, updateFeatures: yangila, deleteFeatures: ochir },
        rollback ? { rollbackOnFailureEnabled: true } : {},
      );
    } catch (e: any) {
      console.error("[UnElektr] applyEdits xato", this.layer?.title, e, { qosh, yangila, ochir });
      throw new Error(`Feature Layer yozmadi (${this.layer?.title || this.qatlam}): ${xatoMatni(e)}`);
    }
    const natijalar = [
      ...(res?.addFeatureResults || []),
      ...(res?.updateFeatureResults || []),
      ...(res?.deleteFeatureResults || []),
    ];
    const xato = natijalar.find((r: any) => r?.error);
    if (xato) {
      console.error("[UnElektr] applyEdits natijasida xato", this.layer?.title, natijalar);
      if (!rollback) await this.qismanQaytar(res, teskari, yangilaOid);
      throw new Error(`Feature Layer yozmadi (${this.layer?.title || this.qatlam}): ${xato.error.message || xato.error.name || "xato"}`);
    }

    const qoshilgan = res?.addFeatureResults || [];
    for (let i = 0; i < qoshilgan.length; i++) {
      const r = qoshilgan[i];
      let gid = r.globalId ? normalizeGlobalId(r.globalId) : "";
      if (!gid && r.objectId != null) {
        const q = this.layer.createQuery();
        q.objectIds = [r.objectId];
        q.outFields = [this.gidF];
        const fs = await this.layer.queryFeatures(q);
        gid = normalizeGlobalId(fs?.features?.[0]?.attributes?.[this.gidF] || "");
      }
      const reja = oz.qosh[i].GLOBALID || oz.qosh[i].attributes?.GLOBALID;
      if (reja && gid) gidlar[normalizeGlobalId(reja)] = gid;
      if (gid) teskari.ochir.push(gid);
    }
    return { teskari, gidlar };
  }
}

/**
 * To'plamni qo'llaydi: avval liniyalar, keyin qurilmalar. Ikkinchi qatlamda xato bo'lsa,
 * birinchisi teskari to'plam bilan qaytariladi — natijada hech narsa yarim yozilmaydi.
 */
export async function qolla(
  toplam: Toplam,
  layers: Record<Qatlam, any>,
  tarmoq: Tarmoq,
  Graphic: any,
  /** true — obyektlar keshdan emas, har doim Feature Layerdan olinadi (mahalliy o'zgarishlarni yuborishda). */
  keshsiz = false,
): Promise<QollashNatija> {
  const teskari: Toplam = {};
  const gidlar: Record<string, string> = {};
  const bajarilgan: Array<[Qatlam, Ozgarish]> = [];
  for (const qatlam of ["liniya", "qurilma"] as Qatlam[]) {
    const oz = toplam?.[qatlam];
    if (bosh(oz)) continue;
    if (!layers[qatlam]) throw new Error(`${qatlam === "liniya" ? "Liniya" : "Qurilma"} qatlami topilmadi`);
    try {
      const n = await new QatlamYozuvchi(layers[qatlam], qatlam, tarmoq, Graphic, keshsiz).yoz(oz);
      teskari[qatlam] = n.teskari;
      Object.assign(gidlar, n.gidlar);
      bajarilgan.push([qatlam, n.teskari]);
    } catch (e) {
      for (const [q, t] of bajarilgan.reverse()) {
        try {
          await new QatlamYozuvchi(layers[q], q, tarmoq, Graphic, true).yoz(t);
        } catch {
          /* qaytarishning o'zi xato bersa — asl xatoni ko'rsatamiz */
        }
      }
      throw e;
    }
  }
  return { teskari, gidlar };
}
