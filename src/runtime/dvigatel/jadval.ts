/**
 * Dvigatelning xotiradagi jadvallari: Feature Layer GeoJSON nusxasi → liniya va qurilma qatorlari (UTM).
 * UN_Dvigatel server.py dagi _fc_to_gdf ning nusxasi.
 */
import { utmga, wgsga } from "./utm";
import type { XY } from "./geom";

/** Dvigatel rad etgan so'rov: holat (HTTP kodi o'rnida) va tafsilot (409 da — yangi xatolar ro'yxati). */
export class EngineXato extends Error {
  holat: number;
  tafsilot: any;
  constructor(message: string, holat: number, tafsilot: any = null) {
    super(message);
    this.holat = holat;
    this.tafsilot = tafsilot;
  }
}

export type Xossalar = Record<string, any>;

export interface Liniya {
  oid: number;
  /** Atributlar (nomlari KATTA harfda). */
  p: Xossalar;
  /** Koordinatalar, UTM (faqat birinchi qism). */
  c: XY[];
  /** Xuddi shu koordinatalar, WGS84. */
  c84: XY[];
}

export interface Qurilma {
  oid: number;
  p: Xossalar;
  x: number;
  y: number;
  lon: number;
  lat: number;
}

export interface Jadvallar {
  L: Map<number, Liniya>;
  D: Map<number, Qurilma>;
}

/** Feature Layer maydoni (layerSchema). */
export interface FlMaydon {
  name: string;
  type: string;
  editable?: boolean;
  alias?: string;
}

function son(v: any, standart: number | null): number | null {
  if (v == null || v === "") return standart;
  const n = Number(v);
  return isFinite(n) ? n : standart;
}

function butun(v: any, standart = 0): number {
  if (v == null || v === "") return standart;
  const n = Number(v);
  return isFinite(n) ? Math.trunc(n) : standart;
}

export function gidNormal(g: string): string {
  let s = String(g || "").trim().toUpperCase();
  if (!s.startsWith("{")) s = "{" + s;
  if (!s.endsWith("}")) s = s + "}";
  return s;
}

/** GeoJSON koordinatasi — faqat X, Y. */
const xy = (c: any): XY => [Number(c[0]), Number(c[1])];

export function liniyaQator(oid: number, p: Xossalar, c84: XY[]): Liniya {
  return { oid, p, c84, c: c84.map(([lon, lat]) => utmga(lon, lat)) };
}

export function liniyaUtmdan(oid: number, p: Xossalar, c: XY[]): Liniya {
  return { oid, p, c, c84: c.map(([x, y]) => wgsga(x, y)) };
}

export function qurilmaQator(oid: number, p: Xossalar, lon: number, lat: number): Qurilma {
  const [x, y] = utmga(lon, lat);
  return { oid, p, x, y, lon, lat };
}

export function qurilmaUtmdan(oid: number, p: Xossalar, x: number, y: number): Qurilma {
  const [lon, lat] = wgsga(x, y);
  return { oid, p, x, y, lon, lat };
}

/**
 * FeatureCollection → qatorlar. Maydon nomlari KATTA harfga keltiriladi, shunda Feature Layerda
 * "GlobalID" yoki "kuchlanish" bo'lsa ham dvigatel bir xil ishlaydi.
 * kopQismli — liniya Feature Layerda ko'p qismli bo'lsa (faqat birinchi qismi olinadi) GLOBALID qo'shiladi.
 */
export function liniyalardan(fc: any, kopQismli: Set<string>): Map<number, Liniya> {
  const natija = new Map<number, Liniya>();
  (fc?.features || []).forEach((f: any, i: number) => {
    const p: Xossalar = {};
    for (const [k, v] of Object.entries(f?.properties || {})) {
      const K = k.toUpperCase();
      if (!(K in p)) p[K] = v;
    }
    const g = f?.geometry;
    let qismlar: any[][] = [];
    if (g?.type === "LineString") qismlar = [g.coordinates || []];
    else if (g?.type === "MultiLineString") qismlar = g.coordinates || [];
    else return;
    if (!qismlar.length || qismlar.some((q) => !Array.isArray(q) || q.length < 2)) return;
    const gid = gidNormal(p.GLOBALID || `{SYNC-line-${i}}`);
    p.GLOBALID = gid;
    if (qismlar.length > 1) kopQismli.add(gid);
    p.OBJECTID = butun(p.OBJECTID, i + 1);
    p.KUCHLANISH = son("KUCHLANISH" in p ? p.KUCHLANISH : p.VOLTAGE, 10);
    if (p.KUCHLANISH === 0) p.KUCHLANISH = 0.4; // butun son maydonda 0.4 kV — 0 deb saqlanadi
    p.NOMI = p.NOMI || p.NAME || "";
    p.FROMDEVICETERMINAL = butun(p.FROMDEVICETERMINAL);
    p.TODEVICETERMINAL = butun(p.TODEVICETERMINAL);
    if (!("TUMAN_ID" in p)) p.TUMAN_ID = null;
    if (p.UZUNLIK_M == null || p.UZUNLIK_M === "") p.UZUNLIK_M = p.SHAPE__LENGTH ?? null;
    if (!("SIMNING_M" in p)) p.SIMNING_M = null;
    if (!("IDOR_MAN" in p)) p.IDOR_MAN = null;
    if (natija.has(p.OBJECTID)) throw new EngineXato("line: OBJECTID takrorlanadi", 400);
    natija.set(p.OBJECTID, liniyaQator(p.OBJECTID, p, qismlar[0].map(xy)));
  });
  if (!natija.size) throw new EngineXato("Bo'sh line FeatureCollection", 400);
  return natija;
}

export function qurilmalardan(fc: any): Map<number, Qurilma> {
  const natija = new Map<number, Qurilma>();
  (fc?.features || []).forEach((f: any, i: number) => {
    const p: Xossalar = {};
    for (const [k, v] of Object.entries(f?.properties || {})) {
      const K = k.toUpperCase();
      if (!(K in p)) p[K] = v;
    }
    const g = f?.geometry;
    let c: any = null;
    if (g?.type === "Point") c = g.coordinates;
    else if (g?.type === "MultiPoint") c = g.coordinates?.[0];
    if (!Array.isArray(c) || c.length < 2) return;
    p.GLOBALID = gidNormal(p.GLOBALID || `{SYNC-point-${i}}`);
    p.OBJECTID = butun(p.OBJECTID, i + 1);
    p.ASSETGROUP = butun(p.ASSETGROUP, 2);
    p.KUCHLANISH = p.KUCHLANISH != null && p.KUCHLANISH !== "" ? p.KUCHLANISH : p.VOLTAGE ?? null;
    p.NOMI = p.NOMI || p.NAME || "";
    p.ISSUBNETWORKCONTROLLER = butun(p.ISSUBNETWORKCONTROLLER);
    if (!("TUMAN_ID" in p)) p.TUMAN_ID = null;
    if (!("USKUNALAR_N_T" in p)) p.USKUNALAR_N_T = null;
    if (!("IDOR_MAN" in p)) p.IDOR_MAN = null;
    if (natija.has(p.OBJECTID)) throw new EngineXato("point: OBJECTID takrorlanadi", 400);
    natija.set(p.OBJECTID, qurilmaQator(p.OBJECTID, p, Number(c[0]), Number(c[1])));
  });
  if (!natija.size) throw new EngineXato("Bo'sh point FeatureCollection", 400);
  return natija;
}

/** Qiymat bo'shmi (None / NaN). */
export function boshmi(v: any): boolean {
  return v == null || (typeof v === "number" && isNaN(v));
}

/** Python bilan bir xil taqqoslash: 10 == 10.0, None == None. */
export function tengmi(a: any, b: any): boolean {
  if (boshmi(a) && boshmi(b)) return true;
  if (typeof a === "number" && typeof b === "number") return a === b;
  return a === b;
}

/** Ustundagi eng ko'p uchraydigan qiymat (pandas mode().iloc[0]: teng bo'lsa — eng kichigi). */
export function moda(qiymatlar: any[]): any {
  const sanoq = new Map<any, number>();
  for (const v of qiymatlar) if (!boshmi(v)) sanoq.set(v, (sanoq.get(v) || 0) + 1);
  let eng: any = null, n0 = 0;
  for (const [v, n] of sanoq) {
    if (n > n0 || (n === n0 && v < eng)) { eng = v; n0 = n; }
  }
  return eng;
}
