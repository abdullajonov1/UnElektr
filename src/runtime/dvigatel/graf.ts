/**
 * Elektr tarmog'ining grafi — UN_Dvigatel graf.py ning nusxasi (UnElektr rejimi: ulanish = "uch",
 * kv_ajrat = true, terminal_taxmin = true).
 *
 *  * Liniya uchlari 2*sqrt(2)*0.001 = 0.00283 m dan yaqin bo'lsa — bitta tugun (UN'dagi "End vertex" siyosati).
 *  * Turli kuchlanishdagi liniyalar qurilmasiz hech qachon ulanmaydi (geometriyada tegib tursa ham).
 *  * Terminalli qurilma: har bir terminali alohida tugun, terminallar orasida "ichki qirra".
 *  * Liniya uchi FROMDEVICETERMINAL / TODEVICETERMINAL bo'yicha o'sha terminal tuguniga ulanadi. Terminal bo'sh yoki
 *    qurilmada bunday terminal yo'q bo'lsa, lekin uch qurilmaga tegib tursa — terminal kuchlanishga qarab tanlanadi.
 */
import { NuqtaIndeks, birlashtir, masofa, type XY } from "./geom";
import type { Jadvallar } from "./jadval";

export const TOLERANS = 2 * Math.SQRT2 * 0.001;

export interface QurilmaTuri {
  nomi: string;
  terminallar: Record<number, string>;
  /** Ichki qirra: (yuqori oqim terminali, quyi oqim terminali). */
  yol: [number, number];
}

export const QURILMA_TURLARI: Record<number, QurilmaTuri> = {
  1: { nomi: "Podstansiya", terminallar: { 2: "Yuqori", 3: "Orta" }, yol: [2, 3] },
  2: { nomi: "Transformator", terminallar: { 4: "Kirish", 5: "Chiqish" }, yol: [4, 5] },
  3: { nomi: "Tashqi_manba", terminallar: { 6: "Kirish", 7: "Chiqish" }, yol: [6, 7] },
  4: { nomi: "Viklyuchatel", terminallar: { 8: "Kirish", 9: "Chiqish" }, yol: [8, 9] },
};

export interface Tugun {
  tur: "terminal" | "tugun";
  x: number;
  y: number;
  qurilma?: number;
  terminal?: number;
  terminalNomi?: string;
  ag?: number;
}

export interface Qirra {
  u: number;
  v: number;
  tur: "ichki" | "liniya";
  qurilma?: number;
  liniya?: number;
  kv?: number;
  uzunlik?: number;
  i0?: number;
  i1?: number;
}

export type Muammo =
  | { tur: "terminal bor, qurilma yo'q"; oid: number; idx: number; term: number }
  | { tur: "qurilmada bunday terminal yo'q"; oid: number; idx: number; term: number; q: number }
  | { tur: "qurilma ustida, terminalsiz"; liniyalar: number[]; q: number };

export interface KvTegish {
  x: number;
  y: number;
  /** kuchlanish → liniyalar (OID). */
  boyicha: Map<number, Set<number>>;
}

export class Graf {
  tugunlar: Tugun[] = [];
  qirralar: Qirra[] = [];
  /** tugun → unga tegishli qirralar. */
  qoshni: number[][] = [];

  tugunQosh(t: Tugun): number {
    this.tugunlar.push(t);
    this.qoshni.push([]);
    return this.tugunlar.length - 1;
  }

  qirraQosh(q: Qirra): number {
    const id = this.qirralar.push(q) - 1;
    this.qoshni[q.u].push(id);
    if (q.v !== q.u) this.qoshni[q.v].push(id);
    return id;
  }

  /** Tugun darajasi (networkx: halqa qirra 2 marta sanaladi). */
  daraja(n: number): number {
    let d = 0;
    for (const e of this.qoshni[n]) d += this.qirralar[e].u === this.qirralar[e].v ? 2 : 1;
    return d;
  }
}

export interface Tarmoq {
  J: Jadvallar;
  G: Graf;
  /** liniya OID → grafdagi qirralari. */
  liniyaQirralari: Map<number, number[]>;
  /** "qurilmaOID|terminal" → tugun. */
  terminalTuguni: Map<string, number>;
  muammolar: Muammo[];
  kvTegishlar: KvTegish[];
}

export const tkalit = (q: number, t: number) => q + "|" + t;

/** Terminal ko'rsatilmagan uch uchun — kuchlanishga qarab (tahrirdagi TERMINAL_TANLOV qoidasi bilan bir xil). */
function terminalTaxmin(ag: number, kv: number): number | null {
  if (ag === 1) return kv >= 35 ? 2 : 3; // Podstansiya: Yuqori / Orta
  if (ag === 2) return kv < 1 ? 5 : 4; // Transformator: 0.4 kV -> Chiqish, aks holda Kirish
  if (ag === 3) return 7; // Tashqi manba: Chiqish
  return null;
}

export function qur(J: Jadvallar): Tarmoq {
  const G = new Graf();
  const terminalTuguni = new Map<string, number>();
  const muammolar: Muammo[] = [];

  // 1) Qurilmalar: har bir terminal — alohida tugun, terminallar orasida ichki qirra
  const dOid: number[] = [];
  const dXY: XY[] = [];
  const dAG = new Map<number, number>();
  for (const q of J.D.values()) {
    const ag = Number(q.p.ASSETGROUP);
    const tur = QURILMA_TURLARI[ag];
    if (!tur) throw new Error(`Noma'lum qurilma turi: OID ${q.oid}, ASSETGROUP ${q.p.ASSETGROUP}`);
    for (const [t, nomi] of Object.entries(tur.terminallar)) {
      const n = G.tugunQosh({ tur: "terminal", qurilma: q.oid, terminal: Number(t), terminalNomi: nomi, ag, x: q.x, y: q.y });
      terminalTuguni.set(tkalit(q.oid, Number(t)), n);
    }
    const [yuq, quyi] = tur.yol;
    G.qirraQosh({ u: terminalTuguni.get(tkalit(q.oid, yuq)), v: terminalTuguni.get(tkalit(q.oid, quyi)), tur: "ichki", qurilma: q.oid });
    dOid.push(q.oid);
    dXY.push([q.x, q.y]);
    dAG.set(q.oid, ag);
  }
  const dIndeks = new NuqtaIndeks(dXY, 1);
  const yaqinQurilma = (p: XY): number | null => {
    const r = dIndeks.engYaqin(p, TOLERANS);
    return r ? dOid[r[0]] : null;
  };

  // 2) Liniya uchlari ("End vertex": o'rta vertexlar hech qachon ulanmaydi)
  const nuqtaXY: XY[] = [];
  const nuqtaEgasi: Array<[number, number]> = []; // (liniya oid, vertex indeksi)
  const vertexTugun = new Map<string, number>(); // "oid|idx" -> tugun
  for (const r of J.L.values()) {
    const c = r.c;
    const oxirgi = c.length - 1;
    for (const idx of [0, oxirgi]) {
      let term = Number((idx === 0 ? r.p.FROMDEVICETERMINAL : r.p.TODEVICETERMINAL) || 0);
      const q = yaqinQurilma(c[idx]);
      if (q != null && !terminalTuguni.has(tkalit(q, term))) {
        term = terminalTaxmin(dAG.get(q), Number(r.p.KUCHLANISH)) || term;
      }
      if (term) {
        // Terminalli uch — qurilmaning terminal tuguniga
        if (q == null) {
          muammolar.push({ tur: "terminal bor, qurilma yo'q", oid: r.oid, idx, term });
        } else if (!terminalTuguni.has(tkalit(q, term))) {
          muammolar.push({ tur: "qurilmada bunday terminal yo'q", oid: r.oid, idx, term, q });
        } else {
          vertexTugun.set(r.oid + "|" + idx, terminalTuguni.get(tkalit(q, term)));
          continue;
        }
      }
      nuqtaXY.push(c[idx]);
      nuqtaEgasi.push([r.oid, idx]);
    }
  }

  // 3) Terminalsiz uchlar 0.00283 m ichida birlashadi
  const ildiz = birlashtir(nuqtaXY.length, new NuqtaIndeks(nuqtaXY, TOLERANS).juftlar(TOLERANS));
  const guruh = new Map<number, number[]>();
  ildiz.forEach((rt, k) => {
    const g = guruh.get(rt);
    if (g) g.push(k);
    else guruh.set(rt, [k]);
  });
  const kv = (oid: number) => Number(J.L.get(oid).p.KUCHLANISH);
  // Turli kuchlanishdagi liniyalar tegib turgan joylar — UN ularni ulaydi, biz ulamaymiz (FIZ1 sifatida ro'yxatga olinadi)
  const kvTegishlar: KvTegish[] = [];
  for (const [rt, azolar] of guruh) {
    const boyicha = new Map<number, Set<number>>();
    for (const k of azolar) {
      const o = nuqtaEgasi[k][0];
      if (!boyicha.has(kv(o))) boyicha.set(kv(o), new Set());
      boyicha.get(kv(o)).add(o);
    }
    if (boyicha.size > 1) kvTegishlar.push({ x: nuqtaXY[rt][0], y: nuqtaXY[rt][1], boyicha });
  }
  // Har bir geometrik guruh kuchlanish bo'yicha alohida tugunlarga ajratiladi
  for (const [rt, azolar] of guruh) {
    const ajratilgan = new Map<number, number[]>();
    for (const k of azolar) {
      const v = kv(nuqtaEgasi[k][0]);
      if (!ajratilgan.has(v)) ajratilgan.set(v, []);
      ajratilgan.get(v).push(k);
    }
    for (const qism of ajratilgan.values()) {
      const vakil = nuqtaXY[qism[0]];
      const n = G.tugunQosh({ tur: "tugun", x: vakil[0], y: vakil[1] });
      const liniyalar = new Set<number>();
      for (const k of qism) {
        const [oid, idx] = nuqtaEgasi[k];
        vertexTugun.set(oid + "|" + idx, n);
        liniyalar.add(oid);
      }
      // Terminalsiz uch qurilma ustida tursa — UN'da xato bo'lardi
      const q = yaqinQurilma(nuqtaXY[rt]);
      if (q != null) muammolar.push({ tur: "qurilma ustida, terminalsiz", liniyalar: [...liniyalar].sort((a, b) => a - b), q });
    }
  }

  // 4) Liniyalar — uchlari orasida bitta qirra
  const liniyaQirralari = new Map<number, number[]>();
  for (const r of J.L.values()) {
    const oxirgi = r.c.length - 1;
    let uz = 0;
    for (let i = 1; i <= oxirgi; i++) uz += masofa(r.c[i - 1], r.c[i]);
    const e = G.qirraQosh({
      u: vertexTugun.get(r.oid + "|0"), v: vertexTugun.get(r.oid + "|" + oxirgi),
      tur: "liniya", liniya: r.oid, kv: kv(r.oid), uzunlik: uz, i0: 0, i1: oxirgi,
    });
    liniyaQirralari.set(r.oid, [e]);
  }
  return { J, G, liniyaQirralari, terminalTuguni, muammolar, kvTegishlar };
}
