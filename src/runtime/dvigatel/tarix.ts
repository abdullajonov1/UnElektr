/**
 * Tahrir tarixi va "Ortga qaytarish" — UN_Dvigatel tahrir.py dagi /tahrir/qayd, /qaytarish, /qaytarildi,
 * /kutilayotgan... so'rovlarining nusxasi.
 *
 * Tarix qayerda saqlanadi (TarixOmbori):
 *   * JadvalTarix — Feature Service ichidagi jadval (widget sozlamasida "Tarix jadvali"). Hamma foydalanuvchi uchun
 *     umumiy. Jadval maydonlari: README dagi "Tarix jadvali" bo'limiga qarang (TARIX_MAYDONLARI).
 *   * BrauzerTarix — jadval ko'rsatilmagan bo'lsa: brauzer xotirasi (shu brauzer va shu Feature Layer uchun).
 *
 * Feature Layer yozishni rad etgan o'zgarishlar ("kutilayotgan") har doim brauzerda saqlanadi — ruxsat paydo bo'lgach
 * "Feature Layerga yuborish" bilan yoziladi.
 */
import { EngineXato } from "./jadval";

export interface TarixQatori {
  id: number;
  guruh: number;
  vaqt: string;
  foydalanuvchi: string;
  amal: string;
  qatlam: string | null;
  globalid: string | null;
  nomi: string | null;
  maydon: string | null;
  eski: string | null;
  yangi: string | null;
  bekor: number;
  /** JSON: {teskari_fl} yoki {kutilayotgan}. Guruhning faqat birinchi qatorida. */
  malumot: string | null;
}

export type YangiQator = Omit<TarixQatori, "id" | "guruh">;

export interface TarixOmbori {
  /** Saqlash joyi nomi (holat qatorida ko'rsatiladi). */
  readonly nomi: string;
  /** Oxirgi qatorlar (id kamayish tartibida). */
  oxirgilar(limit: number): Promise<TarixQatori[]>;
  /** Yangi guruh (MAX(guruh) + 1) bilan qatorlar qo'shadi. Qaytaradi: guruh. */
  guruhQosh(qatorlar: YangiQator[]): Promise<number>;
  /** Guruhning qatorlari (id o'sish tartibida). */
  guruh(g: number): Promise<TarixQatori[]>;
  /** Ortga qaytariladigan oxirgi yozuv: bekor = 0, amal != "ortga", malumot bor. */
  qaytariladigan(): Promise<TarixQatori | null>;
  /** Qatorlarni id bo'yicha yangilaydi. */
  saqla(qatorlar: TarixQatori[]): Promise<void>;
  /** bekor = 0 qatorlar ichidan malumot yoki globalid da matn uchraydiganlari. */
  qidir(matn: string): Promise<TarixQatori[]>;
}

export interface Kutilayotgan {
  id: number;
  guruh: number | null;
  vaqt: string;
  foydalanuvchi: string;
  toplam: any;
  holat: "kutmoqda" | "yuborildi" | "bekor";
}

export function hozir(): string {
  const d = new Date();
  const n = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${n(d.getMonth() + 1)}-${n(d.getDate())} ${n(d.getHours())}:${n(d.getMinutes())}:${n(d.getSeconds())}`;
}

// ---------------------------------------------------------------- brauzer xotirasi
function oqi<T>(kalit: string, standart: T): T {
  try {
    const s = window.localStorage.getItem(kalit);
    return s ? JSON.parse(s) : standart;
  } catch {
    return standart;
  }
}

function yoz(kalit: string, qiymat: any) {
  try {
    window.localStorage.setItem(kalit, JSON.stringify(qiymat));
  } catch (e: any) {
    throw new Error(`Brauzer xotirasiga yozib bo'lmadi: ${e?.message || e}`);
  }
}

/** Tarix brauzerda (localStorage). Eng oxirgi ENG_KOP guruh saqlanadi. */
export class BrauzerTarix implements TarixOmbori {
  readonly nomi = "brauzer";
  static ENG_KOP = 300;

  constructor(private kalit: string) {}

  private hammasi(): TarixQatori[] {
    return oqi<TarixQatori[]>(this.kalit, []);
  }

  async oxirgilar(limit: number) {
    return this.hammasi().sort((a, b) => b.id - a.id).slice(0, limit);
  }

  async guruhQosh(qatorlar: YangiQator[]) {
    let h = this.hammasi();
    const guruh = h.reduce((m, r) => Math.max(m, r.guruh), 0) + 1;
    let id = h.reduce((m, r) => Math.max(m, r.id), 0);
    for (const q of qatorlar) h.push({ ...q, id: ++id, guruh });
    const guruhlar = [...new Set(h.map((r) => r.guruh))].sort((a, b) => b - a);
    if (guruhlar.length > BrauzerTarix.ENG_KOP) {
      const chegara = guruhlar[BrauzerTarix.ENG_KOP - 1];
      h = h.filter((r) => r.guruh >= chegara);
    }
    yoz(this.kalit, h);
    return guruh;
  }

  async guruh(g: number) {
    return this.hammasi().filter((r) => r.guruh === g).sort((a, b) => a.id - b.id);
  }

  async qaytariladigan() {
    const h = this.hammasi().filter((r) => r.bekor === 0 && r.amal !== "ortga" && r.malumot != null);
    return h.sort((a, b) => b.guruh - a.guruh)[0] || null;
  }

  async saqla(qatorlar: TarixQatori[]) {
    const yangi = new Map(qatorlar.map((r) => [r.id, r]));
    yoz(this.kalit, this.hammasi().map((r) => yangi.get(r.id) || r));
  }

  async qidir(matn: string) {
    return this.hammasi().filter((r) => r.bekor === 0 && ((r.malumot || "").includes(matn) || (r.globalid || "").includes(matn)));
  }
}

/** Feature Layerga yozilmagan o'zgarishlar — har doim brauzerda. */
export class BrauzerKutilayotgan {
  constructor(private kalit: string) {}

  hammasi(): Kutilayotgan[] {
    return oqi<Kutilayotgan[]>(this.kalit, []);
  }

  saqla(h: Kutilayotgan[]) {
    yoz(this.kalit, h);
  }
}

// ---------------------------------------------------------------- Feature Service jadvali
/** Tarix jadvali maydonlari: nom, tur, uzunlik (README da ham shu ro'yxat). */
export const TARIX_MAYDONLARI: Array<{ nom: string; tur: string; uzunlik?: number }> = [
  { nom: "GURUH", tur: "Integer" },
  { nom: "VAQT", tur: "String", uzunlik: 19 },
  { nom: "FOYDALANUVCHI", tur: "String", uzunlik: 128 },
  { nom: "AMAL", tur: "String", uzunlik: 32 },
  { nom: "QATLAM", tur: "String", uzunlik: 16 },
  { nom: "OBYEKT_GID", tur: "String", uzunlik: 38 },
  { nom: "NOMI", tur: "String", uzunlik: 255 },
  { nom: "MAYDON", tur: "String", uzunlik: 64 },
  { nom: "ESKI", tur: "String", uzunlik: 2000 },
  { nom: "YANGI", tur: "String", uzunlik: 2000 },
  { nom: "BEKOR", tur: "SmallInteger" },
  { nom: "MALUMOT", tur: "String", uzunlik: 1000000 },
];

const USTUN: Record<keyof Omit<TarixQatori, "id">, string> = {
  guruh: "GURUH", vaqt: "VAQT", foydalanuvchi: "FOYDALANUVCHI", amal: "AMAL", qatlam: "QATLAM", globalid: "OBYEKT_GID",
  nomi: "NOMI", maydon: "MAYDON", eski: "ESKI", yangi: "YANGI", bekor: "BEKOR", malumot: "MALUMOT",
};

const sql = (s: string) => s.replace(/'/g, "''");

/** Tarix Feature Service jadvalida (FeatureLayer, geometriyasiz). */
export class JadvalTarix implements TarixOmbori {
  readonly nomi = "jadval";
  private nom = new Map<string, any>();
  private oid = "OBJECTID";

  constructor(private layer: any, private Graphic: any) {}

  /** Jadvalni yuklaydi va maydonlarini tekshiradi. Yetishmasa — xato. */
  async tayyorla(): Promise<void> {
    await this.layer.load();
    for (const f of this.layer.fields || []) this.nom.set(String(f.name).toUpperCase(), f);
    this.oid = this.layer.objectIdField || "OBJECTID";
    const yoq = TARIX_MAYDONLARI.filter((m) => !this.nom.has(m.nom)).map((m) => m.nom);
    if (yoq.length) throw new Error(`Tarix jadvalida maydonlar yo'q: ${yoq.join(", ")}`);
  }

  private f(k: string): string {
    return this.nom.get(k).name;
  }

  private qatorga(a: Record<string, any>): TarixQatori {
    const up: Record<string, any> = {};
    for (const [k, v] of Object.entries(a || {})) up[k.toUpperCase()] = v;
    const r: any = { id: Number(a[this.oid]) };
    for (const [k, u] of Object.entries(USTUN)) r[k] = up[u] ?? null;
    r.guruh = Number(r.guruh);
    r.bekor = Number(r.bekor || 0);
    return r;
  }

  private atributlar(r: Partial<TarixQatori>): Record<string, any> {
    const a: Record<string, any> = {};
    for (const [k, u] of Object.entries(USTUN)) {
      if (!(k in r)) continue;
      let v = (r as any)[k];
      const uz = this.nom.get(u)?.length;
      if (typeof v === "string" && uz && v.length > uz) {
        if (u === "MALUMOT") throw new Error(`Tarix jadvalidagi MALUMOT maydoni juda qisqa (${uz} belgi, kerak: ${v.length})`);
        v = v.slice(0, uz);
      }
      a[this.f(u)] = v;
    }
    return a;
  }

  private async sorov(where: string, tartib: string[], num?: number): Promise<TarixQatori[]> {
    const q = this.layer.createQuery();
    q.where = where;
    q.outFields = ["*"];
    q.returnGeometry = false;
    q.orderByFields = tartib;
    if (num) q.num = num;
    const res = await this.layer.queryFeatures(q);
    return (res?.features || []).map((g: any) => this.qatorga(g.attributes));
  }

  private async tahrir(edits: any): Promise<void> {
    const res = await this.layer.applyEdits(edits);
    const x = [...(res?.addFeatureResults || []), ...(res?.updateFeatureResults || [])].find((r: any) => r?.error);
    if (x) throw new Error(`Tarix jadvaliga yozilmadi: ${x.error.message || x.error.name || "xato"}`);
  }

  oxirgilar(limit: number) {
    return this.sorov("1=1", [`${this.f("GURUH")} DESC`, `${this.oid} DESC`], limit);
  }

  async guruhQosh(qatorlar: YangiQator[]) {
    const oxirgi = await this.sorov("1=1", [`${this.f("GURUH")} DESC`], 1);
    const guruh = (oxirgi[0]?.guruh || 0) + 1;
    await this.tahrir({ addFeatures: qatorlar.map((r) => new this.Graphic({ attributes: this.atributlar({ ...r, guruh }) })) });
    return guruh;
  }

  guruh(g: number) {
    return this.sorov(`${this.f("GURUH")} = ${Number(g)}`, [`${this.oid} ASC`]);
  }

  async qaytariladigan() {
    const r = await this.sorov(
      `${this.f("BEKOR")} = 0 AND ${this.f("AMAL")} <> 'ortga' AND ${this.f("MALUMOT")} IS NOT NULL`,
      [`${this.f("GURUH")} DESC`], 1);
    return r[0] || null;
  }

  async saqla(qatorlar: TarixQatori[]) {
    if (!qatorlar.length) return;
    await this.tahrir({
      updateFeatures: qatorlar.map((r) => {
        const { id, ...qolgan } = r;
        return new this.Graphic({ attributes: { ...this.atributlar(qolgan), [this.oid]: id } });
      }),
    });
  }

  qidir(matn: string) {
    const m = sql(matn);
    return this.sorov(`${this.f("BEKOR")} = 0 AND (${this.f("MALUMOT")} LIKE '%${m}%' OR ${this.f("OBYEKT_GID")} = '${m}')`, [`${this.oid} ASC`]);
  }
}

// ---------------------------------------------------------------- so'rovlar (widget uchun)
export interface QaydSorov {
  amal: string;
  qatlam: string;
  globalid?: string | null;
  nomi?: string | null;
  qatorlar?: Array<{ maydon?: string | null; eski?: string | null; yangi?: string | null }>;
  teskari?: any;
  almashtir?: Record<string, string>;
}

export class TarixXizmati {
  constructor(private ombor: TarixOmbori, private kut: BrauzerKutilayotgan, private foydalanuvchi: () => string) {}

  get omborNomi(): string {
    return this.ombor.nomi;
  }

  private login(): string {
    return this.foydalanuvchi() || "unelektr";
  }

  async tarix(limit = 100) {
    return (await this.ombor.oxirgilar(limit)).map(({ malumot, ...r }) => ({ ...r, mahalliy: (malumot || "").includes("\"kutilayotgan\"") ? 1 : 0 }));
  }

  private async tarixgaQator(s: QaydSorov, malumot: any): Promise<number> {
    const vaqt = hozir();
    const qatorlar = s.qatorlar?.length ? s.qatorlar : [{ maydon: null, eski: null, yangi: null }];
    return this.ombor.guruhQosh(qatorlar.map((q, i) => ({
      vaqt, foydalanuvchi: this.login(), amal: s.amal, qatlam: s.qatlam ?? null, globalid: s.globalid ?? null,
      nomi: s.nomi ?? null, maydon: q.maydon ?? null, eski: q.eski ?? null, yangi: q.yangi ?? null, bekor: 0,
      malumot: i === 0 ? JSON.stringify(malumot) : null,
    })));
  }

  /** Rejadagi / o'chirilgan obyektning GLOBALID si → Feature Layer bergan GLOBALID (bekor qilinmagan yozuvlarda). */
  private async gidAlmashtir(almashtir: Record<string, string> = {}) {
    for (const [eski, yangi] of Object.entries(almashtir)) {
      if (!eski || eski === yangi) continue;
      const qatorlar = await this.ombor.qidir(eski);
      await this.ombor.saqla(qatorlar.map((r) => ({
        ...r, malumot: r.malumot == null ? null : r.malumot.split(eski).join(yangi),
        globalid: r.globalid == null ? null : r.globalid.split(eski).join(yangi),
      })));
    }
  }

  /** Feature Layerga yozilgan o'zgarishni tarixga qo'shish. */
  async qayd(s: QaydSorov) {
    return { ok: true, guruh: await this.tarixgaQator(s, { teskari_fl: s.teskari ?? null }) };
  }

  // ------------------------------------------------------------ kutilayotgan (Feature Layerga hali yozilmagan)
  async kutilayotganQosh(s: { toplam: any; tarix: QaydSorov }) {
    const h = this.kut.hammasi();
    const id = h.reduce((m, k) => Math.max(m, k.id), 0) + 1;
    h.push({ id, guruh: null, vaqt: hozir(), foydalanuvchi: this.login(), toplam: s.toplam, holat: "kutmoqda" });
    this.kut.saqla(h);
    const guruh = await this.tarixgaQator(s.tarix, { kutilayotgan: id });
    this.kut.saqla(this.kut.hammasi().map((k) => (k.id === id ? { ...k, guruh } : k)));
    return { ok: true, id, guruh };
  }

  async kutilayotganRoyxat() {
    return this.kut.hammasi().filter((k) => k.holat === "kutmoqda").sort((a, b) => a.id - b.id)
      .map(({ id, guruh, vaqt, foydalanuvchi, toplam }) => ({ id, guruh, vaqt, foydalanuvchi, toplam }));
  }

  async kutilayotganYuborildi(s: { id: number; almashtir?: Record<string, string>; teskari?: any }) {
    const h = this.kut.hammasi();
    const r = h.find((k) => k.id === s.id && k.holat === "kutmoqda");
    if (!r) throw new EngineXato("Bunday kutilayotgan o'zgarish yo'q", 404);
    r.holat = "yuborildi";
    // rejadagi GLOBALIDlar -> Feature Layer bergan GLOBALIDlar (keyingi o'zgarishlar ularga tayanadi)
    for (const k of h) {
      if (k.holat !== "kutmoqda") continue;
      let t = JSON.stringify(k.toplam);
      for (const [eski, yangi] of Object.entries(s.almashtir || {})) t = t.split(eski).join(yangi);
      k.toplam = JSON.parse(t);
    }
    this.kut.saqla(h);
    // tarix yozuvi endi odatdagi Feature Layer yozuvi: ortga qaytarish teskari to'plam bilan
    if (r.guruh != null) {
      const qatorlar = (await this.ombor.guruh(r.guruh)).filter((q) => q.malumot != null);
      await this.ombor.saqla(qatorlar.map((q) => {
        const m = JSON.parse(q.malumot || "{}");
        delete m.kutilayotgan;
        return { ...q, malumot: JSON.stringify({ ...m, teskari_fl: s.teskari ?? null }) };
      }));
    }
    await this.gidAlmashtir(s.almashtir);
    return { ok: true };
  }

  async kutilayotganBekor(s: { id: number }) {
    this.kut.saqla(this.kut.hammasi().map((k) => (k.id === s.id ? { ...k, holat: "bekor" as const } : k)));
    return { ok: true };
  }

  // ------------------------------------------------------------ ortga qaytarish
  async qaytarish() {
    const r = await this.ombor.qaytariladigan();
    if (!r) throw new EngineXato("Ortga qaytariladigan o'zgarish yo'q", 404);
    const m = JSON.parse(r.malumot || "{}");
    return {
      guruh: r.guruh, amal: r.amal, qatlam: r.qatlam, globalid: r.globalid, nomi: r.nomi,
      teskari: m.teskari_fl ?? null, kutilayotgan: m.kutilayotgan ?? null,
    };
  }

  async qaytarildi(s: { guruh: number; almashtir?: Record<string, string> }) {
    const qatorlar = await this.ombor.guruh(s.guruh);
    if (!qatorlar.length) throw new EngineXato("Bunday yozuv yo'q", 404);
    const r = qatorlar[0];
    await this.ombor.saqla(qatorlar.map((q) => ({ ...q, bekor: 1 })));
    const alm = s.almashtir || {};
    await this.ombor.guruhQosh([{
      vaqt: hozir(), foydalanuvchi: this.login(), amal: "ortga", qatlam: r.qatlam, globalid: alm[r.globalid] ?? r.globalid,
      nomi: r.nomi, maydon: r.maydon, eski: r.yangi, yangi: r.eski, bekor: 1, malumot: null,
    }]);
    // o'chirilib qayta tiklangan obyektlar yangi GLOBALID oladi — oldingi yozuvlardagi havolalarni yangilaymiz
    await this.gidAlmashtir(alm);
    return { ok: true };
  }
}
