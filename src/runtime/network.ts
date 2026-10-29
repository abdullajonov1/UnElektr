/** Feature Layerdan olingan tarmoq nusxasi: GLOBALID / OBJECTID bo'yicha qidirish, jadval qatorlari. */
import { normalizeGlobalId, type GeoJsonFC } from "./fl-oqish";
import { joriyTil, t, tx } from "./i18n";


export type Qatlam = "liniya" | "qurilma";

/** ASSETGROUP → qurilma turi (UN_Dvigatel graf.py dagidek). */
export const QURILMA_TURI: Record<number, string> = {
  1: "Podstansiya",
  2: "Transformator",
  3: "Tashqi_manba",
  4: "Viklyuchatel",
};

export interface Feat {
  gid: string;
  oid: number;
  qatlam: Qatlam;
  /** "liniya" yoki qurilma turi (Podstansiya, Transformator, ...). */
  tur: string;
  /** Atributlar, nomlari KATTA harfda (dvigateldagidek). */
  p: Record<string, any>;
  /** Feature Layerdagi asl atributlar (asl nomlari bilan). */
  raw: Record<string, any>;
  /** GeoJSON geometriya (WGS84). */
  geom: any;
  /** Feature Layerga hali yozilmagan (brauzerda mahalliy saqlangan) holat. */
  mahalliy?: boolean;
}

export function upperProps(attrs: Record<string, any>): Record<string, any> {
  const p: Record<string, any> = {};
  for (const [k, v] of Object.entries(attrs || {})) {
    const K = k.toUpperCase();
    if (!(K in p)) p[K] = v;
  }
  return p;
}

export class Tarmoq {
  byGid = new Map<string, Feat>();
  byOid: Record<Qatlam, Map<number, Feat>> = { liniya: new Map(), qurilma: new Map() };
  lines: Feat[] = [];
  devices: Feat[] = [];

  static from(lfc: GeoJsonFC, dfc: GeoJsonFC, lineOid: string, devOid: string, mahalliy: Set<string> = new Set()): Tarmoq {
    const t = new Tarmoq();
    const qosh = (fc: GeoJsonFC, qatlam: Qatlam, oidField: string) => {
      for (const f of fc.features || []) {
        if (!f.geometry) continue;
        const raw = f.properties || {};
        const p = upperProps(raw);
        // liniya KUCHLANISH Feature Layerda butun son: 0.4 kV unda 0 deb saqlanadi
        if (qatlam === "liniya" && p.KUCHLANISH != null && p.KUCHLANISH !== "" && Number(p.KUCHLANISH) === 0) p.KUCHLANISH = 0.4;
        const gid = normalizeGlobalId(p.GLOBALID || "");
        if (!gid) continue;
        const oid = Number(raw[oidField] ?? p.OBJECTID);
        const tur = qatlam === "liniya" ? "liniya" : QURILMA_TURI[Number(p.ASSETGROUP)] || "?";
        const feat: Feat = { gid, oid, qatlam, tur, p, raw, geom: f.geometry, mahalliy: mahalliy.has(gid) };
        t.byGid.set(gid, feat);
        t.byOid[qatlam].set(oid, feat);
        (qatlam === "liniya" ? t.lines : t.devices).push(feat);
      }
    };
    qosh(lfc, "liniya", lineOid);
    qosh(dfc, "qurilma", devOid);
    return t;
  }

  get(gid: string): Feat | undefined {
    return this.byGid.get(normalizeGlobalId(gid));
  }
}

// ---------------------------------------------------------------- mahalliy (Feature Layerga hali yozilmagan) o'zgarishlar
export interface Ustma {
  /** Mahalliy qo'shilgan yoki o'zgartirilgan obyektlar (GLOBALID) — xaritada alohida chiziladi. */
  mahalliy: Set<string>;
  /** Feature Layerdagi asl nusxasi yashiriladigan obyektlar (mahalliy o'zgartirilgan yoki o'chirilgan) — OBJECTID. */
  yashirin: Record<Qatlam, number[]>;
}

/**
 * Brauzerda saqlangan (Feature Layerga hali yozilmagan) o'zgarishlar to'plamlarini tartib bo'yicha
 * Feature Layer GeoJSON nusxasi ustiga qo'yadi.
 * fcs joyida o'zgaradi. Qo'shilgan obyektlar vaqtinchalik manfiy OBJECTID oladi.
 */
export function ustigaQolla(fcs: Record<Qatlam, GeoJsonFC>, toplamlar: any[], oidF: Record<Qatlam, string>): Ustma {
  const u: Ustma = { mahalliy: new Set(), yashirin: { liniya: [], qurilma: [] } };
  let vaqtinchalik = -1;
  for (const qatlam of ["liniya", "qurilma"] as Qatlam[]) {
    const fc = fcs[qatlam];
    const gidOf = (f: any) => normalizeGlobalId(upperProps(f.properties).GLOBALID || "");
    const idx = new Map<string, number>();
    fc.features.forEach((f, i) => idx.set(gidOf(f), i));
    const yashir = (f: any) => {
      const oid = Number(f.properties[oidF[qatlam]] ?? upperProps(f.properties).OBJECTID);
      if (oid > 0 && !u.yashirin[qatlam].includes(oid)) u.yashirin[qatlam].push(oid);
    };
    for (const t of toplamlar) {
      const oz = t?.[qatlam];
      if (!oz) continue;
      for (const q of oz.qosh || []) {
        const gid = normalizeGlobalId(q.GLOBALID || q.attributes?.GLOBALID || "");
        const p = { ...q.attributes, GLOBALID: gid, [oidF[qatlam]]: vaqtinchalik-- };
        idx.set(gid, fc.features.push({ type: "Feature", geometry: q.geometry, properties: p }) - 1);
        u.mahalliy.add(gid);
      }
      for (const y of oz.yangila || []) {
        const gid = normalizeGlobalId(y.GLOBALID);
        const i = idx.get(gid);
        if (i == null || !fc.features[i]) continue;
        const f = fc.features[i];
        const p = { ...f.properties };
        for (const [k, v] of Object.entries(y.attributes || {})) {
          const bor = Object.keys(p).find((x) => x.toUpperCase() === k.toUpperCase());
          p[bor || k] = v;
        }
        yashir(f);
        fc.features[i] = { ...f, properties: p, geometry: y.geometry || f.geometry };
        u.mahalliy.add(gid);
      }
      for (const g of oz.ochir || []) {
        const gid = normalizeGlobalId(g);
        const i = idx.get(gid);
        if (i == null || !fc.features[i]) continue;
        yashir(fc.features[i]);
        fc.features[i] = null;
        idx.delete(gid);
        u.mahalliy.delete(gid);
      }
    }
    fc.features = fc.features.filter(Boolean);
  }
  return u;
}

// ---------------------------------------------------------------- matn ko'rinishi (ilova.js dagidek)

export const kvMatn = (k: any): string =>
  k == null || k === "" ? "" : typeof k === "number" ? `${String(k).replace(".", ",")} ${joriyTil() === "uz" ? "kV" : "кВ"}` : String(k);
const TUR_NOMI: Record<string, string> = {
  liniya: "Liniya", Liniya: "Liniya", Tashqi_manba: "Tashqi manba", Transformator: "Transformator punkti",
  Podstansiya: "Podstansiya", Viklyuchatel: "Viklyuchatel",
};
export const turMatn = (x: any): string => (TUR_NOMI[x] ? t(TUR_NOMI[x]) : tx(String(x ?? "")));
export const nomi = (f: Feat | undefined): string => (f && f.p.NOMI) || t("(nomsiz)");

/** Uzunlik (m) — WGS84 koordinatalardan, sferik formula. */
export function uzunlikM(geom: any): number {
  const yollar: number[][][] =
    geom?.type === "LineString" ? [geom.coordinates] : geom?.type === "MultiLineString" ? geom.coordinates : [];
  let s = 0;
  for (const yol of yollar) {
    for (let i = 1; i < yol.length; i++) {
      const [x1, y1] = yol[i - 1];
      const [x2, y2] = yol[i];
      const r = Math.PI / 180;
      const dx = (x2 - x1) * r * Math.cos(((y1 + y2) / 2) * r);
      const dy = (y2 - y1) * r;
      s += 6371008.8 * Math.hypot(dx, dy);
    }
  }
  return s;
}

// ---------------------------------------------------------------- atribut jadvali
export type Qator = Record<string, any> & { GLOBALID: string; tur: string };

export interface Ustun {
  k: string;
  n: string;
  cls?: string;
  f?: (v: any) => string;
}

export const USTUNLAR: Ustun[] = [
  { k: "tur", n: "Turi", f: turMatn },
  { k: "NOMI", n: "Nomi" },
  { k: "KUCHLANISH", n: "Kuchlanish", f: kvMatn },
  {
    k: "UZUNLIK_M",
    n: "Uzunlik, m",
    cls: "raqam",
    f: (v) => (v == null || v === "" ? "" : Math.round(Number(v)).toLocaleString("ru-RU")),
  },
  { k: "SIM", n: "Sim markasi" },
  { k: "USKUNA", n: "Uskuna" },
  { k: "IDORA", n: "Idora" },
  { k: "TUMAN_ID", n: "Tuman ID", cls: "raqam" },
  { k: "GLOBALID", n: "GLOBALID", cls: "gid" },
];

/** Tarmoq obyekti → jadval qatori (dvigatel trace javobidagi xossalar bilan bir xil kalitlar). */
export function qatorF(f: Feat): Qator {
  const p = f.p;
  return {
    GLOBALID: f.gid,
    tur: f.tur,
    NOMI: p.NOMI,
    KUCHLANISH: p.KUCHLANISH,
    UZUNLIK_M: f.qatlam === "liniya" ? p.UZUNLIK_M ?? p.SHAPE__LENGTH ?? uzunlikM(f.geom) : undefined,
    SIM: p.SIMNING_M,
    USKUNA: p.USKUNALAR_N_T,
    IDORA: p.IDOR_MAN,
    TUMAN_ID: p.TUMAN_ID,
  };
}
