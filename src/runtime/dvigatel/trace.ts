/**
 * Trace dvigateli — UN_Dvigatel trace.py ning nusxasi (8 ta trace).
 *
 * 1. Tier'lar. Podstansiya va Transformatorning ichki qirrasi (Yuqori->Orta, Kirish->Chiqish) tier'lar chegarasi.
 *    "Tier grafi" — umumiy graf, faqat shu ichki qirralarsiz. Uning har bir bo'lagi — bitta subnetwork hududi;
 *    ichidagi controller terminallari — manbalar.
 * 2. "Qirra-tugun" grafi (H): har bir liniya bo'lagi alohida tugun (tugun_u — [liniya] — tugun_v). Shunda bir xil
 *    ikki nuqta orasidagi ikkita parallel feeder ham to'g'ri halqa bo'lib ko'rinadi.
 * 3. Oqim yo'nalishi (Upstream / Downstream) — blok-kesim daraxti orqali. Hamma manbalar bitta soxta "X" tuguniga
 *    ulanadi va H biconnected bloklarga ajratiladi: 2 tugunli blok — ko'prik (radial qism, yo'nalish aniq),
 *    kattarog'i — halqa (ikki tomonga ham o'tiladi). Daraxt X dan tartiblanadi:
 *      Upstream(s)   = s dan X gacha bo'lgan yo'ldagi barcha bloklar;
 *      Downstream(s) = daraxtda s ning ostidagi hamma narsa (s halqa ichida bo'lsa — halqaning o'zi ham; s radial
 *                      chetki tugun bo'lsa — faqat o'zi). Python nusxasidan farqi: u chetki tugunda uni ta'minlovchi
 *                      liniyani ham qo'shib yuborardi (TP dan downstream — unga kelayotgan liniya ham).
 *
 * H tugunlari matn kalitlar: "n<tugun>" (graf tuguni), "e<liniya OID>:<i0>" (liniya bo'lagi),
 * "i<qurilma OID>" (chegara bo'lmagan qurilmaning ichki qirrasi), "X" (soxta manba).
 */
import { QURILMA_TURLARI, tkalit, type Tarmoq } from "./graf";

const X = "X";
const BLOK = "B#";

export class Natija {
  liniyalar: Set<number>;
  qurilmalar: Set<number>;
  izoh: string;
  constructor(liniyalar: Iterable<number> = [], qurilmalar: Iterable<number> = [], izoh = "") {
    this.liniyalar = new Set(liniyalar);
    this.qurilmalar = new Set(qurilmalar);
    this.izoh = izoh;
  }

  /** Python Natija.__or__ — izoh tushib qoladi. */
  yoki(b: Natija): Natija {
    return new Natija([...this.liniyalar, ...b.liniyalar], [...this.qurilmalar, ...b.qurilmalar]);
  }
}

interface HTugun {
  /** "terminal" | "tugun" (graf tuguni), "liniya" (bo'lak), "ichki". */
  tur: string;
  qurilma?: number;
  terminal?: number;
  ag?: number;
  liniya?: number;
  uzunlik?: number;
}

interface Daraxt {
  ildiz: string;
  ota: Map<string, string>;
  bolalar: Map<string, string[]>;
  bloklar: Array<Set<string>>;
  tugunBlok: Map<string, number[]>;
}

interface Controller {
  nomi: string;
  tier: any;
  subnetwork: string;
  qurilma: number;
}

export const nk = (n: number) => "n" + n;

export class Tracer {
  /** Ichki qirrasi tier chegarasi bo'lgan qurilmalar: Podstansiya, Transformator. */
  static CHEGARA = new Set([1, 2]);
  /** Isolation trace to'xtaydigan qurilmalar: Viklyuchatel. */
  static ISOLATING = new Set([4]);

  lgid = new Map<string, number>();
  dgid = new Map<string, number>();
  H = new Map<string, HTugun>();
  private adj = new Map<string, string[]>();
  controllerlar = new Map<string, Controller>();
  ichkiManbalar = new Set<string>();
  private komp = new Map<string, number>();
  private kompTugunlari: string[][] = [];
  private daraxtKesh = new Map<string, Daraxt | null>();

  constructor(public T: Tarmoq) {
    const { G, J } = T;
    for (const r of J.L.values()) this.lgid.set(r.p.GLOBALID, r.oid);
    for (const q of J.D.values()) this.dgid.set(q.p.GLOBALID, q.oid);

    // Qirra-tugun grafi H (tier chegaralarisiz)
    G.tugunlar.forEach((d, n) => this.tugun(nk(n), { tur: d.tur, qurilma: d.qurilma, terminal: d.terminal, ag: d.ag }));
    for (const d of G.qirralar) {
      let e: string;
      if (d.tur === "ichki") {
        if (Tracer.CHEGARA.has(G.tugunlar[d.u].ag)) continue;
        e = "i" + d.qurilma;
        this.tugun(e, { tur: "ichki", qurilma: d.qurilma });
      } else {
        e = "e" + d.liniya + ":" + d.i0;
        this.tugun(e, { tur: "liniya", liniya: d.liniya, uzunlik: d.uzunlik });
      }
      this.qirra(nk(d.u), e);
      this.qirra(e, nk(d.v));
    }

    this.maydondanControllerlar();

    // 0.4 kV tarmoq uchun "ichki manba": TP ning Chiqish terminali (Upstream/Downstream uchun manba,
    // subnetwork nomlariga ta'sir qilmaydi)
    for (const [k, n] of T.terminalTuguni) {
      const [q, t] = k.split("|").map(Number);
      if (Number(J.D.get(q).p.ASSETGROUP) === 2 && t === QURILMA_TURLARI[2].yol[1]) this.ichkiManbalar.add(nk(n));
    }

    // Komponentlar
    for (const n of this.H.keys()) {
      if (this.komp.has(n)) continue;
      const id = this.kompTugunlari.length;
      const c = this.qamrov([n], () => true);
      for (const x of c) this.komp.set(x, id);
      this.kompTugunlari.push([...c]);
    }
    this.snNominiAniqla();
  }

  private tugun(k: string, d: HTugun) {
    if (!this.H.has(k)) {
      this.H.set(k, d);
      this.adj.set(k, []);
    }
  }

  private qirra(a: string, b: string) {
    const aa = this.adj.get(a);
    if (aa.includes(b)) return; // nx.Graph — takroriy qirra yo'q
    aa.push(b);
    this.adj.get(b).push(a);
  }

  qoshnilar(n: string): string[] {
    return this.adj.get(n) || [];
  }

  /** Boshlang'ich tugunlardan yetib boriladigan tugunlar (ruxsat(n) false bo'lgan tugunlar o'tilmaydi). */
  private qamrov(boshlar: string[], ruxsat: (n: string) => boolean): Set<string> {
    const s = new Set<string>();
    const stek: string[] = [];
    for (const b of boshlar) if (this.H.has(b) && ruxsat(b) && !s.has(b)) { s.add(b); stek.push(b); }
    while (stek.length) {
      const x = stek.pop();
      for (const y of this.qoshnilar(x)) {
        if (!s.has(y) && ruxsat(y)) { s.add(y); stek.push(y); }
      }
    }
    return s;
  }

  /** UN qurilma maydonlari: SUBNETWORKCONTROLLERNAME = "Terminal/Nomi" (masalan "Orta/PS_1").
   *  Terminal ko'rsatilmagan bo'lsa — qurilmaning quyi oqim terminali (Orta / Chiqish). */
  private maydondanControllerlar() {
    for (const q of this.T.J.D.values()) {
      if (Number(q.p.ISSUBNETWORKCONTROLLER || 0) !== 1) continue;
      const tur = QURILMA_TURLARI[Number(q.p.ASSETGROUP)];
      if (!tur) continue;
      const nom = String(q.p.SUBNETWORKCONTROLLERNAME || "");
      const bol = nom.indexOf("/");
      const termNomi = bol >= 0 ? nom.slice(0, bol) : "";
      const qisqa = bol >= 0 ? nom.slice(bol + 1) : nom;
      const topilgan = Object.entries(tur.terminallar).find(([, v]) => v === termNomi);
      const term = topilgan ? Number(topilgan[0]) : tur.yol[1];
      const n = nk(this.T.terminalTuguni.get(tkalit(q.oid, term)));
      if (this.controllerlar.has(n)) continue;
      this.controllerlar.set(n, {
        nomi: qisqa || nom || String(q.p.GLOBALID), tier: q.p.TIERNAME ?? null,
        subnetwork: String(q.p.SUBNETWORKNAME || qisqa || nom), qurilma: q.oid,
      });
    }
  }

  /** Qurilmaning SUBNETWORKNAME i bir nechta nomdan iborat bo'lishi mumkin ("SN_PS_4_6::SN_YUQORI_2"). Controller
   *  terminali joylashgan tier-komponentdagi liniyalarda eng ko'p uchraydigan nom tanlanadi. */
  private snNominiAniqla() {
    for (const [m, info] of this.controllerlar) {
      const qismlar = String(info.subnetwork || "").split("::").map((x) => x.trim()).filter(Boolean);
      if (qismlar.length < 2) continue;
      const sanoq = new Map<string, number>();
      const id = this.komp.get(m);
      for (const n of id == null ? [] : this.kompTugunlari[id]) {
        const d = this.H.get(n);
        if (d.tur !== "liniya") continue;
        for (const x of String(this.T.J.L.get(d.liniya).p.SUBNETWORKNAME || "").split("::")) {
          sanoq.set(x.trim(), (sanoq.get(x.trim()) || 0) + 1);
        }
      }
      let eng = qismlar[0];
      for (const x of qismlar) if ((sanoq.get(x) || 0) > (sanoq.get(eng) || 0)) eng = x;
      info.subnetwork = sanoq.get(eng) ? eng : qismlar[0];
    }
  }

  // ---------- boshlang'ich nuqtalar ----------
  /** Liniya GLOBALID → uning barcha bo'laklari (H tugunlari). */
  liniya(gid: string): string[] {
    const oid = this.lgid.get(gid);
    return this.T.liniyaQirralari.get(oid).map((e) => "e" + oid + ":" + this.T.G.qirralar[e].i0);
  }

  /** Qurilma GLOBALID → terminal tugunlari (terminal berilmasa — hammasi). */
  qurilma(gid: string, terminal?: number): string[] {
    const oid = this.dgid.get(gid);
    const natija: string[] = [];
    for (const [k, n] of this.T.terminalTuguni) {
      const [q, t] = k.split("|").map(Number);
      if (q === oid && (terminal == null || t === terminal)) natija.push(nk(n));
    }
    return natija;
  }

  // ---------- yordamchi ----------
  private natija(tugunlar: Iterable<string>, izoh = ""): Natija {
    const lin = new Set<number>(), qur = new Set<number>();
    for (const n of tugunlar) {
      if (n === X) continue;
      const d = this.H.get(n);
      if (!d) continue;
      if (d.tur === "liniya") lin.add(d.liniya);
      else if (d.tur === "ichki" || d.tur === "terminal") qur.add(d.qurilma);
    }
    return new Natija(lin, qur, izoh);
  }

  private manbami(n: string, ichki = true): boolean {
    return this.controllerlar.has(n) || (ichki && this.ichkiManbalar.has(n));
  }

  private manbalar(tugunlar: Iterable<string>, ichki = true): string[] {
    const r: string[] = [];
    for (const n of tugunlar) if (this.manbami(n, ichki)) r.push(n);
    return r;
  }

  /** To'siqlarsiz qamrov: boshlardan yetib boriladigan hamma narsa. */
  private yetgan(boshlar: string[], tos: Set<string>): Set<string> {
    const s = new Set<string>();
    for (const b of boshlar) {
      if (s.has(b) || tos.has(b) || !this.H.has(b)) continue;
      for (const x of this.qamrov([b], (n) => !tos.has(n))) s.add(x);
    }
    return s;
  }

  /** Komponent uchun blok-kesim daraxti, X ildizli. */
  private daraxt(kompId: number, tosiqlar: string[]): Daraxt | null {
    const tos = new Set(tosiqlar);
    const kalit = kompId + "|" + [...tos].sort().join(",");
    if (this.daraxtKesh.has(kalit)) return this.daraxtKesh.get(kalit);
    let natija: Daraxt | null = null;
    const ichida = new Set(this.kompTugunlari[kompId].filter((n) => !tos.has(n)));
    const manba = this.manbalar(ichida);
    if (manba.length) {
      const manbaSet = new Set(manba);
      const qosh = (n: string): string[] => {
        if (n === X) return manba;
        const r = this.qoshnilar(n).filter((y) => ichida.has(y));
        if (manbaSet.has(n)) r.push(X);
        return r;
      };
      // X komponenti
      const tug = new Set<string>([X]);
      const stek = [X];
      while (stek.length) {
        const x = stek.pop();
        for (const y of qosh(x)) if (!tug.has(y)) { tug.add(y); stek.push(y); }
      }
      const bloklar = biconnected([...tug], qosh);
      const tugunBlok = new Map<string, number[]>();
      bloklar.forEach((b, i) => {
        for (const n of b) {
          if (!tugunBlok.has(n)) tugunBlok.set(n, []);
          tugunBlok.get(n).push(i);
        }
      });
      // Blok-kesim daraxti: bloklar ("B#i") va kesim tugunlari
      const D = new Map<string, string[]>();
      const dq = (a: string, b: string) => {
        if (!D.has(a)) D.set(a, []);
        if (!D.has(b)) D.set(b, []);
        D.get(a).push(b);
        D.get(b).push(a);
      };
      bloklar.forEach((b, i) => {
        if (!D.has(BLOK + i)) D.set(BLOK + i, []);
        for (const n of b) if (tugunBlok.get(n).length > 1) dq(BLOK + i, n);
      });
      const ildiz = tugunBlok.get(X).length > 1 ? X : BLOK + tugunBlok.get(X)[0];
      const ota = new Map<string, string>();
      const bolalar = new Map<string, string[]>();
      const korildi = new Set([ildiz]);
      const s2 = [ildiz];
      while (s2.length) {
        const x = s2.pop();
        for (const y of D.get(x) || []) {
          if (korildi.has(y)) continue;
          korildi.add(y);
          ota.set(y, x);
          if (!bolalar.has(x)) bolalar.set(x, []);
          bolalar.get(x).push(y);
          s2.push(y);
        }
      }
      natija = { ildiz, ota, bolalar, bloklar, tugunBlok };
    }
    this.daraxtKesh.set(kalit, natija);
    return natija;
  }

  /** n ning daraxtdagi o'rni: kesim tuguni bo'lsa — o'zi, bo'lmasa — o'z bloki. */
  private daraxtTuguni(n: string, dr: Daraxt): string {
    const b = dr.tugunBlok.get(n);
    return b.length > 1 ? n : BLOK + b[0];
  }

  private blokTugunlari(daraxtTugunlari: string[], bloklar: Array<Set<string>>): Set<string> {
    const s = new Set<string>();
    for (const t of daraxtTugunlari) {
      if (t.startsWith(BLOK)) for (const n of bloklar[Number(t.slice(BLOK.length))]) s.add(n);
      else s.add(t);
    }
    return s;
  }

  // ---------- 1. CONNECTED ----------
  /** Boshlang'ich nuqtaga tegib turgan hamma narsa — umumiy grafda, tier chegaralari ham o'tiladi. */
  connected(boshlar: string[], tosiqlar: string[] = []): Natija {
    const G = this.T.G;
    const boshG = new Set<number>();
    for (const b of boshlar) {
      if (b.startsWith("n")) boshG.add(Number(b.slice(1)));
      else if (b.startsWith("e")) boshG.add(G.qirralar[this.qirraOf(b)].u);
    }
    // qurilma to'sig'i — uning terminal tuguni; liniya to'sig'i — faqat o'sha liniya bo'lagi (qirrasi)
    const tosN = new Set(tosiqlar.filter((t) => t.startsWith("n")).map((t) => Number(t.slice(1))));
    const tosE = new Set(tosiqlar.filter((t) => t.startsWith("e")).map((t) => this.qirraOf(t)));
    const yetgan = new Set<number>();
    for (const b of boshG) {
      if (yetgan.has(b) || tosN.has(b)) continue;
      yetgan.add(b);
      const stek = [b];
      while (stek.length) {
        const x = stek.pop();
        for (const e of G.qoshni[x]) {
          if (tosE.has(e)) continue;
          const q = G.qirralar[e];
          const y = q.u === x ? q.v : q.u;
          if (!yetgan.has(y) && !tosN.has(y)) { yetgan.add(y); stek.push(y); }
        }
      }
    }
    const lin = new Set<number>(), qur = new Set<number>();
    for (const n of yetgan) {
      const d = G.tugunlar[n];
      if (d.tur === "terminal") qur.add(d.qurilma);
      for (const e of G.qoshni[n]) {
        const q = G.qirralar[e];
        // to'siq tuguniga tegib turgan qirra ham ko'rinmaydi (nx.restricted_view)
        if (!tosE.has(e) && !tosN.has(q.u) && !tosN.has(q.v) && q.tur === "liniya") lin.add(q.liniya);
      }
    }
    return new Natija(lin, qur);
  }

  /** H dagi liniya bo'lagi "e<oid>:<i0>" → grafdagi qirra. */
  private qirraOf(h: string): number {
    const [oid, i0] = h.slice(1).split(":").map(Number);
    return this.T.liniyaQirralari.get(oid).find((e) => this.T.G.qirralar[e].i0 === i0);
  }

  // ---------- 2. SUBNETWORK ----------
  /** Boshlang'ich nuqta joylashgan subnetwork (tier ichida, controller'lardan ta'minlanadigan hudud). */
  subnetwork(boshlar: string[], tosiqlar: string[] = []): Natija {
    const tos = new Set(tosiqlar);
    const yetgan = new Set<string>();
    const komplar: Array<Set<string>> = [];
    for (const b of boshlar) {
      if (yetgan.has(b) || tos.has(b) || !this.H.has(b)) continue;
      const c = this.qamrov([b], (n) => !tos.has(n));
      komplar.push(c);
      for (const x of c) yetgan.add(x);
    }
    const manba = this.manbalar(yetgan, false);
    if (manba.length) {
      const nomlar = [...new Set(manba.map((m) => this.controllerlar.get(m).subnetwork))].sort();
      return this.natija(yetgan, "subnetwork: " + nomlar.join(", "));
    }
    // 0.4 kV tarmoq: TP Chiqish terminalidan ta'minlanadi (faqat liniyasi bor qismlar)
    const tpKomp = komplar.filter((c) => c.size > 1 && this.manbalar(c).length);
    if (tpKomp.length) {
      const qism = new Set<string>();
      for (const c of tpKomp) for (const x of c) qism.add(x);
      const nomlar = [...new Set(this.manbalar(qism).map((m) => String(this.T.J.D.get(this.H.get(m).qurilma).p.NOMI || "(nomsiz)")))].sort();
      return this.natija(qism, "0.4 kV tarmoq — TP dan ta'minlanadi: " + nomlar.join(", "));
    }
    return new Natija([], [], "controller topilmadi — bu joy hech qaysi subnetwork'ga kirmaydi");
  }

  // ---------- 3. SUBNETWORK CONTROLLERS ----------
  subnetworkControllerlar(boshlar: string[], tosiqlar: string[] = []): Natija {
    const sn = this.subnetwork(boshlar, tosiqlar);
    const manba = this.manbalar(this.yetgan(boshlar, new Set(tosiqlar)), false);
    return new Natija([], manba.map((m) => this.controllerlar.get(m).qurilma), sn.izoh);
  }

  // ---------- 4-5. UPSTREAM / DOWNSTREAM ----------
  /** Boshlang'ich nuqtadan manba(lar)gacha bo'lgan hamma yo'llar. */
  upstream(boshlar: string[], tosiqlar: string[] = [], tierOshib = true, korilgan = new Set<string>()): Natija {
    const jami = new Set<string>();
    const yuqori = new Set<string>();
    for (const b of boshlar) {
      korilgan.add(b);
      const komp = this.komp.get(b);
      const dr = komp != null ? this.daraxt(komp, tosiqlar) : null;
      if (!dr || !dr.tugunBlok.has(b)) continue;
      let t = this.daraxtTuguni(b, dr);
      const yol = [t];
      while (t !== dr.ildiz) {
        t = dr.ota.get(t);
        yol.push(t);
      }
      const tug = this.blokTugunlari(yol, dr.bloklar);
      for (const x of tug) jami.add(x);
      // Manbaga yetdik. TP Chiqish bo'lsa — har doim TP Kirish tomondan davom etamiz (0.4 kV tarmoq o'sha TP ning
      // fideridan ta'minlanadi). Podstansiya Orta bo'lsa — faqat tier_oshib.
      for (const m of this.manbalar(tug)) {
        const y = this.yuqoriTomon(m);
        if (y && (tierOshib || this.H.get(m).ag === 2)) yuqori.add(y);
      }
    }
    let natija = this.natija(jami);
    const keyingi = [...yuqori].filter((y) => !korilgan.has(y));
    if (keyingi.length) natija = natija.yoki(this.upstream(keyingi, tosiqlar, tierOshib, korilgan));
    return natija;
  }

  /** Boshlang'ich nuqtadan manbadan uzoqlashuvchi tomondagi hamma narsa. */
  downstream(boshlar: string[], tosiqlar: string[] = [], tierOshib = true, korilgan = new Set<string>()): Natija {
    const tos = new Set(tosiqlar);
    const jami = new Set<string>();
    for (const b of boshlar) {
      korilgan.add(b);
      const komp = this.komp.get(b);
      if (komp != null && this.manbami(b)) {
        // Manbaning o'zidan: u ta'minlaydigan hamma narsa — boshqa manbalargacha. Ko'p manbali subnetworkda
        // manbalar orasidagi halqa ham kiradi, boshqa manbaning faqat o'zi ta'minlaydigan qismi kirmaydi.
        const boshqa = new Set(this.manbalar(this.kompTugunlari[komp]).filter((m) => m !== b));
        const tug = new Set([b]);
        const stek = tos.has(b) ? [] : [b];
        while (stek.length) {
          const x = stek.pop();
          for (const y of this.qoshnilar(x)) {
            if (tos.has(y) || tug.has(y) || boshqa.has(y)) continue;
            tug.add(y);
            stek.push(y);
          }
        }
        for (const x of tug) jami.add(x);
        continue;
      }
      const dr = komp != null ? this.daraxt(komp, tosiqlar) : null;
      if (!dr || !dr.tugunBlok.has(b)) continue;
      const t = this.daraxtTuguni(b, dr);
      if (t.startsWith(BLOK) && dr.bloklar[Number(t.slice(BLOK.length))].size === 2) {
        // Ko'prik (radial) blokidagi chetki tugun (masalan, fider oxiridagi TP Kirish terminali): uning ostida hech
        // narsa yo'q, blokdagi ikkinchi tugun esa uni ta'minlaydigan liniya — u yuqori oqimda, downstreamga kirmaydi.
        jami.add(b);
        continue;
      }
      const pastki = [t];
      const stek = [t];
      while (stek.length) {
        const x = stek.pop();
        for (const y of dr.bolalar.get(x) || []) {
          pastki.push(y);
          stek.push(y);
        }
      }
      for (const x of this.blokTugunlari(pastki, dr.bloklar)) jami.add(x);
    }
    let natija = this.natija(jami);
    // TP Kirish terminaliga yetgan bo'lsak — har doim Chiqish (0.4 kV) tomondan davom etamiz;
    // podstansiya Yuqori terminaliga yetgan bo'lsak — faqat tier_oshib bo'lsa, Orta tomondan.
    const quyi = new Set<string>();
    for (const n of jami) {
      if (n === X || !n.startsWith("n")) continue;
      const q = this.quyiTomon(n);
      if (q && (tierOshib || this.H.get(n).ag === 2)) quyi.add(q);
    }
    const keyingi = [...quyi].filter((q) => !korilgan.has(q));
    if (keyingi.length) natija = natija.yoki(this.downstream(keyingi, tosiqlar, tierOshib, korilgan));
    return natija;
  }

  /** Chegara qurilmaning quyi terminali → uning yuqori terminali. */
  private yuqoriTomon(h: string): string | null {
    const d = this.H.get(h);
    if (d.tur !== "terminal" || !Tracer.CHEGARA.has(d.ag)) return null;
    const [yuq, quyi] = QURILMA_TURLARI[d.ag].yol;
    if (d.terminal !== quyi) return null;
    return nk(this.T.terminalTuguni.get(tkalit(d.qurilma, yuq)));
  }

  private quyiTomon(h: string): string | null {
    const d = this.H.get(h);
    if (d.tur !== "terminal" || !Tracer.CHEGARA.has(d.ag)) return null;
    const [yuq, quyi] = QURILMA_TURLARI[d.ag].yol;
    if (d.terminal !== yuq) return null;
    return nk(this.T.terminalTuguni.get(tkalit(d.qurilma, quyi)));
  }

  // ---------- 6. LOOPS ----------
  /** Boshlang'ich nuqta komponentidagi halqada yotgan liniyalar (manbalarsiz, sof geometrik halqa). */
  loops(boshlar: string[], tosiqlar: string[] = []): Natija {
    const tos = new Set(tosiqlar);
    const yetgan = this.yetgan(boshlar, tos);
    const halqa = new Set<string>();
    for (const blok of biconnected([...yetgan], (n) => this.qoshnilar(n).filter((y) => yetgan.has(y)))) {
      if (blok.size > 2) for (const n of blok) halqa.add(n);
    }
    return this.natija(halqa);
  }

  // ---------- 7. SHORTEST PATH ----------
  /** Ikki nuqta orasidagi eng qisqa yo'l (uzunlik bo'yicha). Tier chegarasi o'tilmaydi. */
  shortestPath(a: string[], b: string[], tosiqlar: string[] = []): Natija {
    const tos = new Set(tosiqlar);
    // qirra-tugun grafida liniya uzunligi yarmidan ikki tomoniga taqsimlanadi
    const yarim = (n: string) => (this.H.get(n).uzunlik || 0) / 2;
    let eng: [number, string[]] | null = null;
    for (const x of a) {
      if (tos.has(x) || !this.H.has(x)) continue;
      for (const y of b) {
        if (tos.has(y) || !this.H.has(y)) continue;
        const r = dijkstra(x, y, (n) => this.qoshnilar(n).filter((m) => !tos.has(m)), (u, v) => yarim(u) + yarim(v));
        if (r && (!eng || r[0] < eng[0])) eng = r;
      }
    }
    if (!eng) return new Natija([], [], "yo'l topilmadi");
    return this.natija(eng[1], `uzunlik ${eng[0].toFixed(1)} m`);
  }

  // ---------- 8. ISOLATION ----------
  /** Boshlang'ich nuqtani o'chirish uchun yopiladigan viklyuchatellar va shunda tok o'chadigan hudud. */
  isolation(boshlar: string[], tosiqlar: string[] = []): Natija {
    const tos = new Set(tosiqlar);
    // 1) Boshlang'ich nuqtadan har tomonga, birinchi uchragan viklyuchatelgacha
    const isolating = new Set<number>();
    const korilgan = new Set(boshlar);
    const stek = boshlar.filter((b) => !tos.has(b));
    while (stek.length) {
      const x = stek.pop();
      for (const y of this.qoshnilar(x)) {
        if (tos.has(y) || korilgan.has(y)) continue;
        korilgan.add(y);
        const d = this.H.get(y);
        if (d.tur === "terminal" && Tracer.ISOLATING.has(d.ag)) {
          isolating.add(d.qurilma);
          continue;
        }
        stek.push(y);
      }
    }
    if (!isolating.size) return new Natija([], [], "yopiladigan qurilma topilmadi (tarmoqda viklyuchatel yo'q)");
    // 2) Shu viklyuchatellar yopilsa — manbadan uzilib qoladigan hudud
    const tos2 = new Set(tos);
    for (const [k, n] of this.T.terminalTuguni) if (isolating.has(Number(k.split("|")[0]))) tos2.add(nk(n));
    const tirik = this.yetgan([...this.controllerlar.keys()], tos2);
    const ochadi = new Set<string>();
    for (const b of boshlar) {
      if (tos2.has(b) || tirik.has(b) || ochadi.has(b)) continue;
      for (const x of this.qamrov([b], (n) => !tos2.has(n))) ochadi.add(x);
    }
    const n = this.natija(ochadi, `${isolating.size} ta viklyuchatel yopiladi`);
    for (const q of isolating) n.qurilmalar.add(q);
    return n;
  }
}

/** Biconnected komponentlar (Hopcroft–Tarjan, iterativ) — har biri tugunlar to'plami. Yakka tugunlar kirmaydi. */
export function biconnected(tugunlar: string[], qosh: (n: string) => string[]): Array<Set<string>> {
  const disc = new Map<string, number>();
  const low = new Map<string, number>();
  const bloklar: Array<Set<string>> = [];
  let vaqt = 0;
  for (const s of tugunlar) {
    if (disc.has(s)) continue;
    disc.set(s, vaqt);
    low.set(s, vaqt++);
    const qirralar: Array<[string, string]> = [];
    const stek: Array<{ v: string; ota: string | null; q: string[]; i: number }> = [{ v: s, ota: null, q: qosh(s), i: 0 }];
    while (stek.length) {
      const top = stek[stek.length - 1];
      if (top.i < top.q.length) {
        const w = top.q[top.i++];
        if (w === top.ota) continue;
        if (!disc.has(w)) {
          disc.set(w, vaqt);
          low.set(w, vaqt++);
          qirralar.push([top.v, w]);
          stek.push({ v: w, ota: top.v, q: qosh(w), i: 0 });
        } else if (disc.get(w) < disc.get(top.v)) {
          low.set(top.v, Math.min(low.get(top.v), disc.get(w)));
          qirralar.push([top.v, w]);
        }
      } else {
        stek.pop();
        if (!stek.length) break;
        const p = stek[stek.length - 1].v;
        low.set(p, Math.min(low.get(p), low.get(top.v)));
        if (low.get(top.v) >= disc.get(p)) {
          const blok = new Set<string>();
          for (;;) {
            const [a, b] = qirralar.pop();
            blok.add(a);
            blok.add(b);
            if (a === p && b === top.v) break;
          }
          bloklar.push(blok);
        }
      }
    }
  }
  return bloklar;
}

/** Dijkstra: [masofa, yo'l] yoki null (networkx single_source_dijkstra kabi — teng bo'lsa birinchi topilgani). */
function dijkstra(a: string, b: string, qosh: (n: string) => string[], vazn: (u: string, v: string) => number): [number, string[]] | null {
  const dist = new Map<string, number>([[a, 0]]);
  const oldingi = new Map<string, string>();
  const tayyor = new Set<string>();
  // ikkilik uyum: [masofa, tartib, tugun]
  const uyum: Array<[number, number, string]> = [[0, 0, a]];
  let tartib = 1;
  const kichik = (i: number, j: number) => uyum[i][0] < uyum[j][0] || (uyum[i][0] === uyum[j][0] && uyum[i][1] < uyum[j][1]);
  const ol = (): [number, number, string] => {
    const top = uyum[0];
    const oxiri = uyum.pop();
    if (uyum.length) {
      uyum[0] = oxiri;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < uyum.length && kichik(l, m)) m = l;
        if (r < uyum.length && kichik(r, m)) m = r;
        if (m === i) break;
        [uyum[i], uyum[m]] = [uyum[m], uyum[i]];
        i = m;
      }
    }
    return top;
  };
  const qoy = (x: [number, number, string]) => {
    uyum.push(x);
    let i = uyum.length - 1;
    while (i > 0) {
      const o = (i - 1) >> 1;
      if (!kichik(i, o)) break;
      [uyum[i], uyum[o]] = [uyum[o], uyum[i]];
      i = o;
    }
  };
  while (uyum.length) {
    const [d, , u] = ol();
    if (tayyor.has(u)) continue;
    tayyor.add(u);
    if (u === b) {
      const yol = [b];
      while (yol[yol.length - 1] !== a) yol.push(oldingi.get(yol[yol.length - 1]));
      return [d, yol.reverse()];
    }
    for (const v of qosh(u)) {
      if (tayyor.has(v)) continue;
      const nd = d + vazn(u, v);
      if (!dist.has(v) || nd < dist.get(v)) {
        dist.set(v, nd);
        oldingi.set(v, u);
        qoy([nd, tartib++, v]);
      }
    }
  }
  return null;
}
