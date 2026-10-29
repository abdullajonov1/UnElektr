/**
 * Geometriya yordamchilari (UTM, metr) — UN_Dvigatel dagi shapely / scipy cKDTree / STRtree o'rniga.
 */
export type XY = number[];

export function masofa(a: XY, b: XY): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/** Polyline uzunligi. */
export function uzunlik(c: XY[]): number {
  let s = 0;
  for (let i = 1; i < c.length; i++) s += masofa(c[i - 1], c[i]);
  return s;
}

/** Nuqtaning kesmadagi proyeksiyasi: t (0..1) va eng yaqin nuqta. */
function kesmaProyeksiya(p: XY, a: XY, b: XY): { t: number; q: XY; d: number } {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  const q = [a[0] + dx * t, a[1] + dy * t];
  return { t, q, d: masofa(p, q) };
}

/** Nuqtadan polylinegacha masofa (shapely distance). */
export function chiziqMasofa(c: XY[], p: XY): number {
  if (c.length === 1) return masofa(c[0], p);
  let d = Infinity;
  for (let i = 1; i < c.length; i++) d = Math.min(d, kesmaProyeksiya(p, c[i - 1], c[i]).d);
  return d;
}

/** Polylinedagi eng yaqin nuqta (shapely line.interpolate(line.project(P))). */
export function engYaqinNuqta(c: XY[], p: XY): XY {
  let eng: XY = c[0], d0 = Infinity;
  for (let i = 1; i < c.length; i++) {
    const k = kesmaProyeksiya(p, c[i - 1], c[i]);
    if (k.d < d0) { d0 = k.d; eng = k.q; }
  }
  return eng;
}

/** Polyline chegarasi (minx, miny, maxx, maxy). */
export function chegara(c: XY[]): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of c) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

// ---------------------------------------------------------------- o'z-o'zini kesish (shapely is_simple)
function orient(a: XY, b: XY, c: XY): number {
  const v = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  return v > 0 ? 1 : v < 0 ? -1 : 0;
}

function ustida(a: XY, b: XY, p: XY): boolean {
  return Math.min(a[0], b[0]) <= p[0] && p[0] <= Math.max(a[0], b[0]) &&
    Math.min(a[1], b[1]) <= p[1] && p[1] <= Math.max(a[1], b[1]);
}

function kesishadimi(a: XY, b: XY, c: XY, d: XY): boolean {
  const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  return (o1 === 0 && ustida(a, b, c)) || (o2 === 0 && ustida(a, b, d)) ||
    (o3 === 0 && ustida(c, d, a)) || (o4 === 0 && ustida(c, d, b));
}

const teng = (a: XY, b: XY) => a[0] === b[0] && a[1] === b[1];

/**
 * Ochiq (boshi va oxiri ustma-ust emas) liniya o'zini kesmaydimi — GEOS IsSimpleOp: takroriy vertexlar tashlanadi;
 * qo'shni kesmalar faqat umumiy vertexda tegishi mumkin, boshqa har qanday tegish yoki kesishish — oddiy emas.
 */
export function oddiymi(c0: XY[]): boolean {
  const c: XY[] = [];
  for (const p of c0) if (!c.length || !teng(c[c.length - 1], p)) c.push(p);
  const n = c.length - 1;
  const ch = Array.from({ length: n }, (_, i) => chegara([c[i], c[i + 1]]));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = ch[i], b = ch[j];
      if (a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1]) continue;
      if (j === i + 1) {
        // umumiy vertex c[j]: orqaga qaytib ustma-ust tushsa — oddiy emas
        const p = c[i], q = c[j], r = c[j + 1];
        if (orient(p, q, r) === 0 && (ustida(p, q, r) || ustida(q, r, p))) return false;
        continue;
      }
      if (kesishadimi(c[i], c[i + 1], c[j], c[j + 1])) return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------- fazoviy indeks (to'r)
/** Nuqtalar uchun to'r indeksi. */
export class NuqtaIndeks {
  private katak = new Map<string, number[]>();

  constructor(private nuqtalar: XY[], private qadam: number) {
    nuqtalar.forEach((p, i) => {
      const k = this.kalit(Math.floor(p[0] / qadam), Math.floor(p[1] / qadam));
      const arr = this.katak.get(k);
      if (arr) arr.push(i);
      else this.katak.set(k, [i]);
    });
  }

  private kalit(i: number, j: number): string {
    return i + "," + j;
  }

  /** To'rtburchakdagi nuqtalar indekslari (o'sish tartibida). */
  quti(x0: number, y0: number, x1: number, y1: number): number[] {
    const q = this.qadam, natija: number[] = [];
    for (let i = Math.floor(x0 / q); i <= Math.floor(x1 / q); i++) {
      for (let j = Math.floor(y0 / q); j <= Math.floor(y1 / q); j++) {
        for (const k of this.katak.get(this.kalit(i, j)) || []) {
          const [x, y] = this.nuqtalar[k];
          if (x >= x0 && x <= x1 && y >= y0 && y <= y1) natija.push(k);
        }
      }
    }
    return natija.sort((a, b) => a - b);
  }

  /** r radiusdagi nuqtalar (masofa <= r). */
  radius(p: XY, r: number): number[] {
    return this.quti(p[0] - r, p[1] - r, p[0] + r, p[1] + r).filter((k) => masofa(this.nuqtalar[k], p) <= r);
  }

  /** r ichidagi eng yaqin nuqta: [indeks, masofa] yoki null. */
  engYaqin(p: XY, r: number): [number, number] | null {
    let eng: [number, number] | null = null;
    for (const k of this.radius(p, r)) {
      const d = masofa(this.nuqtalar[k], p);
      if (!eng || d < eng[1]) eng = [k, d];
    }
    return eng;
  }

  /** Bir-biridan r gacha bo'lgan barcha juftlar (i < j) — cKDTree.query_pairs. */
  juftlar(r: number): Array<[number, number]> {
    const natija: Array<[number, number]> = [];
    this.nuqtalar.forEach((p, i) => {
      for (const j of this.radius(p, r)) if (j > i) natija.push([i, j]);
    });
    return natija;
  }
}

/** Chegaralar (bbox) uchun to'r indeksi — STRtree / sindex.query o'rniga. */
export class QutiIndeks {
  private katak = new Map<string, number[]>();

  constructor(private qutilar: Array<[number, number, number, number]>, private qadam = 100) {
    qutilar.forEach((b, n) => {
      for (let i = Math.floor(b[0] / qadam); i <= Math.floor(b[2] / qadam); i++) {
        for (let j = Math.floor(b[1] / qadam); j <= Math.floor(b[3] / qadam); j++) {
          const k = i + "," + j;
          const arr = this.katak.get(k);
          if (arr) arr.push(n);
          else this.katak.set(k, [n]);
        }
      }
    });
  }

  /** Chegarasi berilgan to'rtburchak bilan kesishadigan elementlar (o'sish tartibida). */
  quti(x0: number, y0: number, x1: number, y1: number): number[] {
    const q = this.qadam, s = new Set<number>();
    for (let i = Math.floor(x0 / q); i <= Math.floor(x1 / q); i++) {
      for (let j = Math.floor(y0 / q); j <= Math.floor(y1 / q); j++) {
        for (const n of this.katak.get(i + "," + j) || []) {
          const b = this.qutilar[n];
          if (b[0] <= x1 && b[2] >= x0 && b[1] <= y1 && b[3] >= y0) s.add(n);
        }
      }
    }
    return [...s].sort((a, b) => a - b);
  }
}

/** Union-find (graf.py _union_find). Har bir element uchun guruh ildizi. */
export function birlashtir(n: number, juftlar: Array<[number, number]>): number[] {
  const ota = Array.from({ length: n }, (_, i) => i);
  const top = (a: number): number => {
    while (ota[a] !== a) {
      ota[a] = ota[ota[a]];
      a = ota[a];
    }
    return a;
  };
  for (const [a, b] of juftlar) {
    const ra = top(a), rb = top(b);
    // kichik indeks ildiz bo'ladi (natija juftlar tartibiga bog'liq bo'lmasin)
    if (ra !== rb) ota[Math.max(ra, rb)] = Math.min(ra, rb);
  }
  return ota.map((_, i) => top(i));
}

/** Python format(x, "g") — 6 muhim raqam, ortiqcha nollarsiz (0.4, 10, 110). */
export function g(x: number): string {
  if (!isFinite(x)) return String(x);
  return String(Number(x.toPrecision(6)));
}

/** Python round(x, n). */
export function yaxlit(x: number, n = 0): number {
  const k = Math.pow(10, n);
  return Math.round(x * k) / k;
}
