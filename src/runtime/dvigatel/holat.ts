/** Dvigatelning joriy holati (oxirgi sync dan keyin): jadvallar, graf, tracer, xatolar keshi. */
import { NuqtaIndeks, QutiIndeks, chegara } from "./geom";
import { qur, type Tarmoq } from "./graf";
import { Tracer } from "./trace";
import { imzola, tekshir, type Topilma } from "./xatolar";
import type { FlMaydon, Jadvallar } from "./jadval";

export type QatlamNomi = "liniya" | "qurilma";

export interface Holat {
  J: Jadvallar;
  T: Tarmoq;
  tr: Tracer;
  /** Feature Layer sxemasi (nomlari KATTA harfda). */
  maydonlar: Record<QatlamNomi, FlMaydon[]>;
  /** Feature Layerda ko'p qismli liniyalar (GLOBALID) — geometriyasini o'zgartirib bo'lmaydi. */
  kopQismli: Set<string>;
  yuklandi: number;
  xatolar?: Topilma[];
  xatoImzo?: Map<string, Topilma>;
  lIndeks?: { oids: number[]; ind: QutiIndeks };
  dIndeks?: { oids: number[]; ind: NuqtaIndeks };
  ustunlar?: Record<QatlamNomi, Set<string>>;
}

export function holatYasa(J: Jadvallar, maydonlar: Record<QatlamNomi, FlMaydon[]>, kopQismli: Set<string>): Holat {
  const t0 = Date.now();
  const T = qur(J);
  const tr = new Tracer(T);
  return { J, T, tr, maydonlar, kopQismli, yuklandi: (Date.now() - t0) / 1000 };
}

export function xatolar(h: Holat): Topilma[] {
  if (!h.xatolar) h.xatolar = tekshir(h.T);
  return h.xatolar;
}

export function joriyImzolar(h: Holat): Map<string, Topilma> {
  if (!h.xatoImzo) h.xatoImzo = imzola(xatolar(h));
  return h.xatoImzo;
}

/** Liniyalar chegaralari indeksi (sindex). */
export function liniyaIndeksi(h: Holat): { oids: number[]; ind: QutiIndeks } {
  if (!h.lIndeks) {
    const oids = [...h.J.L.keys()];
    h.lIndeks = { oids, ind: new QutiIndeks(oids.map((o) => chegara(h.J.L.get(o).c))) };
  }
  return h.lIndeks;
}

export function qurilmaIndeksi(h: Holat): { oids: number[]; ind: NuqtaIndeks } {
  if (!h.dIndeks) {
    const oids = [...h.J.D.keys()];
    h.dIndeks = { oids, ind: new NuqtaIndeks(oids.map((o) => [h.J.D.get(o).x, h.J.D.get(o).y]), 10) };
  }
  return h.dIndeks;
}

/** Jadvaldagi barcha ustunlar (pandas DataFrame ustunlari kabi). */
export function ustunlar(h: Holat, q: QatlamNomi): Set<string> {
  if (!h.ustunlar) {
    const s = (m: Map<number, { p: Record<string, any> }>) => {
      const r = new Set<string>();
      for (const x of m.values()) for (const k of Object.keys(x.p)) r.add(k);
      return r;
    };
    h.ustunlar = { liniya: s(h.J.L), qurilma: s(h.J.D) };
  }
  return h.ustunlar[q];
}
