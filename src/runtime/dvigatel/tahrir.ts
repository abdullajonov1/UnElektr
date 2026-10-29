/**
 * Tahrirlash — UN_Dvigatel tahrir.py ning UnElektr qismi.
 *
 * Har bir amal (atribut, qirqish, qurilma qo'yish, liniya chizish, ko'chirish, shakl, o'chirish) quyidagicha o'tadi:
 *   1. Qiymatlar turi tekshiriladi, reja tuziladi ("amallar" ro'yxati). sinov=true — faqat reja ko'rsatiladi.
 *   2. Amallar jadvallar NUSXASIGA qo'llanadi, graf qayta quriladi va xatolar tekshiriladi. O'zgarish YANGI xato
 *      (UN yoki FIZ) keltirib chiqarsa — 409 (admin "majburan" bilan baribir saqlashi mumkin).
 *   3. Javobda Feature Layerga yoziladigan o'zgarishlar to'plami (fl_ozgarishlar, GLOBALID bo'yicha) va tarix yozuvi
 *      qaytadi. Dvigatel holati o'zgarmaydi — widget to'plamni Feature Layerga yozadi va qayta yuklaydi.
 *
 *   amal: {tur: "yangila" | "qosh" | "ochir", qatlam, oid, qiymatlar: {...atributlar, Shape: UTM geometriya}}
 */
import { chiziqMasofa, engYaqinNuqta, g, masofa, uzunlik, yaxlit, type XY } from "./geom";
import { QURILMA_TURLARI, TOLERANS, qur } from "./graf";
import { imzola, tekshir } from "./xatolar";
import { joriyImzolar, liniyaIndeksi, qurilmaIndeksi, ustunlar, type Holat, type QatlamNomi } from "./holat";
import {
  EngineXato, boshmi, liniyaUtmdan, moda, qurilmaUtmdan, tengmi, type Jadvallar, type Liniya, type Qurilma, type Xossalar,
} from "./jadval";
import { utmga, wgsga } from "./utm";

/** Tahrirlab bo'lmaydigan tizim maydonlari (UN ichki maydonlari va identifikatorlar). */
const TIZIM = new Set([
  "OBJECTID", "GLOBALID", "ASSETGROUP", "ASSETTYPE", "ASSOCIATIONSTATUS", "ISCONNECTED",
  "FROMDEVICETERMINAL", "TODEVICETERMINAL", "FLOWDIRECTION", "SUBNETWORKNAME",
  "SUPPORTEDSUBNETWORKNAME", "SUPPORTINGSUBNETWORKNAME", "ISSUBNETWORKCONTROLLER",
  "SUBNETWORKCONTROLLERNAME", "TIERNAME", "TIERRANK", "TERMINALCONFIGURATION", "SHAPE", "GEOMETRY",
  "UZUNLIK_M", // geometriyadan avtomatik hisoblanadi
]);
/** Liniya kuchlanishi faqat shu qiymatlardan biri bo'lishi mumkin. */
export const LINIYA_KV = [0.4, 6, 10, 35, 110];

/** Maydonlarning o'zbekcha nomlari (formada ko'rinadi). */
const NOMLAR: Record<string, string> = {
  NOMI: "Nomi", KUCHLANISH: "Kuchlanish", VAZIFASI: "Vazifasi", KADASTR: "Kadastr raqami",
  IDEN_RAQ: "Identifikatsiya raqami", SIMNING_M: "Sim markasi", HAVODA_T_S: "Havodagi tayanchlar soni",
  TAYANCHLAR_T: "Tayanch turi", TAYANCHLAR_S: "Tayanchlar soni", ISHLAB_CH_Y: "Ishlab chiqarilgan yil",
  ISHLAB_CH_Z: "Ishlab chiqaruvchi zavod", EKSPL_KIR_YIL: "Ekspluatatsiyaga kirgan yil",
  IDOR_MAN: "Idora mansubligi", M_MASOFA: "Masofa", UZUNLIK_M: "Uzunlik, m",
  VILOYAT_ID: "Viloyat ID", TUMAN_ID: "Tuman ID", USKUNALAR_N_T: "Uskuna nomi/turi",
  USKUNALAR_S: "Uskunalar soni", AYL_CHAST: "Aylanish chastotasi", SOV_USL: "Sovutish usuli",
  XIM_DAR: "Himoya darajasi", OB_MAN: "Obyekt mansubligi",
  TAYANCH_TURI: "Tayanch turi", KUCHLANISH_N: "Kuchlanish", USKUNA_TURI: "Uskuna turi",
  TRANS_SONI: "Transformatorlar soni",
};

/** Feature Layer maydon turi → ichki tur. */
const FL_TURLARI: Record<string, string> = {
  esriFieldTypeSmallInteger: "INTEGER", esriFieldTypeInteger: "INTEGER", esriFieldTypeBigInteger: "INTEGER",
  "small-integer": "INTEGER", integer: "INTEGER", "big-integer": "INTEGER",
  esriFieldTypeDouble: "DOUBLE", esriFieldTypeSingle: "DOUBLE", double: "DOUBLE", single: "DOUBLE",
  esriFieldTypeString: "TEXT", string: "TEXT",
};

/** Qirqishdan keyin bo'lak shundan qisqa bo'lmasligi kerak. */
const ENG_QISQA_M = 0.5;

/** Liniya kuchlanishiga qarab qaysi terminalga ulanadi (qurilma qo'yishda). */
const TERMINAL_TANLOV: Record<number, Record<string, number>> = {
  2: { "6": 4, "10": 4, "0.4": 5 }, // TP: 6/10 kV -> Kirish, 0.4 kV -> Chiqish
  1: { "35": 2, "110": 2, "6": 3, "10": 3 }, // PS: 35/110 kV -> Yuqori, 6/10 kV -> O'rta
};
/** Liniya chizishda ulanadigan terminallar (Tashqi manbaga ham — faqat Chiqish). */
const LINIYA_TERMINAL: Record<number, Record<string, number>> = { ...TERMINAL_TANLOV, 3: { "35": 7, "110": 7 } };

export interface Amal {
  tur: "yangila" | "qosh" | "ochir";
  qatlam: QatlamNomi;
  oid: number;
  qiymatlar?: Xossalar;
}

export interface TarixYozuvi {
  amal: string;
  qatlam: string;
  globalid: string | null;
  nomi: string;
  qatorlar: Array<{ maydon: string | null; eski: string | null; yangi: string | null }>;
  qoshimcha: any[];
}

const nomsiz = (v: any) => (v == null || v === "" ? "(nomsiz)" : String(v));
const xato = (matn: string, holat = 422) => new EngineXato(matn, holat);

function yangiGid(): string {
  const c: any = (globalThis as any).crypto;
  if (c?.randomUUID) return "{" + c.randomUUID().toUpperCase() + "}";
  const h = "0123456789ABCDEF";
  let s = "";
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) s += "-";
    else if (i === 14) s += "4";
    else if (i === 19) s += h[8 + Math.floor(Math.random() * 4)];
    else s += h[Math.floor(Math.random() * 16)];
  }
  return "{" + s + "}";
}

const pyStr = (v: any): string | null => (boshmi(v) ? null : String(v));

export class Tahrir {
  constructor(private h: Holat, private majburanMumkin: boolean) {}

  // ------------------------------------------------------------ maydonlar
  private flSxema(q: QatlamNomi): Record<string, string> | null {
    const s = this.h.maydonlar[q];
    if (!s?.length) return null;
    const r: Record<string, string> = {};
    for (const m of s) r[m.name] = m.type;
    return r;
  }

  /** Feature Layerda liniya KUCHLANISH butun son: 0.4 kV unda 0 deb saqlanadi. */
  private kvButunmi(): boolean {
    return (FL_TURLARI[(this.flSxema("liniya") || {}).KUCHLANISH] || "").includes("INT");
  }

  private maydonTurlari(q: QatlamNomi): Record<string, string> {
    const sxema = this.h.maydonlar[q];
    const r: Record<string, string> = {};
    if (sxema?.length) {
      // Feature Layer sxemasi: faqat tahrirlanadigan va turi ma'lum maydonlar
      for (const m of sxema) if (m.editable !== false && FL_TURLARI[m.type]) r[m.name] = FL_TURLARI[m.type];
      if (q === "liniya" && this.kvButunmi()) r.KUCHLANISH = "DOUBLE";
      return r;
    }
    // sxema yuborilmagan bo'lsa — qiymatlardan
    const J: Map<number, Liniya | Qurilma> = q === "liniya" ? this.h.J.L : this.h.J.D;
    for (const k of ustunlar(this.h, q)) {
      let tur = "TEXT";
      for (const x of J.values()) {
        const v = x.p[k];
        if (boshmi(v)) continue;
        tur = typeof v === "number" ? (Number.isInteger(v) ? "INTEGER" : "DOUBLE") : "TEXT";
        break;
      }
      r[k] = tur;
    }
    return r;
  }

  tahrirlanadigan(q: QatlamNomi): Record<string, string> {
    const r: Record<string, string> = {};
    for (const [k, t] of Object.entries(this.maydonTurlari(q))) if (!TIZIM.has(k.toUpperCase())) r[k] = t;
    return r;
  }

  /** Formadagi nom: o'zbekcha nom, bo'lmasa Feature Layer aliasi. */
  private maydonNomi(q: QatlamNomi, k: string): string {
    if (NOMLAR[k]) return NOMLAR[k];
    const m = (this.h.maydonlar[q] || []).find((x) => x.name === k && x.alias);
    return m ? m.alias : k;
  }

  private static formaTuri(t: string): "butun" | "son" | "matn" {
    return t.includes("INT") ? "butun" : /DOUBLE|REAL|FLOAT/.test(t) ? "son" : "matn";
  }

  private qiymatniAylantir(maydon: string, tur: string, v: any): any {
    if (v == null || (typeof v === "string" && v.trim() === "")) return null;
    const nom = NOMLAR[maydon] || maydon;
    if (tur.includes("INT")) {
      const f = Number(String(v).replace(",", "."));
      if (!isFinite(f) || f !== Math.trunc(f)) throw xato(`"${nom}" butun son bo'lishi kerak: ${v}`);
      return f;
    }
    if (/DOUBLE|REAL|FLOAT|NUMERIC/.test(tur)) {
      const f = Number(String(v).replace(",", "."));
      if (!isFinite(f) || String(v).trim() === "") throw xato(`"${nom}" son bo'lishi kerak: ${v}`);
      return f;
    }
    return String(v);
  }

  /** O'zgarish qiymatlaridan Feature Layerga yoziladiganlari (sxemada bor maydonlar). */
  private ayir(q: QatlamNomi, qiymatlar: Xossalar): Xossalar {
    const fl = this.flSxema(q);
    if (!fl) return { ...qiymatlar };
    const r: Xossalar = {};
    for (let [k, v] of Object.entries(qiymatlar)) {
      if (!(k in fl) && k !== "GLOBALID") continue;
      if (q === "liniya" && k === "KUCHLANISH" && v != null && this.kvButunmi()) v = Number(v) >= 1 ? Math.round(Number(v)) : 0; // 0.4 kV -> 0
      r[k] = v;
    }
    return r;
  }

  private qiymat(p: Xossalar, k: string): any {
    const v = p[k];
    return boshmi(v) ? null : v;
  }

  private kopQismliEmas(gid: string) {
    if (this.h.kopQismli.has(gid)) {
      throw xato("Bu liniya Feature Layerda ko'p qismli — uning geometriyasini bu yerda o'zgartirib bo'lmaydi (qismlar yo'qolib qoladi)");
    }
  }

  private majburanTekshir(majburan: boolean) {
    if (majburan && !this.majburanMumkin) {
      throw xato("Tekshiruv rad etgan o'zgarishni faqat admin \"Baribir saqlash\" qila oladi", 403);
    }
  }

  topish(gid: string): { qatlam: QatlamNomi; oid: number; g: string } {
    let k = String(gid || "").trim().toUpperCase();
    if (!k.startsWith("{")) k = "{" + k + "}";
    const { tr } = this.h;
    if (tr.lgid.has(k)) return { qatlam: "liniya", oid: tr.lgid.get(k), g: k };
    if (tr.dgid.has(k)) return { qatlam: "qurilma", oid: tr.dgid.get(k), g: k };
    throw xato(`Bunday GLOBALID topilmadi: ${gid}`, 404);
  }

  private formaQatorlari(q: QatlamNomi, qiymat: (k: string) => any, birinchi: string[]) {
    const natija = Object.entries(this.tahrirlanadigan(q)).map(([k, t]) => {
      const m: any = { maydon: k, nomi: this.maydonNomi(q, k), tur: Tahrir.formaTuri(t), qiymat: qiymat(k) };
      if (q === "liniya" && k === "KUCHLANISH") m.tanlov = LINIYA_KV;
      return m;
    });
    const o = (m: any) => (birinchi.includes(m.maydon) ? birinchi.indexOf(m.maydon) : birinchi.length);
    return natija.map((m, i) => [m, i] as const).sort((a, b) => o(a[0]) - o(b[0]) || a[1] - b[1]).map(([m]) => m);
  }

  /** Obyektning tahrirlanadigan maydonlari va joriy qiymatlari. */
  maydonlar(globalid: string) {
    const { qatlam, oid, g: gid } = this.topish(globalid);
    const p = (qatlam === "liniya" ? this.h.J.L.get(oid) : this.h.J.D.get(oid)).p;
    return {
      globalid: gid, qatlam,
      maydonlar: this.formaQatorlari(qatlam, (k) => this.qiymat(p, k),
        ["NOMI", "KUCHLANISH", "KUCHLANISH_N", "SIMNING_M", "TAYANCHLAR_T", "TAYANCH_TURI", "USKUNALAR_N_T", "USKUNA_TURI", "IDOR_MAN"]),
    };
  }

  // ------------------------------------------------------------ umumiy: amallar → tekshiruv → o'zgarishlar to'plami
  /** Amallarni jadvallar NUSXASIGA qo'llaydi (holat o'zgarmaydi). */
  private xotiraga(amallar: Amal[]): Jadvallar {
    const J = this.h.J;
    const natija: Jadvallar = { L: J.L, D: J.D };
    for (const qatlam of ["liniya", "qurilma"] as QatlamNomi[]) {
      const ops = amallar.filter((a) => a.qatlam === qatlam);
      if (!ops.length) continue;
      const ust = ustunlar(this.h, qatlam);
      const M = new Map<number, any>(qatlam === "liniya" ? J.L : J.D);
      for (const a of ops) {
        if (a.tur === "ochir") {
          M.delete(a.oid);
          continue;
        }
        if (a.tur === "yangila") {
          const asl = M.get(a.oid);
          let r = { ...asl, p: { ...asl.p } };
          for (const [k, v] of Object.entries(a.qiymatlar)) {
            if (k === "Shape") r = qatlam === "liniya" ? liniyaUtmdan(r.oid, r.p, v) : qurilmaUtmdan(r.oid, r.p, v[0], v[1]);
            else if (ust.has(k)) r.p[k] = v;
          }
          M.set(a.oid, r);
          continue;
        }
        const p: Xossalar = {};
        for (const k of ust) p[k] = a.qiymatlar[k] ?? null;
        const sh = a.qiymatlar.Shape;
        M.set(a.oid, qatlam === "liniya" ? liniyaUtmdan(a.oid, p, sh) : qurilmaUtmdan(a.oid, p, sh[0], sh[1]));
      }
      if (qatlam === "liniya") natija.L = M;
      else natija.D = M;
    }
    return natija;
  }

  /** Tekshiradi: yangi jiddiy xato bo'lsa (majburan emas) — 409. */
  private bajar(amallar: Amal[], almashtir: Record<string, string>, majburan: boolean, xabar: string) {
    const J2 = this.xotiraga(amallar);
    const oldin = joriyImzolar(this.h);
    const keyin = imzola(tekshir(qur(J2)), almashtir);
    const yangi = [...keyin.entries()].filter(([k]) => !oldin.has(k)).map(([, r]) => r);
    const jiddiy = yangi.filter((r) => r.DARAJA === "UN" || r.DARAJA === "FIZ");
    if (jiddiy.length && !majburan) {
      throw new EngineXato(xabar, 409, {
        xabar, xatolar: jiddiy.map((r) => ({ kod: r.KOD, tur: r.TUR, izoh: r.IZOH, obyektlar: r.OBYEKTLAR })),
      });
    }
    return { yangi, jiddiy };
  }

  private static ogoh(yangi: Array<{ KOD: string; TUR: string; IZOH: string; DARAJA: string }>) {
    return yangi.filter((r) => r.DARAJA === "OGOH").map((r) => ({ kod: r.KOD, tur: r.TUR, izoh: r.IZOH }));
  }

  private static shaklGeojson(qatlam: QatlamNomi, sh: any): any {
    if (qatlam === "liniya") return { type: "LineString", coordinates: (sh as XY[]).map(([x, y]) => wgsga(x, y)) };
    return { type: "Point", coordinates: wgsga(sh[0], sh[1]) };
  }

  /** Feature Layerga qo'llanadigan o'zgarishlar (GLOBALID bo'yicha). */
  private flQism(amallar: Amal[], tarix: TarixYozuvi | null) {
    const oz: Record<QatlamNomi, { qosh: any[]; yangila: any[]; ochir: string[] }> = {
      liniya: { qosh: [], yangila: [], ochir: [] }, qurilma: { qosh: [], yangila: [], ochir: [] },
    };
    const xossalar = (v: Xossalar) => {
      const r: Xossalar = {};
      for (const [k, x] of Object.entries(v)) if (k !== "Shape" && k !== "OBJECTID" && k !== "geometry") r[k] = boshmi(x) ? null : x;
      return r;
    };
    for (const a of amallar) {
      const v = a.qiymatlar || {};
      if (a.tur === "qosh") {
        oz[a.qatlam].qosh.push({ GLOBALID: v.GLOBALID, attributes: this.ayir(a.qatlam, xossalar(v)), geometry: Tahrir.shaklGeojson(a.qatlam, v.Shape) });
        continue;
      }
      const J: Map<number, { p: Xossalar }> = a.qatlam === "liniya" ? this.h.J.L : this.h.J.D;
      const gid = String(J.get(a.oid).p.GLOBALID);
      if (a.tur === "ochir") {
        oz[a.qatlam].ochir.push(gid);
        continue;
      }
      if ("Shape" in v) this.kopQismliEmas(gid);
      let bor = oz[a.qatlam].yangila.find((x) => x.GLOBALID === gid);
      if (!bor) {
        bor = { GLOBALID: gid, attributes: {} };
        oz[a.qatlam].yangila.push(bor);
      }
      Object.assign(bor.attributes, this.ayir(a.qatlam, xossalar(v)));
      if ("Shape" in v) bor.geometry = Tahrir.shaklGeojson(a.qatlam, v.Shape);
    }
    return { fl_ozgarishlar: oz, tarix };
  }

  private static tarix(amal: string, qatlam: string, gid: string | null, nomi: string, maydon: string | null,
    eski: string | null, yangi: string | null): TarixYozuvi {
    return { amal, qatlam, globalid: gid, nomi, qatorlar: [{ maydon, eski, yangi }], qoshimcha: [] };
  }

  // ------------------------------------------------------------ atributlar
  atribut(s: { globalid: string; qiymatlar: Xossalar; majburan?: boolean }) {
    this.majburanTekshir(!!s.majburan);
    const { qatlam, oid, g: gid } = this.topish(s.globalid);
    const turlar = this.tahrirlanadigan(qatlam);
    const row = qatlam === "liniya" ? this.h.J.L.get(oid) : this.h.J.D.get(oid);
    const ozgarish: Xossalar = {};
    for (const [k, v] of Object.entries(s.qiymatlar || {})) {
      if (!(k in turlar)) throw xato(`"${k}" maydonini tahrirlab bo'lmaydi`);
      const yangi = this.qiymatniAylantir(k, turlar[k], v);
      if (qatlam === "liniya" && k === "KUCHLANISH" && !LINIYA_KV.includes(yangi)) {
        throw xato(`Liniya kuchlanishi ${LINIYA_KV.map(g).join(", ")} kV dan biri bo'lishi kerak`);
      }
      if (!tengmi(this.qiymat(row.p, k), yangi)) ozgarish[k] = yangi;
    }
    if (!Object.keys(ozgarish).length) return { ok: true, ozgarishlar: 0, xabar: "Hech narsa o'zgarmadi" };

    // faqat liniya kuchlanishi ulanishga ta'sir qiladi (kv_ajrat qoidasi); boshqa maydonlar — yo'q
    let yangi: any[] = [], jiddiy: any[] = [];
    if (qatlam === "liniya" && "KUCHLANISH" in ozgarish) {
      ({ yangi, jiddiy } = this.bajar([{ tur: "yangila", qatlam, oid, qiymatlar: { KUCHLANISH: ozgarish.KUCHLANISH } }], {},
        !!s.majburan, "Bu o'zgarish tarmoqda yangi xato keltirib chiqaradi, shuning uchun saqlanmadi."));
    }
    const fla = this.ayir(qatlam, ozgarish);
    return {
      ok: true, ozgarishlar: Object.keys(ozgarish).length, guruh: null,
      xossalar: ozgarish, ogohlantirishlar: Tahrir.ogoh(yangi), majburan_saqlangan_xatolar: jiddiy.length,
      fl_ozgarishlar: { [qatlam]: { qosh: [], yangila: Object.keys(fla).length ? [{ GLOBALID: gid, attributes: fla }] : [], ochir: [] } },
      tarix: {
        amal: "atribut", qatlam, globalid: gid, nomi: String(ozgarish.NOMI || this.qiymat(row.p, "NOMI") || ""), qoshimcha: [],
        qatorlar: Object.entries(ozgarish).map(([k, v]) => ({ maydon: k, eski: pyStr(this.qiymat(row.p, k)), yangi: pyStr(v) })),
      },
    };
  }

  // ------------------------------------------------------------ qirqish
  /** a: koordinatalar. (A, B, vertexga_yopishdi). */
  private static bolish(a: XY[], x: number, y: number, tol: number): [XY[], XY[], boolean] {
    const p = [x, y];
    let i = 0, d0 = Infinity;
    const t: number[] = [], uz: number[] = [], proj: XY[] = [];
    for (let k = 0; k + 1 < a.length; k++) {
      const dx = a[k + 1][0] - a[k][0], dy = a[k + 1][1] - a[k][1];
      const u = Math.hypot(dx, dy);
      const tk = Math.max(0, Math.min(1, ((p[0] - a[k][0]) * dx + (p[1] - a[k][1]) * dy) / (u > 0 ? u * u : 1)));
      const q = [a[k][0] + dx * tk, a[k][1] + dy * tk];
      t.push(tk);
      uz.push(u);
      proj.push(q);
      const d = masofa(q, p);
      if (d < d0) { d0 = d; i = k; }
    }
    // mavjud ichki vertexga yaqin bo'lsa — o'shanga yopishamiz (yangi vertex qo'shmaymiz)
    if (a.length > 2) {
      let j = 1, dv = Infinity;
      for (let k = 1; k < a.length - 1; k++) {
        const d = masofa(a[k], p);
        if (d < dv) { dv = d; j = k; }
      }
      if (dv <= tol) return [a.slice(0, j + 1), a.slice(j), true];
    }
    const ti = t[i];
    if (ti * uz[i] < 1e-6 && i > 0) return [a.slice(0, i + 1), a.slice(i), true]; // aynan vertex ustida
    if ((1 - ti) * uz[i] < 1e-6 && i + 1 < a.length - 1) return [a.slice(0, i + 2), a.slice(i + 1), true];
    const q = proj[i];
    return [[...a.slice(0, i + 1), q], [q, ...a.slice(i + 1)], false];
  }

  /** Liniyani A va B bo'laklarga ajratish: A — asl qator (GLOBALID saqlanadi), B — yangi qator.
   *  boshiTerm/oxiriTerm: qirqilgan joyda A oxiri va B boshiga qo'yiladigan terminal (qurilma qo'yilganda). */
  private static qirqishAmallari(asl: Liniya, A: XY[], B: XY[], yangiOid: number, gidYangi: string,
    boshiTerm: number | null = null, oxiriTerm: number | null = null): Amal[] {
    const yangiQator: Xossalar = {
      ...asl.p, OBJECTID: yangiOid, GLOBALID: gidYangi, UZUNLIK_M: uzunlik(B),
      FROMDEVICETERMINAL: boshiTerm == null ? 0 : boshiTerm, TODEVICETERMINAL: asl.p.TODEVICETERMINAL, Shape: B,
    };
    return [
      { tur: "yangila", qatlam: "liniya", oid: asl.oid, qiymatlar: { Shape: A, UZUNLIK_M: uzunlik(A), TODEVICETERMINAL: oxiriTerm == null ? 0 : oxiriTerm } },
      { tur: "qosh", qatlam: "liniya", oid: yangiOid, qiymatlar: yangiQator },
    ];
  }

  private keyingiOid(q: QatlamNomi): number {
    let m = 0;
    for (const o of (q === "liniya" ? this.h.J.L : this.h.J.D).keys()) if (o > m) m = o;
    return m + 1;
  }

  qirqish(s: { globalid: string; lon: number; lat: number; tolerans_m?: number; sinov?: boolean; majburan?: boolean }) {
    this.majburanTekshir(!!s.majburan);
    const { qatlam, oid, g: gid } = this.topish(s.globalid);
    if (qatlam !== "liniya") throw xato("Faqat liniyani qirqish mumkin");
    this.kopQismliEmas(gid);
    const asl = this.h.J.L.get(oid);
    const [x, y] = utmga(s.lon, s.lat);
    const [A, B, vertexga] = Tahrir.bolish(asl.c, x, y, Math.max(s.tolerans_m ?? 1, 0.01));
    const la = uzunlik(A), lb = uzunlik(B);
    const korish = { nuqta: wgsga(A[A.length - 1][0], A[A.length - 1][1]), a_m: yaxlit(la, 2), b_m: yaxlit(lb, 2), vertexga, jami_m: yaxlit(la + lb, 2) };
    if (Math.min(la, lb) < ENG_QISQA_M) {
      throw xato(`Qirqish nuqtasi liniya uchiga juda yaqin (${Math.min(la, lb).toFixed(2)} m). Har bir bo'lak kamida ${ENG_QISQA_M} m bo'lishi kerak.`);
    }
    if (s.sinov) return { ok: true, sinov: true, ...korish };
    const gidY = yangiGid();
    const amallar = Tahrir.qirqishAmallari(asl, A, B, this.keyingiOid("liniya"), gidY);
    const { jiddiy } = this.bajar(amallar, { [gidY]: gid }, !!s.majburan,
      "Bu joyda qirqish tarmoqda yangi xato keltirib chiqaradi, shuning uchun bajarilmadi.");
    const t = Tahrir.tarix("qirqish", "liniya", gid, String(asl.p.NOMI || ""), "qirqish", `${(la + lb).toFixed(1)} m`,
      `${la.toFixed(1)} m + ${lb.toFixed(1)} m (yangi bo'lak ${gidY})`);
    return { ok: true, guruh: null, ...korish, globalid: gid, yangi_globalid: gidY, ...this.flQism(amallar, t), majburan_saqlangan_xatolar: jiddiy.length };
  }

  // ------------------------------------------------------------ qurilma qo'yish
  private static qurilmaKvMatni(ag: number, kvlar: number[]): string | null {
    const k = [...new Set(kvlar.map(Number))].sort((a, b) => b - a);
    const yuqori = k.filter((v) => v >= 6);
    if (ag === 2) return `${g(yuqori.length ? yuqori[0] : 10)}/0,4`;
    if (ag === 1) {
      const yuq = k.filter((v) => v >= 35);
      const past = k.filter((v) => v >= 6 && v < 35);
      return `${g(yuq.length ? yuq[0] : 35)}/${g(past.length ? past[0] : 10)}`;
    }
    return null;
  }

  /** (x, y) atrofidagi kvadratga (sindex.query(P.buffer(r))) tushadigan liniyalar. */
  private liniyalarKvadratda(x: number, y: number, r: number): Liniya[] {
    const { oids, ind } = liniyaIndeksi(this.h);
    return ind.quti(x - r, y - r, x + r, y + r).map((i) => this.h.J.L.get(oids[i]));
  }

  private qurilmalarKvadratda(x: number, y: number, r: number): Qurilma[] {
    const { oids, ind } = qurilmaIndeksi(this.h);
    return ind.quti(x - r, y - r, x + r, y + r).map((i) => this.h.J.D.get(oids[i]));
  }

  private qurilmaRejasi(s: { asset_group?: number; lon: number; lat: number; tolerans_m?: number }) {
    const ag = Number(s.asset_group ?? 2);
    if (!TERMINAL_TANLOV[ag]) throw xato("Hozircha faqat Transformator punkti va Podstansiya qo'yish mumkin");
    const tol = Math.max(Number(s.tolerans_m ?? 1), 0.01);
    const [x, y] = utmga(s.lon, s.lat);
    const P = [x, y];

    // 1) shu joyda boshqa qurilma bormi?
    const yaqinQ = this.qurilmalarKvadratda(x, y, Math.max(tol, TOLERANS));
    if (yaqinQ.length) {
      let r = yaqinQ[0];
      for (const q of yaqinQ) if (masofa([q.x, q.y], P) < masofa([r.x, r.y], P)) r = q;
      throw xato(`Bu joyda allaqachon qurilma bor: ${nomsiz(r.p.NOMI)} (${r.p.GLOBALID})`);
    }

    // 2) yopishish: liniya uchi > ichki vertex > liniya ustidagi eng yaqin nuqta
    let px = x, py = y, tanlangan: number | null = null;
    const variantlar: Array<[number, number, XY, number]> = [];
    for (const r of this.liniyalarKvadratda(x, y, tol)) {
      const c = r.c;
      for (const uch of [c[0], c[c.length - 1]]) {
        const d = masofa(uch, P);
        if (d <= tol) variantlar.push([0, d, uch, r.oid]);
      }
      for (const v of c.slice(1, -1)) {
        const d = masofa(v, P);
        if (d <= tol) variantlar.push([1, d, v, r.oid]);
      }
      const q = engYaqinNuqta(c, P);
      variantlar.push([2, masofa(q, P), q, r.oid]);
    }
    if (variantlar.length) {
      const eng = variantlar.reduce((a, b) => (b[0] < a[0] || (b[0] === a[0] && b[1] < a[1]) ? b : a));
      [px, py] = eng[2];
      tanlangan = eng[3];
    }
    const Q = [px, py];

    // 3) shu nuqtaga tegadigan barcha liniyalar (End vertex tolerans bilan)
    const tegadi = this.liniyalarKvadratda(px, py, TOLERANS * 1.01).filter((r) => chiziqMasofa(r.c, Q) <= TOLERANS);
    let keyingi = this.keyingiOid("liniya");
    const amallar: Amal[] = [], ulanishlar: any[] = [], otadi: any[] = [], kvlar: number[] = [];
    const almashtir: Record<string, string> = {};
    const nomlar = QURILMA_TURLARI[ag].terminallar;
    for (const r of tegadi) {
      const kv = Number(r.p.KUCHLANISH);
      const a = r.c;
      const d0 = masofa(a[0], Q), d1 = masofa(a[a.length - 1], Q);
      const uchida = d0 <= TOLERANS || d1 <= TOLERANS;
      const term = TERMINAL_TANLOV[ag][String(kv)];
      if (term == null && (uchida || r.oid === tanlangan)) {
        throw xato(`${QURILMA_TURLARI[ag].nomi} ga ${g(kv)} kV liniyani ulab bo'lmaydi (${nomsiz(r.p.NOMI)}). Kuchlanishni tekshiring.`);
      }
      if (term == null) {
        // o'rtadan o'tuvchi, mappingda yo'q kV — ulamaymiz
        otadi.push({ globalid: r.p.GLOBALID, nomi: r.p.NOMI, kv });
        continue;
      }
      const u: any = { globalid: r.p.GLOBALID, nomi: r.p.NOMI, kv, terminal: nomlar[term] };
      if (uchida) {
        const maydon = d0 <= d1 ? "FROMDEVICETERMINAL" : "TODEVICETERMINAL";
        if (Number(r.p[maydon] || 0)) throw xato(`Liniya uchi allaqachon boshqa qurilmaga ulangan: ${nomsiz(r.p.NOMI)}`);
        amallar.push({ tur: "yangila", qatlam: "liniya", oid: r.oid, qiymatlar: { [maydon]: term } });
        u.holat = "uchi ulanadi";
      } else if (r.oid !== tanlangan) {
        // bu liniya shu nuqtadan o'rtasi bilan o'tib ketadi — uni ulamaymiz (boshqa fider bo'lishi mumkin)
        otadi.push({ globalid: r.p.GLOBALID, nomi: r.p.NOMI, kv });
        continue;
      } else {
        const [A, B] = Tahrir.bolish(a, px, py, TOLERANS);
        if (Math.min(uzunlik(A), uzunlik(B)) < ENG_QISQA_M) {
          throw xato(`Qurilma liniya uchiga juda yaqin (${Math.min(uzunlik(A), uzunlik(B)).toFixed(2)} m) — uchiga yopishtirib qo'ying`);
        }
        const gidY = yangiGid();
        amallar.push(...Tahrir.qirqishAmallari(r, A, B, keyingi, gidY, term, term));
        almashtir[gidY] = r.p.GLOBALID;
        keyingi++;
        u.holat = `o'rtasidan qirqiladi (${uzunlik(A).toFixed(0)} m + ${uzunlik(B).toFixed(0)} m)`;
      }
      kvlar.push(kv);
      ulanishlar.push(u);
    }
    return { ag, x: px, y: py, amallar, ulanishlar, almashtir, otadi, kvlar, liniya: tanlangan != null ? this.h.J.L.get(tanlangan) : null };
  }

  private qurilmaMaydonlari(reja: ReturnType<Tahrir["qurilmaRejasi"]>) {
    const { ag, liniya } = reja;
    // kuchlanish matni ("10/0,4"): Feature Layerda bu maydon KUCHLANISH_N deb atalishi mumkin
    const qm = this.tahrirlanadigan("qurilma");
    const kvMaydon = !("KUCHLANISH" in qm) && "KUCHLANISH_N" in qm ? "KUCHLANISH_N" : "KUCHLANISH";
    const oldindan: Xossalar = { [kvMaydon]: Tahrir.qurilmaKvMatni(ag, reja.kvlar) };
    const birXil = [...this.h.J.D.values()].filter((q) => Number(q.p.ASSETGROUP) === ag);
    for (const k of ["VAZIFASI", "AYL_CHAST"]) {
      if (!ustunlar(this.h, "qurilma").has(k)) continue;
      const v = moda(birXil.map((q) => q.p[k]));
      if (v != null) oldindan[k] = v;
    }
    if (liniya) for (const k of ["TUMAN_ID", "VILOYAT_ID", "IDOR_MAN"]) if (k in liniya.p) oldindan[k] = this.qiymat(liniya.p, k);
    return this.formaQatorlari("qurilma", (k) => oldindan[k] ?? null,
      ["NOMI", "KUCHLANISH", "KUCHLANISH_N", "USKUNALAR_N_T", "USKUNA_TURI", "IDOR_MAN", "VAZIFASI"]);
  }

  qurilma(s: { asset_group?: number; lon: number; lat: number; tolerans_m?: number; sinov?: boolean; majburan?: boolean; qiymatlar?: Xossalar }) {
    this.majburanTekshir(!!s.majburan);
    const reja = this.qurilmaRejasi(s);
    const korish = { nuqta: wgsga(reja.x, reja.y), ulanishlar: reja.ulanishlar, otib_ketadi: reja.otadi, tur: QURILMA_TURLARI[reja.ag].nomi };
    if (s.sinov) return { ok: true, sinov: true, ...korish, maydonlar: this.qurilmaMaydonlari(reja) };

    // yangi qurilma qatori (tizim maydonlari mavjud qurilmalardagidek)
    const D = [...this.h.J.D.values()];
    const shablon = D.find((q) => Number(q.p.ASSETGROUP) === reja.ag && Number(q.p.ISSUBNETWORKCONTROLLER) === 0) ||
      D.find((q) => Number(q.p.ASSETGROUP) === reja.ag) || D[0];
    const turlar = this.tahrirlanadigan("qurilma");
    const q: Xossalar = {};
    for (const k of Object.keys(shablon?.p || {})) q[k] = null;
    Object.assign(q, {
      ASSETGROUP: reja.ag, ASSETTYPE: shablon?.p.ASSETTYPE ?? null, ASSOCIATIONSTATUS: 0, ISSUBNETWORKCONTROLLER: 0,
      ISCONNECTED: reja.ulanishlar.length ? 1 : 2, SUBNETWORKCONTROLLERNAME: "Unknown", TIERNAME: 0, TIERRANK: 0,
      TERMINALCONFIGURATION: shablon?.p.TERMINALCONFIGURATION ?? null,
      SUBNETWORKNAME: reja.liniya && !boshmi(reja.liniya.p.SUBNETWORKNAME) ? String(reja.liniya.p.SUBNETWORKNAME) : "Unknown",
      SUPPORTEDSUBNETWORKNAME: "Unknown", SUPPORTINGSUBNETWORKNAME: "Unknown",
    });
    for (const [k, v] of Object.entries(s.qiymatlar || {})) {
      if (!(k in turlar)) throw xato(`"${k}" maydonini to'ldirib bo'lmaydi`);
      q[k] = this.qiymatniAylantir(k, turlar[k], v);
    }
    const oid = this.keyingiOid("qurilma");
    const gid = yangiGid();
    Object.assign(q, { OBJECTID: oid, GLOBALID: gid, Shape: [reja.x, reja.y] });
    const amallar: Amal[] = [{ tur: "qosh", qatlam: "qurilma", oid, qiymatlar: q }, ...reja.amallar];
    const { yangi, jiddiy } = this.bajar(amallar, reja.almashtir, !!s.majburan,
      "Bu qurilma tarmoqda yangi xato keltirib chiqaradi, shuning uchun qo'yilmadi.");
    const ul = reja.ulanishlar.map((u) => `${nomsiz(u.nomi)} ${g(u.kv)} kV → ${u.terminal}`).join("; ") || "ulanmagan";
    const t = Tahrir.tarix("qurilma", "qurilma", gid, String(q.NOMI || ""), "qo'yildi", null, `${korish.tur} · ${ul}`);
    return {
      ok: true, guruh: null, ...korish, globalid: gid, ...this.flQism(amallar, t),
      majburan_saqlangan_xatolar: jiddiy.length, ogohlantirishlar: Tahrir.ogoh(yangi),
    };
  }

  // ------------------------------------------------------------ liniya chizish
  /** Chizilgan liniya uchini eng yaqin obyektga yopishtiradi.
   *  Ustuvorlik: qurilma > liniya uchi > liniya ichki vertexi > liniya ustidagi nuqta > hech narsa. */
  private uchYopish(x: number, y: number, tol: number, chetla: Set<number> = new Set()): any {
    const P = [x, y];
    const yq = this.qurilmalarKvadratda(x, y, tol);
    if (yq.length) {
      let r = yq[0];
      for (const q of yq) if (masofa([q.x, q.y], P) < masofa([r.x, r.y], P)) r = q;
      return { tur: "qurilma", oid: r.oid, globalid: r.p.GLOBALID, nomi: r.p.NOMI, ag: Number(r.p.ASSETGROUP), x: r.x, y: r.y };
    }
    const variantlar: Array<[number, number, XY, number]> = [];
    for (const r of this.liniyalarKvadratda(x, y, tol)) {
      if (chetla.has(r.oid)) continue;
      const c = r.c;
      for (const uch of [c[0], c[c.length - 1]]) {
        const d = masofa(uch, P);
        if (d <= tol) variantlar.push([0, d, uch, r.oid]);
      }
      for (const v of c.slice(1, -1)) {
        const d = masofa(v, P);
        if (d <= tol) variantlar.push([1, d, v, r.oid]);
      }
      const q = engYaqinNuqta(c, P);
      if (masofa(q, P) <= tol) variantlar.push([2, masofa(q, P), q, r.oid]);
    }
    if (!variantlar.length) return { tur: "bosh", x, y };
    const [ust, , nuq, o] = variantlar.reduce((a, b) => (b[0] < a[0] || (b[0] === a[0] && b[1] < a[1]) ? b : a));
    const r = this.h.J.L.get(o);
    return {
      tur: ust === 0 ? "liniya_uchi" : "liniya_ortasi", oid: o, globalid: r.p.GLOBALID, nomi: r.p.NOMI,
      kv: Number(r.p.KUCHLANISH), x: nuq[0], y: nuq[1],
    };
  }

  private static uchMatni(u: any): string {
    if (u.tur === "qurilma") return `${QURILMA_TURLARI[u.ag].nomi} «${nomsiz(u.nomi)}» → ${u.terminal ?? "?"} terminali`;
    if (u.tur === "liniya_uchi") return `«${nomsiz(u.nomi)}» (${g(u.kv)} kV) uchiga ulanadi`;
    if (u.tur === "liniya_ortasi") return `«${nomsiz(u.nomi)}» (${g(u.kv)} kV) o'rtasiga ulanadi — u liniya shu joyda qirqiladi`;
    return "hech narsaga ulanmagan (bo'sh uch)";
  }

  /** Ketma-ket takrorlangan nuqtalarni olib tashlaydi (UN21). */
  private static toza(pts: XY[]): XY[] {
    const t = [pts[0]];
    for (const p of pts.slice(1)) if (masofa(p, t[t.length - 1]) > 0.001) t.push(p);
    return t;
  }

  private liniyaRejasi(koordinatalar: number[][], tolerans: number, kv0: number | null) {
    let pts: XY[] = koordinatalar.map(([lon, lat]) => utmga(Number(lon), Number(lat)));
    if (pts.length < 2) throw xato("Liniya uchun kamida 2 ta nuqta kerak");
    const tol = Math.max(Number(tolerans), 0.01);
    const u0 = this.uchYopish(pts[0][0], pts[0][1], tol);
    const u1 = this.uchYopish(pts[pts.length - 1][0], pts[pts.length - 1][1], tol);
    pts[0] = [u0.x, u0.y];
    pts[pts.length - 1] = [u1.x, u1.y];
    pts = Tahrir.toza(pts);
    if (pts.length < 2 || uzunlik(pts) < ENG_QISQA_M) throw xato(`Liniya juda qisqa (kamida ${ENG_QISQA_M} m bo'lishi kerak)`);
    const uchlar = [u0, u1];
    if (u0.tur === "liniya_ortasi" && u1.tur === "liniya_ortasi" && u0.oid === u1.oid) {
      throw xato("Ikkala uch bitta liniyaning o'rtasiga tushdi — bunday ulanish hozircha qo'llanmaydi");
    }
    if (u0.tur === "qurilma" && u1.tur === "qurilma" && u0.oid === u1.oid) throw xato("Ikkala uch bitta qurilmaga tushdi");

    // kuchlanish: ulanadigan liniyadan; bo'lmasa qurilmaga qarab taklif
    const linKv = uchlar.filter((u) => u.tur.startsWith("liniya")).map((u) => u.kv);
    if (new Set(linKv).size > 1) {
      throw xato(`Uchlar turli kuchlanishdagi liniyalarga tushdi (${linKv.map(g).join(" va ")} kV). Ular orasida TP yoki podstansiya bo'lishi kerak.`);
    }
    let taklif = 10;
    if (linKv.length) taklif = linKv[0];
    else {
      const ags = uchlar.filter((u) => u.tur === "qurilma").map((u) => u.ag);
      if (ags.length) taklif = ({ 2: 0.4, 1: 10, 3: 110 } as Record<number, number>)[ags[0]] ?? 10;
    }
    const kv = kv0 != null ? Number(kv0) : taklif;
    for (const u of uchlar) {
      if (u.tur.startsWith("liniya") && u.kv !== kv) {
        throw xato(`Yangi liniya ${g(kv)} kV, lekin u ulanayotgan "${nomsiz(u.nomi)}" ${g(u.kv)} kV. Turli kuchlanishdagi liniyalar faqat qurilma orqali ulanadi.`);
      }
    }
    const terminallar = [0, 0];
    uchlar.forEach((u, i) => {
      if (u.tur !== "qurilma") return;
      const t = LINIYA_TERMINAL[u.ag]?.[String(kv)];
      if (t == null) throw xato(`${QURILMA_TURLARI[u.ag].nomi} (${nomsiz(u.nomi)}) ga ${g(kv)} kV liniyani ulab bo'lmaydi`);
      terminallar[i] = t;
      u.terminal = QURILMA_TURLARI[u.ag].terminallar[t];
    });
    return { pts, uchlar, kv, taklif, terminallar };
  }

  private liniyaMaydonlari(reja: ReturnType<Tahrir["liniyaRejasi"]>) {
    const L = [...this.h.J.L.values()];
    const lu = ustunlar(this.h, "liniya");
    const oldindan: Xossalar = { KUCHLANISH: reja.kv };
    const qoshni = reja.uchlar.find((u) => u.tur.startsWith("liniya"));
    if (qoshni) {
      const r = this.h.J.L.get(qoshni.oid);
      for (const k of ["NOMI", "VAZIFASI", "SIMNING_M", "TAYANCHLAR_T", "TAYANCH_TURI", "IDOR_MAN", "TUMAN_ID", "VILOYAT_ID"]) oldindan[k] = this.qiymat(r.p, k);
    } else {
      const q = reja.uchlar.find((u) => u.tur === "qurilma");
      if (q) {
        const r = this.h.J.D.get(q.oid);
        for (const k of ["IDOR_MAN", "TUMAN_ID", "VILOYAT_ID"]) oldindan[k] = this.qiymat(r.p, k);
      }
      if (lu.has("VAZIFASI")) {
        const v = moda(L.filter((r) => Number(r.p.KUCHLANISH) === reja.kv).map((r) => r.p.VAZIFASI));
        if (v != null) oldindan.VAZIFASI = v;
      }
    }
    // qo'shnisida bo'lmasa — qatlamda eng ko'p uchraydigan qiymat (idora, viloyat, tuman)
    for (const k of ["IDOR_MAN", "VILOYAT_ID", "TUMAN_ID"]) {
      if ((oldindan[k] == null || oldindan[k] === "") && lu.has(k)) {
        const v = moda(L.map((r) => r.p[k]).filter((x) => !boshmi(x) && String(x) !== ""));
        if (v != null) oldindan[k] = v;
      }
    }
    return this.formaQatorlari("liniya", (k) => oldindan[k] ?? null,
      ["NOMI", "KUCHLANISH", "SIMNING_M", "TAYANCHLAR_T", "TAYANCH_TURI", "IDOR_MAN"]);
  }

  /** O'rtasiga tushgan uch — o'sha liniyani qirqish amallari. */
  private ortasidanQirq(u: any, keyingi: number, amallar: Amal[], almashtir: Record<string, string>) {
    const asl = this.h.J.L.get(u.oid);
    const [A, B] = Tahrir.bolish(asl.c, u.x, u.y, TOLERANS);
    if (Math.min(uzunlik(A), uzunlik(B)) < ENG_QISQA_M) throw xato(`«${nomsiz(u.nomi)}» uchiga juda yaqin — uchiga yopishtiring`);
    const gidY = yangiGid();
    amallar.push(...Tahrir.qirqishAmallari(asl, A, B, keyingi, gidY));
    almashtir[gidY] = u.globalid;
  }

  liniya(s: { koordinatalar: number[][]; tolerans_m?: number; kuchlanish?: number | null; sinov?: boolean; majburan?: boolean; qiymatlar?: Xossalar }) {
    this.majburanTekshir(!!s.majburan);
    const turlar = this.tahrirlanadigan("liniya");
    const qiymatlar = s.qiymatlar || {};
    let kv: any = s.kuchlanish ?? null;
    if (!s.sinov && qiymatlar.KUCHLANISH != null && qiymatlar.KUCHLANISH !== "") {
      kv = this.qiymatniAylantir("KUCHLANISH", turlar.KUCHLANISH || "DOUBLE", qiymatlar.KUCHLANISH);
    }
    if (kv != null && !LINIYA_KV.includes(Number(kv))) {
      throw xato(`Liniya kuchlanishi ${LINIYA_KV.map(g).join(", ")} kV dan biri bo'lishi kerak`);
    }
    const reja = this.liniyaRejasi(s.koordinatalar, s.tolerans_m ?? 1, kv);
    const { pts } = reja;
    const korish = {
      koordinatalar: pts.map(([x, y]) => wgsga(x, y)), uzunlik_m: yaxlit(uzunlik(pts), 1), kuchlanish: reja.kv,
      taklif_kv: reja.taklif, uchlar: reja.uchlar.map((u) => ({ tur: u.tur, globalid: u.globalid ?? null, matn: Tahrir.uchMatni(u) })),
    };
    if (s.sinov) return { ok: true, sinov: true, ...korish, maydonlar: this.liniyaMaydonlari(reja) };

    const L = [...this.h.J.L.values()];
    let keyingi = this.keyingiOid("liniya");
    const amallar: Amal[] = [];
    const almashtir: Record<string, string> = {};
    // o'rtasiga tushgan uchlar — o'sha liniyani qirqamiz
    for (const u of reja.uchlar) if (u.tur === "liniya_ortasi") this.ortasidanQirq(u, keyingi++, amallar, almashtir);
    // shablon: shu kuchlanishdagi mavjud liniya (tizim maydonlari uchun)
    const qoshni = reja.uchlar.find((u) => u.tur.startsWith("liniya"));
    const shablon = qoshni ? this.h.J.L.get(qoshni.oid) : L.find((r) => Number(r.p.KUCHLANISH) === reja.kv) || L[0];
    const ulangan = reja.uchlar.some((u) => u.tur !== "bosh");
    const q: Xossalar = {};
    for (const k of Object.keys(shablon.p)) q[k] = null;
    Object.assign(q, {
      ASSETGROUP: shablon.p.ASSETGROUP ?? null, ASSETTYPE: shablon.p.ASSETTYPE ?? null, ASSOCIATIONSTATUS: 0,
      ISCONNECTED: ulangan ? 1 : 2, FLOWDIRECTION: shablon.p.FLOWDIRECTION ?? null,
      SUBNETWORKNAME: qoshni ? shablon.p.SUBNETWORKNAME ?? null : "Unknown",
      SUPPORTEDSUBNETWORKNAME: "Unknown", SUPPORTINGSUBNETWORKNAME: "Unknown",
    });
    for (const [k, v] of Object.entries(qiymatlar)) {
      if (!(k in turlar)) throw xato(`"${k}" maydonini to'ldirib bo'lmaydi`);
      q[k] = this.qiymatniAylantir(k, turlar[k], v);
    }
    const gid = yangiGid();
    Object.assign(q, {
      OBJECTID: keyingi, GLOBALID: gid, KUCHLANISH: Number(reja.kv), UZUNLIK_M: uzunlik(pts),
      FROMDEVICETERMINAL: reja.terminallar[0], TODEVICETERMINAL: reja.terminallar[1], Shape: pts,
    });
    amallar.push({ tur: "qosh", qatlam: "liniya", oid: keyingi, qiymatlar: q });
    const { yangi, jiddiy } = this.bajar(amallar, almashtir, !!s.majburan,
      "Bu liniya tarmoqda yangi xato keltirib chiqaradi, shuning uchun saqlanmadi.");
    const t = Tahrir.tarix("liniya", "liniya", gid, String(q.NOMI || ""), "chizildi", null,
      `${g(reja.kv)} kV · ${uzunlik(pts).toFixed(1)} m · boshi: ${Tahrir.uchMatni(reja.uchlar[0])}; oxiri: ${Tahrir.uchMatni(reja.uchlar[1])}`);
    return {
      ok: true, guruh: null, ...korish, globalid: gid, ...this.flQism(amallar, t),
      majburan_saqlangan_xatolar: jiddiy.length, ogohlantirishlar: Tahrir.ogoh(yangi),
    };
  }

  // ------------------------------------------------------------ ko'chirish va o'chirish
  /** (x, y) nuqtada uchi turgan liniyalar: [oid, 0 yoki -1]. */
  private nuqtadagiUchlar(x: number, y: number, chetla: Set<number> = new Set()): Array<[number, number]> {
    const P = [x, y];
    const natija: Array<[number, number]> = [];
    for (const r of this.liniyalarKvadratda(x, y, TOLERANS * 1.01)) {
      if (chetla.has(r.oid)) continue;
      if (masofa(r.c[0], P) <= TOLERANS) natija.push([r.oid, 0]);
      if (masofa(r.c[r.c.length - 1], P) <= TOLERANS) natija.push([r.oid, -1]);
    }
    return natija;
  }

  kochirish(s: { globalid: string; lon: number; lat: number; sinov?: boolean; majburan?: boolean }) {
    this.majburanTekshir(!!s.majburan);
    const { qatlam, oid, g: gid } = this.topish(s.globalid);
    if (qatlam !== "qurilma") throw xato("Bu so'rov faqat qurilma uchun. Liniyani ko'chirish uchun uning vertexlarini suring.");
    const asl = this.h.J.D.get(oid);
    const x0 = asl.x, y0 = asl.y;
    const [x, y] = utmga(s.lon, s.lat);
    const m = Math.hypot(x - x0, y - y0);
    if (m < 0.01) throw xato("Qurilma joyidan siljimadi");
    const yaqin = this.qurilmalarKvadratda(x, y, 0.5).filter((q) => q.oid !== oid && masofa([q.x, q.y], [x, y]) <= 0.5);
    if (yaqin.length) throw xato(`Yangi joyda boshqa qurilma bor: ${nomsiz(yaqin[0].p.NOMI)}`);
    const amallar: Amal[] = [{ tur: "yangila", qatlam: "qurilma", oid, qiymatlar: { Shape: [x, y] } }];
    const surilgan: string[] = [];
    for (const [lo, idx] of this.nuqtadagiUchlar(x0, y0)) {
      const r = this.h.J.L.get(lo);
      const la = r.c.map((p) => [...p]);
      la[idx === 0 ? 0 : la.length - 1] = [x, y];
      if (uzunlik(la) < ENG_QISQA_M) throw xato(`«${nomsiz(r.p.NOMI)}» liniyasi juda qisqarib qoladi`);
      amallar.push({ tur: "yangila", qatlam: "liniya", oid: lo, qiymatlar: { Shape: la, UZUNLIK_M: uzunlik(la) } });
      surilgan.push(nomsiz(r.p.NOMI));
    }
    const korish = { masofa_m: yaxlit(m, 1), liniyalar: surilgan, nuqta: [s.lon, s.lat] };
    if (s.sinov) {
      // oldindan ko'rish uchun surilgan liniyalarning yangi shakli
      return { ok: true, sinov: true, ...korish, oldindan: amallar.slice(1).map((a) => (a.qiymatlar.Shape as XY[]).map(([px, py]) => wgsga(px, py))) };
    }
    const { yangi, jiddiy } = this.bajar(amallar, {}, !!s.majburan,
      "Bu joyga ko'chirish tarmoqda yangi xato keltirib chiqaradi, shuning uchun bajarilmadi.");
    const t = Tahrir.tarix("kochirish", "qurilma", gid, String(asl.p.NOMI || ""), "ko'chirildi", null,
      `${m.toFixed(1)} m ga ko'chirildi` + (surilgan.length ? `, ${surilgan.length} ta liniya uchi birga surildi` : ""));
    return {
      ok: true, guruh: null, ...korish, globalid: gid, ...this.flQism(amallar, t),
      majburan_saqlangan_xatolar: jiddiy.length, ogohlantirishlar: Tahrir.ogoh(yangi),
    };
  }

  geometriya(s: { globalid: string; koordinatalar: number[][]; tolerans_m?: number; sinov?: boolean; majburan?: boolean }) {
    this.majburanTekshir(!!s.majburan);
    const { qatlam, oid, g: gid } = this.topish(s.globalid);
    if (qatlam !== "liniya") throw xato("Bu so'rov faqat liniya uchun");
    this.kopQismliEmas(gid);
    const asl = this.h.J.L.get(oid);
    const kv = Number(asl.p.KUCHLANISH);
    const a = asl.c;
    let pts: XY[] = (s.koordinatalar || []).map(([lon, lat]) => utmga(Number(lon), Number(lat)));
    if (pts.length < 2) throw xato("Liniyada kamida 2 ta nuqta bo'lishi kerak");
    const tol = Math.max(Number(s.tolerans_m ?? 1), 0.01);
    const terminallar = [Number(asl.p.FROMDEVICETERMINAL || 0), Number(asl.p.TODEVICETERMINAL || 0)];
    const uchlar: any[] = [], amallar: Amal[] = [];
    const almashtir: Record<string, string> = {};
    let keyingi = this.keyingiOid("liniya");
    for (const [i, eski] of [[0, a[0]], [1, a[a.length - 1]]] as Array<[number, XY]>) {
      const idx = i === 0 ? 0 : pts.length - 1;
      if (masofa(pts[idx], eski) <= Math.max(TOLERANS, 0.005)) {
        pts[idx] = eski; // uch joyida qoldi — ulanishi o'zgarmaydi
        uchlar.push({ tur: "ozgarmadi", matn: "joyida qoldi, ulanishi o'zgarmaydi" });
        continue;
      }
      const u = this.uchYopish(pts[idx][0], pts[idx][1], tol, new Set([oid]));
      pts[idx] = [u.x, u.y];
      terminallar[i] = 0;
      if (u.tur.startsWith("liniya") && u.kv !== kv) {
        throw xato(`Bu liniya ${g(kv)} kV, lekin uchi tushgan «${nomsiz(u.nomi)}» ${g(u.kv)} kV. Turli kuchlanishdagi liniyalar faqat qurilma orqali ulanadi.`);
      }
      if (u.tur === "qurilma") {
        const t = LINIYA_TERMINAL[u.ag]?.[String(kv)];
        if (t == null) throw xato(`${QURILMA_TURLARI[u.ag].nomi} (${nomsiz(u.nomi)}) ga ${g(kv)} kV liniyani ulab bo'lmaydi`);
        terminallar[i] = t;
        u.terminal = QURILMA_TURLARI[u.ag].terminallar[t];
      }
      if (u.tur === "liniya_ortasi") {
        if (uchlar.some((x) => x.oid === u.oid && x.tur === "liniya_ortasi")) throw xato("Ikkala uch bitta liniyaning o'rtasiga tushdi");
        this.ortasidanQirq(u, keyingi++, amallar, almashtir);
      }
      u.matn = Tahrir.uchMatni(u);
      uchlar.push(u);
    }
    pts = Tahrir.toza(pts);
    if (pts.length < 2 || uzunlik(pts) < ENG_QISQA_M) throw xato(`Liniya juda qisqa (kamida ${ENG_QISQA_M} m)`);
    const korish = {
      koordinatalar: pts.map(([x, y]) => wgsga(x, y)), uzunlik_m: yaxlit(uzunlik(pts), 1), eski_uzunlik_m: yaxlit(uzunlik(a), 1),
      uchlar: uchlar.map((u) => ({ tur: u.tur, globalid: u.globalid ?? null, matn: u.matn })),
    };
    if (s.sinov) return { ok: true, sinov: true, ...korish };
    amallar.unshift({
      tur: "yangila", qatlam: "liniya", oid, qiymatlar: {
        Shape: pts, UZUNLIK_M: uzunlik(pts), FROMDEVICETERMINAL: terminallar[0], TODEVICETERMINAL: terminallar[1],
      },
    });
    const { yangi, jiddiy } = this.bajar(amallar, almashtir, !!s.majburan,
      "Bu o'zgarish tarmoqda yangi xato keltirib chiqaradi, shuning uchun saqlanmadi.");
    const t = Tahrir.tarix("geometriya", "liniya", gid, String(asl.p.NOMI || ""), "shakli", `${uzunlik(a).toFixed(1)} m`, `${uzunlik(pts).toFixed(1)} m`);
    return {
      ok: true, guruh: null, ...korish, globalid: gid, ...this.flQism(amallar, t),
      majburan_saqlangan_xatolar: jiddiy.length, ogohlantirishlar: Tahrir.ogoh(yangi),
    };
  }

  ochirish(s: { globalidlar: string[]; sinov?: boolean; majburan?: boolean }) {
    this.majburanTekshir(!!s.majburan);
    if (!s.globalidlar?.length) throw xato("O'chiriladigan obyekt tanlanmagan");
    if (s.globalidlar.length > 200) throw xato("Bir martada ko'pi bilan 200 ta obyekt o'chiriladi");
    const { L, D } = this.h.J;
    const topilgan = [...new Set(s.globalidlar)].map((x) => this.topish(x));
    const ochirL = new Set(topilgan.filter((x) => x.qatlam === "liniya").map((x) => x.oid));
    const ochirQ = [...new Set(topilgan.filter((x) => x.qatlam === "qurilma").map((x) => x.oid))].sort((a, b) => a - b);
    const royxat: any[] = [], ogoh: string[] = [];
    // qurilma o'chirilsa — unga ulangan liniyalarning terminali tozalanadi
    const terminalToza = new Map<number, Xossalar>();
    for (const oid of ochirQ) {
      const r = D.get(oid);
      for (const [lo, idx] of this.nuqtadagiUchlar(r.x, r.y, ochirL)) {
        const maydon = idx === 0 ? "FROMDEVICETERMINAL" : "TODEVICETERMINAL";
        if (Number(L.get(lo).p[maydon] || 0)) {
          if (!terminalToza.has(lo)) terminalToza.set(lo, {});
          terminalToza.get(lo)[maydon] = 0;
        }
      }
      if (Number(r.p.ISSUBNETWORKCONTROLLER || 0) === 1) {
        ogoh.push(`«${nomsiz(r.p.NOMI)}» — fider boshi (subnetwork controller). O'chirilsa, uning fiderlari manbasiz qoladi.`);
      }
      royxat.push({ globalid: r.p.GLOBALID, tur: QURILMA_TURLARI[Number(r.p.ASSETGROUP)]?.nomi || "?", nomi: r.p.NOMI, kv: this.qiymat(r.p, "KUCHLANISH") });
    }
    for (const oid of ochirL) {
      const r = L.get(oid);
      royxat.push({ globalid: r.p.GLOBALID, tur: "Liniya", nomi: r.p.NOMI, kv: this.qiymat(r.p, "KUCHLANISH"), uzunlik_m: yaxlit(Number(r.p.UZUNLIK_M || 0), 1) });
    }
    const korish = { obyektlar_royxati: royxat, tozalanadigan_terminallar: terminalToza.size, ogohlantirish: ogoh };
    if (s.sinov) return { ok: true, sinov: true, ...korish };
    const amallar: Amal[] = [
      ...[...terminalToza].map(([lo, q]): Amal => ({ tur: "yangila", qatlam: "liniya", oid: lo, qiymatlar: q })),
      ...[...ochirL].sort((a, b) => a - b).map((o): Amal => ({ tur: "ochir", qatlam: "liniya", oid: o })),
      ...ochirQ.map((o): Amal => ({ tur: "ochir", qatlam: "qurilma", oid: o })),
    ];
    const ochirilgan = amallar.filter((a) => a.tur === "ochir").map((a) => String((a.qatlam === "liniya" ? L : D).get(a.oid).p.GLOBALID));
    const { jiddiy } = this.bajar(amallar, {}, !!s.majburan, "O'chirish tarmoqda yangi xato keltirib chiqaradi, shuning uchun bajarilmadi.");
    const b = royxat[0];
    const matn = royxat.slice(0, 10).map((x) => `${x.tur} «${nomsiz(x.nomi)}»`).join("; ") + (royxat.length > 10 ? ` va yana ${royxat.length - 10} ta` : "");
    const t = Tahrir.tarix("ochirish", b.tur === "Liniya" ? "liniya" : "qurilma", b.globalid,
      royxat.length > 1 ? `${royxat.length} ta obyekt` : String(b.nomi || ""), "o'chirildi", matn, null);
    return { ok: true, guruh: null, ...korish, ochirilgan, ...this.flQism(amallar, t), majburan_saqlangan_xatolar: jiddiy.length };
  }
}
