/**
 * UnElektr dvigateli — widget ichida ishlaydi (avvalgi Python UN_Dvigatel serverining o'rnida).
 *
 * So'rov va javoblar shakli o'sha serverdagidek (sync, trace, xatolar, obyekt, /tahrir/...), shuning uchun widget
 * dvigatel bilan avvalgidek gaplashadi — faqat tarmoq orqali emas, xotirada. Ma'lumot Feature Layerdan keladi
 * (sync), o'zgarishlarni widget Feature Layerga o'zi yozadi; tarix — Feature Service jadvalida yoki brauzerda.
 */
import { EngineXato, gidNormal, liniyalardan, qurilmalardan, type FlMaydon } from "./jadval";
import { holatYasa, xatolar, type Holat, type QatlamNomi } from "./holat";
import { QURILMA_TURLARI } from "./graf";
import { Tahrir } from "./tahrir";
import { TarixXizmati } from "./tarix";
import { geojsonga } from "./xatolar";
import type { Natija } from "./trace";

export { EngineXato };

export interface EngineHolat {
  liniyalar: number;
  qurilmalar: number;
  controllerlar: number;
  graf_qurilish_vaqti_s?: number;
  kop_qismli?: number;
}

export interface TraceParams {
  turi: string;
  boshlar: string[];
  tosiqlar?: string[];
  gacha?: string[];
  tierOshib?: boolean;
}

export interface GeoJsonFC {
  type: "FeatureCollection";
  features: any[];
  xulosa?: { trace?: string; liniyalar?: number; qurilmalar?: number; izoh?: string; vaqt_s?: number };
}

const TRACE_TURLARI = ["connected", "subnetwork", "subnetwork_controllers", "upstream", "downstream", "loops", "isolation", "shortest_path"];

const toza = (v: any) => (v == null || (typeof v === "number" && isNaN(v)) ? null : v);

export class Dvigatel {
  private h: Holat | null = null;

  constructor(
    private tarixX: TarixXizmati,
    /** "Baribir saqlash" (majburan) ruxsatmi — faqat admin. */
    private adminmi: () => boolean,
  ) {}

  /** Tarix saqlanadigan joyni almashtirish (jadval sozlangan / topilmagan). */
  tarixniOrnat(t: TarixXizmati) {
    this.tarixX = t;
  }

  get tarixJoyi(): string {
    return this.tarixX.omborNomi;
  }

  private tayyor(): Holat {
    if (!this.h) throw new EngineXato("Graf yuklanmagan — avval Feature Layerdan yuklang", 503);
    return this.h;
  }

  private tahrir(): Tahrir {
    return new Tahrir(this.tayyor(), this.adminmi());
  }

  async holat(): Promise<EngineHolat & { izoh?: string }> {
    const h = this.h;
    if (!h) return { liniyalar: 0, qurilmalar: 0, controllerlar: 0, graf_qurilish_vaqti_s: 0, izoh: "Graf bo'sh" };
    return { liniyalar: h.J.L.size, qurilmalar: h.J.D.size, controllerlar: h.tr.controllerlar.size, graf_qurilish_vaqti_s: h.yuklandi };
  }

  /** Feature Layer GeoJSON nusxasidan grafni qayta quradi. */
  async sync(payload: { liniyalar: GeoJsonFC; qurilmalar: GeoJsonFC; maydonlar: { liniya: any[]; qurilma: any[] } }) {
    const kopQismli = new Set<string>();
    let h: Holat;
    try {
      const J = { L: liniyalardan(payload.liniyalar, kopQismli), D: qurilmalardan(payload.qurilmalar) };
      const maydonlar = {} as Record<QatlamNomi, FlMaydon[]>;
      for (const q of ["liniya", "qurilma"] as QatlamNomi[]) {
        maydonlar[q] = (payload.maydonlar?.[q] || []).filter((m: any) => m?.name).map((m: any) => ({ ...m, name: String(m.name).toUpperCase() }));
      }
      h = holatYasa(J, maydonlar, kopQismli);
    } catch (e: any) {
      if (e instanceof EngineXato) throw e;
      throw new EngineXato(`Sync xato: ${e?.message || e}`, 400);
    }
    this.h = h;
    return {
      ok: true, liniyalar: h.J.L.size, qurilmalar: h.J.D.size, controllerlar: h.tr.controllerlar.size,
      kop_qismli: kopQismli.size, graf_qurilish_vaqti_s: h.yuklandi,
    };
  }

  /**
   * GLOBALID ro'yxati → grafdagi boshlang'ich tugunlar.
   * Podstansiya butunligicha tanlansa (UN_Dvigatel server.py dagidek):
   *   Downstream, Subnetwork, Subnetwork Controllers — faqat quyi (O'rta) terminalidan: PS "pastida" uning
   *                6/10 kV fiderlari va TP lari turadi, controller ham shu terminalda.
   *   Upstream   — faqat yuqori (Yuqori) terminalidan: PS ni ta'minlovchi 35/110 kV yo'l.
   * Aks holda ikkinchi terminal tomonidagi halqalar (35/110 kV halqa yoki bir necha PS dan ta'minlanadigan
   * 10 kV tarmoq) natijaga qo'shilib ketardi — halqada yo'nalish aniqlanmaydi.
   */
  private boshlar(gidlar: string[], turi?: string): string[] {
    const h = this.tayyor(), tr = h.tr;
    const natija: string[] = [];
    for (const gid of gidlar) {
      let g = gid.trim().toUpperCase();
      if (!g.startsWith("{")) g = "{" + g + "}";
      if (tr.lgid.has(g)) natija.push(...tr.liniya(g));
      else if (tr.dgid.has(g)) {
        const ag = Number(h.J.D.get(tr.dgid.get(g)).p.ASSETGROUP);
        if (ag === 1 && ["downstream", "upstream", "subnetwork", "subnetwork_controllers"].includes(turi)) {
          const [yuqori, quyi] = QURILMA_TURLARI[1].yol;
          natija.push(...tr.qurilma(g, turi === "upstream" ? yuqori : quyi));
        } else natija.push(...tr.qurilma(g));
      } else throw new EngineXato(`Bunday GLOBALID topilmadi: ${gid}`, 404);
    }
    return natija;
  }

  private liniyaXossa(oid: number) {
    const p = this.h.J.L.get(oid).p;
    return {
      GLOBALID: p.GLOBALID, tur: "liniya", NOMI: toza(p.NOMI), KUCHLANISH: toza(p.KUCHLANISH), TUMAN_ID: toza(p.TUMAN_ID),
      UZUNLIK_M: toza(p.UZUNLIK_M), SIM: toza(p.SIMNING_M), IDORA: toza(p.IDOR_MAN),
    };
  }

  private qurilmaXossa(oid: number) {
    const p = this.h.J.D.get(oid).p;
    return {
      GLOBALID: p.GLOBALID, tur: QURILMA_TURLARI[Number(p.ASSETGROUP)]?.nomi || "?", NOMI: toza(p.NOMI),
      KUCHLANISH: toza(p.KUCHLANISH), TUMAN_ID: toza(p.TUMAN_ID), USKUNA: toza(p.USKUNALAR_N_T), IDORA: toza(p.IDOR_MAN),
    };
  }

  private geojson(n: Natija): any[] {
    const { L, D } = this.h.J;
    const s = (x: Set<number>) => [...x].sort((a, b) => a - b);
    return [
      ...s(n.liniyalar).filter((o) => L.has(o)).map((o) => ({
        type: "Feature", geometry: { type: "LineString", coordinates: L.get(o).c84 }, properties: this.liniyaXossa(o),
      })),
      ...s(n.qurilmalar).filter((o) => D.has(o)).map((o) => ({
        type: "Feature", geometry: { type: "Point", coordinates: [D.get(o).lon, D.get(o).lat] }, properties: this.qurilmaXossa(o),
      })),
    ];
  }

  async trace(p: TraceParams): Promise<GeoJsonFC> {
    if (!TRACE_TURLARI.includes(p.turi)) throw new EngineXato(`Noma'lum trace turi. Mumkin: ${TRACE_TURLARI.join(", ")}`, 400);
    const tr = this.tayyor().tr;
    const b = this.boshlar(p.boshlar || [], p.turi);
    const tos = this.boshlar(p.tosiqlar || []);
    const tier = p.tierOshib ?? true;
    const t0 = Date.now();
    let n: Natija;
    switch (p.turi) {
      case "connected": n = tr.connected(b, tos); break;
      case "subnetwork": n = tr.subnetwork(b, tos); break;
      case "subnetwork_controllers": n = tr.subnetworkControllerlar(b, tos); break;
      case "upstream": n = tr.upstream(b, tos, tier); break;
      case "downstream": n = tr.downstream(b, tos, tier); break;
      case "loops": n = tr.loops(b, tos); break;
      case "isolation": n = tr.isolation(b, tos); break;
      default:
        if (!p.gacha?.length) throw new EngineXato("shortest_path uchun 'gacha' parametri kerak", 400);
        n = tr.shortestPath(b, this.boshlar(p.gacha), tos);
    }
    return {
      type: "FeatureCollection", features: this.geojson(n),
      xulosa: { trace: p.turi, liniyalar: n.liniyalar.size, qurilmalar: n.qurilmalar.size, izoh: n.izoh, vaqt_s: (Date.now() - t0) / 1000 },
    };
  }

  async xatolar(kod?: string): Promise<GeoJsonFC> {
    const X = xatolar(this.tayyor());
    return geojsonga(kod ? X.filter((r) => r.KOD === kod.toUpperCase()) : X);
  }

  async obyekt(globalid: string): Promise<Record<string, any>> {
    const h = this.tayyor();
    const g = gidNormal(globalid);
    let p: Record<string, any>, tur: string;
    if (h.tr.lgid.has(g)) {
      p = h.J.L.get(h.tr.lgid.get(g)).p;
      tur = "liniya";
    } else if (h.tr.dgid.has(g)) {
      p = h.J.D.get(h.tr.dgid.get(g)).p;
      tur = QURILMA_TURLARI[Number(p.ASSETGROUP)]?.nomi || "?";
    } else throw new EngineXato("Bunday GLOBALID topilmadi", 404);
    const r: Record<string, any> = {};
    for (const [k, v] of Object.entries(p)) r[k] = toza(v);
    r.tur = tur;
    return r;
  }

  async maydonlar(globalid: string) {
    return this.tahrir().maydonlar(globalid);
  }

  async tarix(limit = 200): Promise<any[]> {
    return this.tarixX.tarix(limit);
  }

  /** /tahrir/... GET so'rovlari. */
  async get(yol: string): Promise<any> {
    const p = yol.split("?")[0];
    if (p === "/tahrir/kutilayotgan") return this.tarixX.kutilayotganRoyxat();
    if (p === "/tahrir/qaytarish") return this.tarixX.qaytarish();
    throw new EngineXato(`Noma'lum so'rov: ${yol}`, 404);
  }

  /** /tahrir/... POST so'rovlari. */
  async post(yol: string, body: any): Promise<any> {
    const b = body ?? {};
    switch (yol) {
      case "/tahrir/atribut": return this.tahrir().atribut(b);
      case "/tahrir/qirqish": return this.tahrir().qirqish(b);
      case "/tahrir/qurilma": return this.tahrir().qurilma(b);
      case "/tahrir/liniya": return this.tahrir().liniya(b);
      case "/tahrir/kochirish": return this.tahrir().kochirish(b);
      case "/tahrir/geometriya": return this.tahrir().geometriya(b);
      case "/tahrir/ochirish": return this.tahrir().ochirish(b);
      case "/tahrir/qayd": return this.tarixX.qayd(b);
      case "/tahrir/kutilayotgan": return this.tarixX.kutilayotganQosh(b);
      case "/tahrir/kutilayotgan/yuborildi": return this.tarixX.kutilayotganYuborildi(b);
      case "/tahrir/kutilayotgan/bekor": return this.tarixX.kutilayotganBekor(b);
      case "/tahrir/qaytarildi": return this.tarixX.qaytarildi(b);
      default: throw new EngineXato(`Noma'lum so'rov: ${yol}`, 404);
    }
  }
}
