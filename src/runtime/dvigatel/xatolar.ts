/**
 * Tarmoqni qoidalar bo'yicha tekshirish — UN_Dvigatel xato_tekshir.py ning nusxasi ("Validate").
 *   UN   — Esri UN'ning o'zi ham ushlaydigan xatolar (kodi Esri'dagi raqam bilan);
 *   FIZ  — UN ushlamaydigan, lekin elektr fizikasiga zid holatlar;
 *   OGOH — xato emas, lekin ko'rib chiqishga arziydigan joylar.
 */
import { NuqtaIndeks, QutiIndeks, chegara, chiziqMasofa, g, masofa, oddiymi, type XY } from "./geom";
import { QURILMA_TURLARI, TOLERANS, type Tarmoq } from "./graf";
import { wgsga } from "./utm";

const TOL = TOLERANS;
/** m — shundan yaqin, lekin ulanmagan uchlar "deyarli ulangan" deb ko'rsatiladi. */
const DEYARLI = 0.5;

/** Har bir terminalga qaysi kuchlanishdagi liniya ulanishi mumkin (fizika qoidasi). */
const TERMINAL_KV: Record<string, number[]> = {
  "1|2": [35, 110], // Podstansiya Yuqori
  "1|3": [6, 10], // Podstansiya Orta
  "2|4": [6, 10], // Transformator Kirish
  "2|5": [0.4], // Transformator Chiqish
  "3|7": [35, 110], // Tashqi_manba Chiqish
};

export const TAVSIF: Record<string, [string, string]> = {
  UN5: ["UN", "Juda qisqa (nol uzunlikdagi) liniya"],
  UN9: ["UN", "Liniya uchi qurilma ustida, lekin terminali yozilmagan"],
  UN13: ["UN", "Terminalli qurilma liniya o'rtasida turibdi"],
  UN20: ["UN", "Liniya o'zini kesadi yoki boshiga qaytadi"],
  UN21: ["UN", "Liniyada ustma-ust (dublikat) vertex"],
  UN25: ["UN", "Ustma-ust turgan qurilmalar"],
  UN36: ["UN", "Liniyada terminal yozilgan, lekin u yerda bunday terminalli qurilma yo'q"],
  FIZ1: ["FIZ", "Turli kuchlanishdagi liniyalar qurilmasiz bir nuqtada tegib turibdi (UN ularni ulaydi)"],
  FIZ2: ["FIZ", "Terminalga noto'g'ri kuchlanishdagi liniya ulangan"],
  OGOH2: ["OGOH", "Liniya uchi boshqa liniyaning o'rtasiga tegib turibdi, lekin ulanmagan (End vertex)"],
  OGOH1: ["OGOH", `Liniya uchi boshqa liniyaga ${DEYARLI} m dan yaqin, lekin ulanmagan`],
};

export interface Topilma {
  KOD: string;
  DARAJA: string;
  TUR: string;
  OBYEKTLAR: string;
  IZOH: string;
  /** UTM. */
  x: number;
  y: number;
}

export function tekshir(T: Tarmoq): Topilma[] {
  const { J, G } = T;
  const lg = (o: number) => J.L.get(o).p.GLOBALID;
  const dg = (o: number) => J.D.get(o).p.GLOBALID;
  const topilma: Topilma[] = [];
  const qosh = (kod: string, x: number, y: number, obyektlar: string[], izoh = "") => {
    topilma.push({ KOD: kod, DARAJA: TAVSIF[kod][0], TUR: TAVSIF[kod][1], OBYEKTLAR: obyektlar.join(", "), IZOH: izoh, x, y });
  };

  const loid = [...J.L.keys()];
  const coords = loid.map((o) => J.L.get(o).c);
  const lIndeks = new QutiIndeks(coords.map(chegara));
  /** p dan r gacha masofadagi liniyalar (indekslari). */
  const yaqinLiniyalar = (p: XY, r: number) =>
    lIndeks.quti(p[0] - r, p[1] - r, p[0] + r, p[1] + r).filter((j) => chiziqMasofa(coords[j], p) <= r);

  // --- graf qurilganda topilgan ulanish muammolari (UN 9 / UN 36) ---
  for (const m of T.muammolar) {
    if (m.tur === "qurilma ustida, terminalsiz") {
      const q = J.D.get(m.q);
      qosh("UN9", q.x, q.y, [...m.liniyalar.map(lg), dg(m.q)]);
    } else {
      const [x, y] = J.L.get(m.oid).c[m.idx];
      qosh("UN36", x, y, [lg(m.oid)], `${m.tur}; terminal=${m.term}`);
    }
  }

  // --- UN25: ustma-ust qurilmalar ---
  const doid = [...J.D.keys()];
  const dxy: XY[] = doid.map((o) => [J.D.get(o).x, J.D.get(o).y]);
  for (const [a, b] of new NuqtaIndeks(dxy, 1).juftlar(TOL)) qosh("UN25", dxy[a][0], dxy[a][1], [dg(doid[a]), dg(doid[b])]);

  // --- UN13: qurilma liniya o'rtasida ---
  doid.forEach((qoid, k) => {
    for (const j of yaqinLiniyalar(dxy[k], TOL)) {
      const c = coords[j];
      if (Math.min(masofa(c[0], dxy[k]), masofa(c[c.length - 1], dxy[k])) > TOL) {
        qosh("UN13", dxy[k][0], dxy[k][1], [dg(qoid), lg(loid[j])]);
      }
    }
  });

  // --- Geometriya: UN5, UN20, UN21 ---
  loid.forEach((oid, j) => {
    const c = coords[j];
    const seg: number[] = [];
    for (let i = 1; i < c.length; i++) seg.push(masofa(c[i - 1], c[i]));
    const jami = seg.reduce((a, b) => a + b, 0);
    if (jami <= TOL) {
      qosh("UN5", c[0][0], c[0][1], [lg(oid)], `uzunlik=${jami.toFixed(5)} m`);
      return;
    }
    if (masofa(c[0], c[c.length - 1]) <= TOL) {
      qosh("UN20", c[0][0], c[0][1], [lg(oid)], "boshi va oxiri bir nuqtada (halqa)");
    } else if (!oddiymi(c)) {
      const o = c[Math.floor(c.length / 2)];
      qosh("UN20", o[0], o[1], [lg(oid)], "o'zini kesadi");
    }
    seg.forEach((s, i) => {
      if (s <= TOL) qosh("UN21", c[i][0], c[i][1], [lg(oid)], `vertex ${i}-${i + 1}, ${(s * 1000).toFixed(2)} mm`);
    });
  });

  // --- FIZ1: turli kuchlanishdagi liniyalar qurilmasiz bir nuqtada tegib turibdi ---
  for (const { x, y, boyicha } of T.kvTegishlar) {
    const izoh = [...boyicha.entries()].sort((a, b) => a[0] - b[0]).map(([k, s]) => `${g(k)} kV: ${s.size} ta`).join("; ") +
      " | dvigatelda ulanmagan";
    const ob: string[] = [];
    for (const s of boyicha.values()) for (const o of [...s].sort((a, b) => a - b)) ob.push(lg(o));
    qosh("FIZ1", x, y, ob, izoh);
  }

  // --- FIZ2: terminalga noto'g'ri kuchlanish ---
  G.tugunlar.forEach((d, n) => {
    if (d.tur !== "terminal") return;
    const ruxsat = TERMINAL_KV[d.ag + "|" + d.terminal];
    if (!ruxsat) return;
    for (const e of G.qoshni[n]) {
      const q = G.qirralar[e];
      if (q.tur === "liniya" && !ruxsat.includes(q.kv)) {
        qosh("FIZ2", d.x, d.y, [dg(d.qurilma), lg(q.liniya)], `${QURILMA_TURLARI[d.ag].nomi} [${d.terminalNomi}] ga ${g(q.kv)} kV liniya`);
      }
    }
  });

  // --- OGOH2: liniya uchi boshqa liniyaning o'rtasida (End vertex'da ulanmaydi) ---
  G.tugunlar.forEach((d, n) => {
    if (d.tur !== "tugun") return;
    const p: XY = [d.x, d.y];
    const ulangan = new Set(G.qoshni[n].map((e) => G.qirralar[e].liniya));
    for (const j of yaqinLiniyalar(p, TOL)) {
      const boshqa = loid[j];
      if (ulangan.has(boshqa)) continue;
      const c = coords[j];
      if (Math.min(masofa(c[0], p), masofa(c[c.length - 1], p)) <= TOL) continue; // boshqa liniyaning uchi — FIZ1 holati
      const kvlar = new Set([...ulangan, boshqa].map((o) => Number(J.L.get(o).p.KUCHLANISH)));
      qosh("OGOH2", d.x, d.y, [...[...ulangan].sort((a, b) => a - b).map(lg), lg(boshqa)],
        kvlar.size === 1 ? "kuchlanish bir xil" : "kuchlanish har xil");
    }
  });

  // --- OGOH1: deyarli ulangan uchlar ---
  const korilgan = new Set<string>();
  G.tugunlar.forEach((d, n) => {
    if (d.tur !== "tugun" || G.daraja(n) !== 1) return;
    const oid = G.qirralar[G.qoshni[n][0]].liniya;
    const p: XY = [d.x, d.y];
    for (const j of yaqinLiniyalar(p, DEYARLI)) {
      const boshqa = loid[j];
      if (boshqa === oid || korilgan.has(n + "|" + boshqa)) continue;
      // boshqa liniya shu tugunga allaqachon ulangan bo'lsa — o'tkazib yuboramiz
      if (G.qoshni[n].some((e) => G.qirralar[e].liniya === boshqa)) continue;
      const m = chiziqMasofa(coords[j], p);
      if (m <= TOL) continue;
      korilgan.add(n + "|" + boshqa);
      qosh("OGOH1", d.x, d.y, [lg(oid), lg(boshqa)], `${m.toFixed(3)} m`);
    }
  });

  return topilma;
}

/** Xato imzosi: KOD + obyektlar to'plami. almashtir={yangi_gid: asl_gid} — qirqishda yangi bo'lakdagi eski xato
 *  "yangi xato" bo'lib ko'rinmasligi uchun. */
export function imzola(X: Topilma[], almashtir: Record<string, string> = {}): Map<string, Topilma> {
  const imzo = new Map<string, Topilma>();
  for (const r of X) {
    const ids = [...new Set(r.OBYEKTLAR.split(",").map((x) => x.trim()).filter(Boolean).map((x) => almashtir[x] ?? x))].sort();
    imzo.set(r.KOD + "|" + ids.join(","), r);
  }
  return imzo;
}

/** Topilmalar → GeoJSON (WGS84) — /xatolar javobi. */
export function geojsonga(X: Topilma[]): any {
  return {
    type: "FeatureCollection",
    features: X.map((r) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: wgsga(r.x, r.y) },
      properties: { KOD: r.KOD, DARAJA: r.DARAJA, TUR: r.TUR, OBYEKTLAR: r.OBYEKTLAR, IZOH: r.IZOH },
    })),
  };
}
