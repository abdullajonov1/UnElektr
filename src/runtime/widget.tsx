/**
 * UnElektr — elektr tarmog'i: trace, tekshiruv va tahrirlash. Mustaqil widget: tashqi server kerak emas.
 *
 * Obyektlar Feature Layerdan o'qiladi va yoziladi (applyEdits). Trace, tekshiruv va har bir tahrirning
 * rejasi/tekshiruvi — widget ichidagi dvigatelda (./dvigatel):
 *   1. Feature Layer → dvigatel.sync (graf xotirada quriladi)
 *   2. Tahrir: dvigatel sinov qiladi (sinov=true) → foydalanuvchi tasdiqlaydi → dvigatel tekshirib
 *      o'zgarishlar to'plamini qaytaradi → widget uni Feature Layerga yozadi → tarixga qo'shadi → qayta yuklaydi.
 * Tarix — sozlamadagi Feature Service jadvalida, jadval bo'lmasa brauzerda.
 */
import { React, type AllWidgetProps } from "jimu-core";
import { JimuMapViewComponent, loadArcGISJSAPIModules, type JimuMapView } from "jimu-arcgis";
import { readConfig, type Config } from "../config";
import HeaderTabs, { type MainTab, type SearchHit } from "./components/HeaderTabs";
import Ribbon, { type Fon, type Rejim } from "./components/Ribbon";
import ContentsPanel from "./components/ContentsPanel";
import TracePanel, { TRACE_TYPES, type Rol, type TraceNatija } from "./components/TracePanel";
import HistoryPanel, { type HistoryItem } from "./components/HistoryPanel";
import ResultsTable, { type JadvalFiltr } from "./components/ResultsTable";
import StatusBar from "./components/StatusBar";
import MaydonForma, { XatoQuti, formaQiymatlari, ozgarganmi, type Maydon, type XatoInfo } from "./components/MaydonForma";
import EmbeddedMap from "./embedded-map";
import { Dvigatel, EngineXato } from "./dvigatel";
import { BrauzerKutilayotgan, BrauzerTarix, JadvalTarix, TarixXizmati, type TarixOmbori } from "./dvigatel/tarix";
import { layerSchema, layerToGeoJson, normalizeGlobalId } from "./fl-oqish";
import { fieldName, resolveLayers, KV_COLORS, KV_ORDER } from "./layers";
import { classifyPick, findMapLayerByUrl, layerPicksFromUseDataSources } from "./layer-picks";
import { Tarmoq, kvMatn, nomi, qatorF, turMatn, ustigaQolla, uzunlikM, type Feat, type Qator, type Ustma } from "./network";
import { chiziqKoord, extentOf, fromGeoJson, geoInit, lonLat, pikselMetr, project } from "./geo";
import { qolla, ruxsatXatosimi, toplamBosh, yozishMumkinmi } from "./fl-edit";
import Icon from "./components/Icon";
import { TilContext, son, t, tilniOrnat, tx, type Mavzu, type Til } from "./i18n";
import { fonRangi, fonYasa } from "./fon";
import { fonTuri, mavzugaMosFon } from "./fon-royxat";
import "./widget.css";

type RightPanel = "trace" | "atribut" | "tarix";

type Panel =
  | { k: "bosh" }
  | { k: "yuklanmoqda" }
  | { k: "obyekt"; gid: string; attrs: Record<string, any> | null; xato?: string }
  | { k: "xato"; props: Record<string, any> }
  | { k: "forma"; gid: string; qatlam: string; maydonlar: Maydon[]; asl: Record<string, any> }
  | { k: "ochirish"; gidlar: string[]; korish: any }
  | { k: "xabar"; matn: string };

interface State {
  tab: MainTab;
  right: RightPanel;
  mapReady: boolean;
  mapMessage: string;
  contentsCollapsed: boolean;
  lineVisible: Record<string, boolean>;
  deviceVisible: Record<string, boolean>;
  soni: Record<string, number>;
  basemap: Fon;
  search: string;
  searchHits: SearchHit[] | null;
  tanlov: string[];
  panel: Panel;
  forma: Record<string, string>;
  saqlanmoqda: boolean;
  xato: XatoInfo | null;
  tableOpen: boolean;
  tableTitle: string;
  tableRows: Qator[];
  tableVersion: number;
  tableFilter: JadvalFiltr;
  traceTuri: string;
  nuqtalar: Record<Rol, string[]>;
  tierOshib: boolean;
  traceRunning: boolean;
  traceNatija: TraceNatija | null;
  fiz1: boolean;
  ogoh2: boolean;
  history: HistoryItem[];
  historyLoading: boolean;
  historyXato: string;
  /** Holat matni (o'zbekcha kalit — t() bilan) va o'zgaruvchilari. */
  serverStatus: string;
  serverVars: Record<string, any>;
  serverOk: boolean | null;
  toast: string;
  toastError: boolean;
  scale: number;
  coords: string;
  til: Til;
  mavzu: Mavzu;
  /** Tizim (brauzer) qorong'i mavzudami — mavzu "auto" bo'lsa ishlatiladi. */
  tizimQorongi: boolean;
  rejim: Rejim;
  rejimXabar: string;
  qirqKorish: any;
  qurTur: number;
  qurKorish: any;
  linKorish: any;
  kochObyekt: { gid: string; tur: string; nomi: string; kv: any } | null;
  kochKorish: any;
  /** Feature Layerga yozib bo'lmasa — sababi (tahrir panellarida ko'rsatiladi). */
  yozishXato: string;
  /** Brauzerda mahalliy saqlangan, Feature Layerga hali yozilmagan o'zgarishlar soni. */
  kutilayotgan: number;
  /** Birinchi yuklash (Feature Layer → graf) tugadimi — shungacha xarita ustida markaziy yuklanish ko'rinadi. */
  tarmoqTayyor: boolean;
}

const ROL_NOMI: Record<string, string> = { koruvchi: "Ko'ruvchi", muharrir: "Muharrir", admin: "Administrator" };
const SAQLASH_KALITI = { til: "unelektr:til", mavzu: "unelektr:mavzu", fon: "unelektr:fon" };

function oqi(k: string): string | null {
  try {
    return window.localStorage.getItem(k);
  } catch {
    return null;
  }
}

function yoz(k: string, v: string) {
  try {
    window.localStorage.setItem(k, v);
  } catch {
    /* brauzer xotirasi yopiq — faqat shu seans uchun */
  }
}

function tizimQorongimi(): boolean {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}
const ROL_RANG: Record<Rol, string> = { bosh: "#1e8e4e", tosiq: "#c0392b", gacha: "#6d3fc0" };
const QUR_TURLARI: Record<number, { nom: string; belgi: string }> = {
  2: { nom: "Transformator punkti", belgi: "Transformator" },
  1: { nom: "Podstansiya", belgi: "Podstansiya" },
};
const QURILMA_AG: Record<string, number> = { Podstansiya: 1, Transformator: 2, Tashqi_manba: 3 };
const CYAN = [0, 255, 255, 1];
const QIZIL = "#d62828";

function belgiSimvol(tur: string, katta = false): any {
  if (tur === "Podstansiya") {
    return { type: "simple-marker", style: "square", size: katta ? 15 : 11, color: "#ffd166", outline: { color: "#7a1d1d", width: 1.8 } };
  }
  if (tur === "Tashqi_manba") {
    return { type: "simple-marker", style: "triangle", size: katta ? 20 : 16, color: "#d62828", outline: { color: "#fff", width: 1.6 } };
  }
  return { type: "simple-marker", style: "circle", size: katta ? 16 : 12, color: "#ffd60a", outline: { color: "#1f3b70", width: 1.8 } };
}

export default class Widget extends React.PureComponent<AllWidgetProps<Config>, State> {
  state: State = {
    tab: "xarita",
    right: "trace",
    mapReady: false,
    mapMessage: "",
    contentsCollapsed: false,
    lineVisible: { "0.4": true, "6": true, "10": true, "35": true, "110": true },
    deviceVisible: { Podstansiya: true, Transformator: true, Tashqi_manba: true },
    soni: {},
    basemap: "osm",
    search: "",
    searchHits: null,
    tanlov: [],
    panel: { k: "bosh" },
    forma: {},
    saqlanmoqda: false,
    xato: null,
    tableOpen: false,
    tableTitle: "Atribut jadvali",
    tableRows: [],
    tableVersion: 0,
    tableFilter: "hammasi",
    traceTuri: "downstream",
    nuqtalar: { bosh: [], tosiq: [], gacha: [] },
    tierOshib: false,
    traceRunning: false,
    traceNatija: null,
    fiz1: false,
    ogoh2: false,
    history: [],
    historyLoading: false,
    historyXato: "",
    serverStatus: "Tarmoq yuklanmoqda…",
    serverVars: {},
    serverOk: null,
    toast: "",
    toastError: false,
    scale: 0,
    coords: "",
    til: "uz",
    mavzu: "auto",
    tizimQorongi: tizimQorongimi(),
    rejim: null,
    rejimXabar: "",
    qirqKorish: null,
    qurTur: 2,
    qurKorish: null,
    linKorish: null,
    kochObyekt: null,
    kochKorish: null,
    yozishXato: "",
    kutilayotgan: 0,
    tarmoqTayyor: false,
  };

  private jimuMapView: JimuMapView | null = null;
  private view: any = null;
  private lineLayer: any = null;
  private deviceLayer: any = null;
  private tarmoq: Tarmoq = new Tarmoq();
  private xatoFeatures: any[] = [];
  private tanlovLayer: any = null;
  private belgiLayer: any = null;
  private xatoLayer: any = null;
  private tahrirLayer: any = null;
  private mahalliyLayer: any = null;
  private ustma: Ustma = { mahalliy: new Set(), yashirin: { liniya: [], qurilma: [] } };
  private svm: any = null;
  private handles: any[] = [];
  private highlightHandles: any[] = [];
  private highlightToken = 0;
  private toastTimer: any = null;
  private coordFrame = 0;
  private chizishDavom = false;
  private bekorVaqt = 0;
  private kochGraphic: any = null;
  private Graphic: any = null;
  private mql: MediaQueryList | null = null;
  private dvigatel: Dvigatel;
  private rootRef = React.createRef<HTMLDivElement>();
  /** Chap panel yoki jadval oxirgi marta qachon ochildi/yopildi (xarita o'lchami shu payt o'zgaradi). */
  private joyOzgardi = 0;

  constructor(props: AllWidgetProps<Config>) {
    super(props);
    this.dvigatel = new Dvigatel(this.tarixXizmati(new BrauzerTarix("unelektr:tarix"), "unelektr"), () => this.isAdmin());
    const cfg = readConfig(props.config);
    const til = (oqi(SAQLASH_KALITI.til) || cfg.til) as Til;
    const mavzu = (oqi(SAQLASH_KALITI.mavzu) || cfg.mavzu) as Mavzu;
    this.state.til = ["uz", "kr", "ru"].includes(til) ? til : "uz";
    this.state.mavzu = ["light", "dark", "auto"].includes(mavzu) ? mavzu : "auto";
    const fon = oqi(SAQLASH_KALITI.fon) as Fon;
    this.state.basemap = fon && fonTuri(fon) ? fon : mavzugaMosFon("osm", this.qorongimi(this.state));
    tilniOrnat(this.state.til);
  }

  private qorongimi(s: Pick<State, "mavzu" | "tizimQorongi"> = this.state): boolean {
    return s.mavzu === "dark" || (s.mavzu === "auto" && s.tizimQorongi);
  }

  private tilniTanla = (til: Til) => {
    tilniOrnat(til);
    yoz(SAQLASH_KALITI.til, til);
    this.setState({ til });
  };

  private mavzuniTanla = (mavzu: Mavzu) => {
    yoz(SAQLASH_KALITI.mavzu, mavzu);
    this.mavzuQollandi({ mavzu });
  };

  /** Mavzu o'zgardi: ko'cha xaritasi bilan qorong'i xarita ham birga almashadi. */
  private mavzuQollandi(o: Partial<Pick<State, "mavzu" | "tizimQorongi">>) {
    const oldin = this.qorongimi();
    const keyin = this.qorongimi({ ...this.state, ...o } as State);
    const s: Partial<State> = { ...o };
    const fon = mavzugaMosFon(this.state.basemap, keyin);
    if (oldin !== keyin && fon !== this.state.basemap) {
      s.basemap = fon;
      yoz(SAQLASH_KALITI.fon, fon);
      if (this.props.useMapWidgetIds?.[0]) this.applyBasemap(fon);
    }
    this.setState(s as State);
    try {
      if (this.view && !this.props.useMapWidgetIds?.[0]) this.view.background = { color: fonRangi(keyin) };
    } catch {
      /* ignore */
    }
  }

  private onTizimMavzu = (e: MediaQueryListEvent) => this.mavzuQollandi({ tizimQorongi: e.matches });

  // ================================================================ yordamchi
  private cfg() {
    return readConfig(this.props.config);
  }

  private foydalanuvchi(): string {
    const u: any = (this.props as any).user;
    return String(u?.username || u?.fullName || "");
  }

  private engine(): Dvigatel {
    return this.dvigatel;
  }

  private tarixXizmati(ombor: TarixOmbori, kalit: string): TarixXizmati {
    return new TarixXizmati(ombor, new BrauzerKutilayotgan(kalit + ":kutilayotgan"), () => this.foydalanuvchi());
  }

  /** Tarix joyi: sozlamadagi Feature Service jadvali, bo'lmasa (yoki ochilmasa) — brauzer (shu liniya qatlami uchun). */
  private async tarixniSozla(Graphic: any) {
    const l = this.lineLayer;
    const kalit = "unelektr:" + (l?.url ? `${l.url}/${l.layerId ?? ""}` : "standart");
    let ombor: TarixOmbori = new BrauzerTarix(kalit + ":tarix");
    const url = this.cfg().tarixJadvalUrl;
    if (url) {
      try {
        const [FeatureLayer] = await loadArcGISJSAPIModules(["esri/layers/FeatureLayer"]);
        const jadval = new JadvalTarix(new FeatureLayer({ url }), Graphic);
        await jadval.tayyorla();
        ombor = jadval;
      } catch (e: any) {
        this.xabar(t("Tarix jadvali ochilmadi — tarix brauzerda saqlanadi:") + " " + tx(e?.message || String(e)), true);
      }
    }
    this.dvigatel.tarixniOrnat(this.tarixXizmati(ombor, kalit));
  }

  private canEdit() {
    const r = this.cfg().role;
    return r === "muharrir" || r === "admin";
  }

  private isAdmin() {
    return this.cfg().role === "admin";
  }

  private xabar(matn: string, xato = false) {
    clearTimeout(this.toastTimer);
    this.setState({ toast: matn, toastError: xato });
    this.toastTimer = setTimeout(() => this.setState({ toast: "", toastError: false }), 3500);
  }

  private layerOf(qatlam: string): any {
    return qatlam === "liniya" ? this.lineLayer : this.deviceLayer;
  }

  private xatoInfo(e: any, sarlavha: string, majburanMatn: string): XatoInfo {
    if (e instanceof EngineXato && e.holat === 409 && e.tafsilot?.xatolar) {
      return {
        sarlavha,
        matn: e.tafsilot.xabar,
        xatolar: e.tafsilot.xatolar,
        majburanMatn: this.isAdmin() ? majburanMatn : undefined,
      };
    }
    return { sarlavha, matn: e?.message || String(e) };
  }

  // ================================================================ hayot sikli
  componentDidMount(): void {
    document.addEventListener("keydown", this.onKeyDown);
    document.addEventListener("click", this.onDocClick);
    try {
      this.mql = window.matchMedia("(prefers-color-scheme: dark)");
      this.mql.addEventListener("change", this.onTizimMavzu);
    } catch {
      this.mql = null;
    }
  }

  componentDidUpdate(prevProps: AllWidgetProps<Config>, prevState: State): void {
    const prevDs = JSON.stringify(prevProps.useDataSources || []);
    const nextDs = JSON.stringify(this.props.useDataSources || []);
    if (prevDs !== nextDs && this.jimuMapView?.view && this.props.useMapWidgetIds?.[0]) {
      void this.onActiveViewChange(this.jimuMapView);
    }
    // chap panel va jadval xaritani surib ochiladi — xarita o'lchami o'zgaradi, MapView o'zi moslashadi
    if (prevState.contentsCollapsed !== this.state.contentsCollapsed || prevState.tableOpen !== this.state.tableOpen) {
      this.joyOzgardi = performance.now();
    }
  }

  componentWillUnmount(): void {
    document.removeEventListener("keydown", this.onKeyDown);
    document.removeEventListener("click", this.onDocClick);
    try {
      this.mql?.removeEventListener("change", this.onTizimMavzu);
    } catch {
      /* ignore */
    }
    this.teardownMap();

    clearTimeout(this.toastTimer);
  }

  private teardownMap() {
    for (const h of this.handles) {
      try {
        h?.remove?.();
      } catch {
        /* ignore */
      }
    }
    this.handles = [];
    this.highlightHandles.forEach((h) => h?.remove?.());
    this.highlightHandles = [];
    try {
      this.svm?.destroy?.();
    } catch {
      /* ignore */
    }
    this.svm = null;
    const map = this.view?.map;
    for (const l of [this.mahalliyLayer, this.tanlovLayer, this.belgiLayer, this.xatoLayer, this.tahrirLayer]) {
      try {
        if (l && map) map.remove(l);
      } catch {
        /* ignore */
      }
    }
    this.tanlovLayer = this.belgiLayer = this.xatoLayer = this.tahrirLayer = this.mahalliyLayer = null;
  }

  // ================================================================ xaritaga ulanish
  private onActiveViewChange = async (jimuMapView: JimuMapView) => {
    if (!jimuMapView?.view) {
      this.setState({ mapReady: false, mapMessage: "Xarita ko'rinishi topilmadi." });
      return;
    }
    this.jimuMapView = jimuMapView;
    const cfg = this.cfg();
    try {
      const [FeatureLayer] = await loadArcGISJSAPIModules(["esri/layers/FeatureLayer"]);
      const resolved = await this.resolveLineDeviceLayers(
        jimuMapView.view.map, FeatureLayer, cfg.lineLayerTitle, cfg.deviceLayerTitle,
      );
      await this.bindView(jimuMapView.view, resolved);
    } catch (err: any) {
      this.setState({ mapReady: false, mapMessage: err?.message || "Xaritaga ulanib bo'lmadi" });
    }
  };

  /** Ichki xarita (Select data) tayyor bo'ldi. */
  private onEmbeddedReady = async (view: any, layers: { lineLayer: any; deviceLayer: any }) => {
    this.jimuMapView = null;
    await this.bindView(view, layers);
  };

  /** Sozlamadagi Select data (useDataSources) → xarita / URL FeatureLayer. */
  private async resolveLineDeviceLayers(
    map: any, FeatureLayer: any, lineTitle: string, deviceTitle: string,
  ): Promise<{ lineLayer: any; deviceLayer: any }> {
    const picks = layerPicksFromUseDataSources(this.props.useDataSources);
    let lineLayer: any = null;
    let deviceLayer: any = null;
    const ensureLayer = async (pick: { url: string; title: string }) => {
      if (!pick.url) return null;
      const onMap = findMapLayerByUrl(map, pick.url);
      if (onMap) return onMap;
      try {
        const fl = new FeatureLayer({ url: pick.url, title: pick.title || pick.url });
        await fl.load();
        return fl; // xaritaga qo'shilmasa ham query/applyEdits ishlaydi
      } catch {
        return null;
      }
    };
    for (const pick of picks) {
      const kind = classifyPick(pick);
      const layer = await ensureLayer(pick);
      if (!layer) continue;
      const g = String(layer.geometryType || "").toLowerCase();
      if (kind === "line" || g.includes("polyline")) {
        if (!lineLayer) lineLayer = layer;
      } else if (kind === "device" || g.includes("point")) {
        if (!deviceLayer) deviceLayer = layer;
      }
    }
    if (!lineLayer || !deviceLayer) {
      const auto = resolveLayers(map, lineTitle, deviceTitle);
      if (!lineLayer) lineLayer = auto.lineLayer;
      if (!deviceLayer) deviceLayer = auto.deviceLayer;
    }
    return { lineLayer, deviceLayer };
  }

  private bindView = async (view: any, layers: { lineLayer: any; deviceLayer: any }) => {
    this.teardownMap();
    this.view = view;
    this.lineLayer = layers.lineLayer;
    this.deviceLayer = layers.deviceLayer;
    if (!this.lineLayer || !this.deviceLayer) {
      this.setState({ mapReady: false, mapMessage: "Liniya va qurilma Feature Layerlari topilmadi (sozlamalarda Select data)." });
      return;
    }
    try {
      const [GraphicsLayer, Graphic, SketchViewModel] = await loadArcGISJSAPIModules([
        "esri/layers/GraphicsLayer",
        "esri/Graphic",
        "esri/widgets/Sketch/SketchViewModel",
      ]);
      await geoInit();
      await Promise.all([this.lineLayer.load?.(), this.deviceLayer.load?.()]);
      this.Graphic = Graphic;

      const gl = (title: string) => new GraphicsLayer({ title, listMode: "hide" });
      this.mahalliyLayer = gl("UnElektr mahalliy o'zgarishlar");
      this.tanlovLayer = gl("UnElektr tanlov");
      this.xatoLayer = gl("UnElektr xatolar");
      this.belgiLayer = gl("UnElektr trace nuqtalari");
      this.tahrirLayer = gl("UnElektr tahrir");
      view.map.addMany([this.mahalliyLayer, this.tanlovLayer, this.xatoLayer, this.belgiLayer, this.tahrirLayer]);

      try {
        view.highlightOptions = { color: CYAN, haloOpacity: 1, fillOpacity: 0.35 };
      } catch {
        /* eski API */
      }

      this.svm = new SketchViewModel({
        view,
        layer: this.tahrirLayer,
        updateOnGraphicClick: false,
        defaultUpdateOptions: { toggleToolOnClick: false, enableRotation: false, enableScaling: false, multipleSelectionEnabled: false },
        polylineSymbol: { type: "simple-line", color: QIZIL, width: 3, style: "dash" },
      });
      try {
        // yopishish: avval qurilmalar, keyin liniyalar (dvigatel ham saqlashda uchlarni yopishtiradi)
        this.svm.snappingOptions = {
          enabled: true,
          featureSources: [{ layer: this.deviceLayer, enabled: true }, { layer: this.lineLayer, enabled: true }],
        };
      } catch {
        /* qatlam turi snappingni qo'llamasa — dvigatel tolerans bilan yopishtiradi */
      }
      this.handles.push(
        this.svm.on("create", this.onSketchCreate),
        this.svm.on("update", this.onSketchUpdate),
        view.on("click", (e: any): void => { void this.onMapClick(e); }),
        view.on("pointer-move", (e: any) => this.onPointerMove(e)),
        view.watch("scale", (s: number) => this.setState({ scale: s || 0 })),
      );
      if (!this.props.useMapWidgetIds?.[0]) {
        try {
          view.background = { color: fonRangi(this.qorongimi()) };
        } catch {
          /* ignore */
        }
      } else if (this.state.basemap !== "osm") {
        this.applyBasemap(this.state.basemap);
      }

      const yozishXato = [yozishMumkinmi(this.lineLayer), yozishMumkinmi(this.deviceLayer)].filter(Boolean).join("; ");
      this.setState({ mapReady: true, mapMessage: "", yozishXato });
      if (yozishXato && this.canEdit()) this.xabar(t("Feature Layerga yozib bo'lmaydi — o'zgarishlar mahalliy saqlanadi.") + " " + tx(yozishXato), true);
      await this.tarixniSozla(Graphic);
      await this.yuklash();
      this.applyFilters();
    } catch (err: any) {
      this.setState({ mapReady: false, mapMessage: err?.message || "Xaritaga ulanib bo'lmadi" });
    }
  };

  // ================================================================ yuklash (Feature Layer → kesh → dvigatel)
  private async yuklash(): Promise<boolean> {
    this.setState({ serverStatus: "Feature Layer o'qilmoqda…", serverVars: {}, serverOk: null });
    let lfc: any, dfc: any;
    try {
      [lfc, dfc] = await Promise.all([layerToGeoJson(this.lineLayer), layerToGeoJson(this.deviceLayer)]);
    } catch (e: any) {
      this.setState({ serverStatus: "Feature Layerni o'qib bo'lmadi", serverVars: {}, serverOk: false, tarmoqTayyor: true });
      this.xabar(e?.message ? tx(e.message) : t("Feature Layerni o'qib bo'lmadi"), true);
      return false;
    }
    // Feature Layerga hali yozilmagan (brauzerda mahalliy saqlangan) o'zgarishlar ustiga qo'yiladi
    const kutilayotgan: any[] = await this.engine().get("/tahrir/kutilayotgan");
    const oidF = { liniya: this.lineLayer.objectIdField, qurilma: this.deviceLayer.objectIdField };
    this.ustma = ustigaQolla({ liniya: lfc, qurilma: dfc }, kutilayotgan.map((k) => k.toplam), oidF);
    this.tarmoq = Tarmoq.from(lfc, dfc, oidF.liniya, oidF.qurilma, this.ustma.mahalliy);
    this.setState({ kutilayotgan: kutilayotgan.length }, () => this.applyFilters());
    this.mahalliyniChiz();
    const soni: Record<string, number> = {};
    for (const f of this.tarmoq.lines) soni[String(Number(f.p.KUCHLANISH))] = (soni[String(Number(f.p.KUCHLANISH))] || 0) + 1;
    for (const f of this.tarmoq.devices) soni[f.tur] = (soni[f.tur] || 0) + 1;
    const mavjud = (g: string) => !!this.tarmoq.get(g);
    this.setState((s) => ({
      soni,
      tanlov: s.tanlov.filter(mavjud),
      nuqtalar: { bosh: s.nuqtalar.bosh.filter(mavjud), tosiq: s.nuqtalar.tosiq.filter(mavjud), gacha: s.nuqtalar.gacha.filter(mavjud) },
      tableRows: s.tableTitle === "Tarmoq" ? this.barchaQatorlar() : s.tableRows,
    }), () => {
      void this.highlight(this.state.tanlov);
      this.belgilarniChiz();
    });

    let ok = true;
    try {
      const h = await this.engine().sync({
        liniyalar: lfc,
        qurilmalar: dfc,
        maydonlar: { liniya: layerSchema(this.lineLayer), qurilma: layerSchema(this.deviceLayer) },
      });
      this.setState({
        serverStatus: h.kop_qismli ? "Tarmoq tayyor · {l} liniya, {q} qurilma · {k} ko'p qismli liniya"
          : "Tarmoq tayyor · {l} liniya, {q} qurilma",
        serverVars: { l: son(h.liniyalar), q: son(h.qurilmalar), k: son(h.kop_qismli) },
        serverOk: true,
      });
    } catch (e: any) {
      ok = false;
      console.error("[UnElektr] tarmoq grafi qurilmadi", e);
      this.setState({ serverStatus: "Tarmoq grafi qurilmadi", serverVars: {}, serverOk: false });
      this.xabar(t("Tarmoq grafi qurilmadi:") + " " + tx(e?.message || String(e)), true);
    }
    this.setState({ tarmoqTayyor: true });
    if (ok && (this.state.fiz1 || this.state.ogoh2)) await this.xatolarniKorsat();
    return ok;
  }

  /** Graf hali qurilmagan bo'lsa (503) — bir marta Feature Layerdan qayta yuklab takrorlaymiz. */
  private async engineBilan<T>(ish: () => Promise<T>): Promise<T> {
    try {
      return await ish();
    } catch (e: any) {
      if (e instanceof EngineXato && e.holat === 503 && (await this.yuklash())) return ish();
      throw e;
    }
  }

  private barchaQatorlar(): Qator[] {
    return [...this.tarmoq.lines, ...this.tarmoq.devices].map(qatorF);
  }

  private applyBasemap(mode: Fon) {
    const map = this.view?.map;
    if (!map) return;
    void fonYasa(mode).then((b) => {
      if (this.state.basemap === mode) map.basemap = b;
    }).catch(() => { /* fon xarita yuklanmadi */ });
  }

  /** Contents: kuchlanish va qurilma turi bo'yicha ko'rinish (faqat chizish; so'rovlarga ta'sir qilmaydi). */
  private applyFilters() {
    const { lineVisible, deviceVisible } = this.state;
    const sozla = async (layer: any, where: string | null) => {
      try {
        const lv = await this.view.whenLayerView(layer);
        lv.filter = where ? { where } : null;
      } catch {
        /* layerView filtrni qo'llamasa — hammasi ko'rinadi */
      }
    };
    // mahalliy o'zgartirilgan / o'chirilgan obyektlarning Feature Layerdagi asl nusxasi yashiriladi
    const yashir = (layer: any, oids: number[]) =>
      oids.length ? `NOT (${layer.objectIdField} IN (${oids.join(", ")}))` : null;
    const va = (...s: string[]) => s.filter(Boolean).join(" AND ") || null;
    const kvF = fieldName(this.lineLayer, ["KUCHLANISH", "voltage"]);
    // 0.4 kV Feature Layerda (butun son maydon) 0 deb saqlanadi
    const kvOff = KV_ORDER.map(String).filter((k) => lineVisible[k] === false).map((k) => (k === "0.4" ? "0, 0.4" : k));
    void sozla(this.lineLayer, va(kvOff.length ? `NOT (${kvF} IN (${kvOff.join(", ")}))` : null,
      yashir(this.lineLayer, this.ustma.yashirin.liniya)));
    const agF = fieldName(this.deviceLayer, ["ASSETGROUP"]);
    const agOff = Object.keys(QURILMA_AG).filter((t) => deviceVisible[t] === false).map((t) => QURILMA_AG[t]);
    void sozla(this.deviceLayer, va(agOff.length ? `NOT (${agF} IN (${agOff.join(", ")}))` : null,
      yashir(this.deviceLayer, this.ustma.yashirin.qurilma)));
  }

  // ================================================================ tanlov va yoritish
  private tanlovniOrnat(gidlar: string[], opts: { yaqin?: boolean; atributsiz?: boolean } = {}) {
    const tanlov = [...new Set(gidlar.map(normalizeGlobalId))].filter((g) => this.tarmoq.get(g));
    this.setState({ tanlov });
    void this.highlight(tanlov);
    if (opts.yaqin && tanlov.length) void this.yaqinlash(tanlov);
    if (opts.atributsiz) return;
    if (tanlov.length === 1) void this.atributlarniKorsat(tanlov[0]);
    else if (!tanlov.length) this.setState({ panel: { k: "bosh" } });
  }

  private async highlight(gidlar: string[]) {
    const token = ++this.highlightToken;
    this.highlightHandles.forEach((h) => h?.remove?.());
    this.highlightHandles = [];
    if (!this.tanlovLayer || !this.view) return;
    this.tanlovLayer.removeAll();
    const feats = gidlar.map((g) => this.tarmoq.get(g)).filter(Boolean) as Feat[];
    const zaxira: Feat[] = feats.filter((f) => f.mahalliy); // Feature Layerda yo'q — grafika bilan
    for (const qatlam of ["liniya", "qurilma"]) {
      const fs = feats.filter((f) => f.qatlam === qatlam && !f.mahalliy);
      if (!fs.length) continue;
      try {
        const lv = await this.view.whenLayerView(this.layerOf(qatlam));
        if (token !== this.highlightToken) return;
        this.highlightHandles.push(lv.highlight(fs.map((f) => f.oid)));
      } catch {
        zaxira.push(...fs); // layerView highlight yo'q bo'lsa — grafika bilan
      }
    }
    const bitta = feats.length === 1;
    for (const f of bitta ? feats : zaxira) {
      const geom = project(fromGeoJson(f.geom), this.view.spatialReference);
      const chiziq = f.qatlam === "liniya";
      // bitta obyekt — yanada aniqroq (ilovadagidek qalin to'q ko'k chegara)
      if (chiziq && bitta) this.tanlovLayer.add(new this.Graphic({ geometry: geom, symbol: { type: "simple-line", color: "#0b3d91", width: 8 } }));
      this.tanlovLayer.add(new this.Graphic({
        geometry: geom,
        symbol: chiziq
          ? { type: "simple-line", color: CYAN, width: 4 }
          : { type: "simple-marker", size: bitta ? 18 : 14, color: [0, 255, 255, bitta ? 0.5 : 0.35],
              outline: { color: bitta ? "#0b3d91" : CYAN, width: bitta ? 3 : 2.5 } },
      }));
    }
  }

  private async yaqinlash(gidlar: string[]) {
    // shu bilan birga jadval/panel ochilayotgan bo'lsa — xarita yangi o'lchamga kelguncha kutamiz (natija chetda qolmasin)
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const qoldi = this.joyOzgardi + 360 - performance.now();
    if (qoldi > 0) await new Promise((r) => setTimeout(r, qoldi));
    const ext = extentOf(gidlar.map((g) => this.tarmoq.get(g)?.geom).filter(Boolean));
    if (!ext || !this.view) return;
    const e = project(ext, this.view.spatialReference);
    try {
      if (e.width < 1e-6 && e.height < 1e-6) await this.view.goTo({ target: e.center, zoom: Math.max(this.view.zoom, 17) });
      else await this.view.goTo(e.clone().expand(1.4));
    } catch {
      /* ignore */
    }
  }

  /** Bosilgan joydagi eng yaqin obyekt (ilovadagi hitTolerance: qurilma liniyadan ustun). */
  private yaqinObyekt(lon: number, lat: number, piksel: number, faqat?: "liniya" | "qurilma"): Feat | null {
    const tol = pikselMetr(this.view, piksel, lat);
    const kx = 111320 * Math.cos((lat * Math.PI) / 180), ky = 110540;
    const { lineVisible, deviceVisible } = this.state;
    if (faqat !== "liniya") {
      let eng: Feat = null, d0 = tol;
      for (const f of this.tarmoq.devices) {
        if (deviceVisible[f.tur] === false) continue;
        const [x, y] = f.geom.coordinates;
        const d = Math.hypot((x - lon) * kx, (y - lat) * ky);
        if (d <= d0) { d0 = d; eng = f; }
      }
      if (eng || faqat === "qurilma") return eng;
    }
    let eng: Feat = null, d0 = tol;
    for (const f of this.tarmoq.lines) {
      if (lineVisible[String(Number(f.p.KUCHLANISH))] === false) continue;
      const yollar = f.geom.type === "LineString" ? [f.geom.coordinates] : f.geom.coordinates;
      for (const yol of yollar) {
        for (let i = 1; i < yol.length; i++) {
          const ax = (yol[i - 1][0] - lon) * kx, ay = (yol[i - 1][1] - lat) * ky;
          const bx = (yol[i][0] - lon) * kx, by = (yol[i][1] - lat) * ky;
          const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
          const t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
          const d = Math.hypot(ax + t * dx, ay + t * dy);
          if (d <= d0) { d0 = d; eng = f; }
        }
      }
    }
    return eng;
  }

  private yaqinXato(lon: number, lat: number): any {
    const tol = pikselMetr(this.view, 8, lat);
    const kx = 111320 * Math.cos((lat * Math.PI) / 180), ky = 110540;
    for (const f of this.xatoFeatures) {
      const [x, y] = f.geometry.coordinates;
      if (Math.hypot((x - lon) * kx, (y - lat) * ky) <= tol) return f;
    }
    return null;
  }

  private onMapClick = async (e: any) => {
    if (!e?.mapPoint) return;
    const { rejim } = this.state;
    if (rejim === "qirqish") return this.qirqishBosildi(e);
    if (rejim === "qurilma") return this.qurilmaBosildi(e);
    if (rejim === "liniya") return; // chizish asbobi o'zi ishlaydi
    if (rejim === "kochirish") return this.kochirishBosildi(e);
    const [lon, lat] = lonLat(e.mapPoint);
    const xato = this.xatoFeatures.length ? this.yaqinXato(lon, lat) : null;
    if (xato) return this.xatoAtributi(xato.properties);
    const f = this.yaqinObyekt(lon, lat, 6);
    const qosh = e.native?.ctrlKey || e.native?.shiftKey;
    if (!f) {
      if (!qosh) this.tanlovniOrnat([]);
      return;
    }
    const t = this.state.tanlov;
    if (qosh) this.tanlovniOrnat(t.includes(f.gid) ? t.filter((g) => g !== f.gid) : [...t, f.gid]);
    else this.tanlovniOrnat([f.gid]);
  };

  private onPointerMove(e: any) {
    cancelAnimationFrame(this.coordFrame);
    this.coordFrame = requestAnimationFrame(() => {
      try {
        const p = this.view?.toMap({ x: e.x, y: e.y });
        if (!p) return;
        const [lon, lat] = lonLat(p);
        this.setState({ coords: `${lat.toFixed(5)}° N  ${lon.toFixed(5)}° E` });
      } catch {
        /* ignore */
      }
    });
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t?.closest?.("input, select, textarea")) return;
    const { rejim } = this.state;
    if (rejim === "liniya" && this.chizishDavom) {
      if (e.key === "Escape") { this.svm?.cancel(); return; }
      if (e.key === "Backspace") { e.preventDefault(); this.svm?.undo(); return; }
    }
    if (e.key === "Escape" && rejim) {
      if (Date.now() - this.bekorVaqt < 200) return; // shu Esc chizishni bekor qildi
      this.rejimniOrnat(null);
    }
  };

  private onDocClick = (e: MouseEvent) => {
    if (this.state.searchHits && !(e.target as HTMLElement)?.closest?.(".ue-search")) this.setState({ searchHits: null });
  };

  // ================================================================ atributlar paneli
  private async atributlarniKorsat(gid: string) {
    if (!this.state.nuqtalar.bosh.length) this.setState({ right: "atribut" }); // trace tayyorlanayotgan bo'lsa, Trace panelida qolamiz
    this.setState({ panel: { k: "obyekt", gid, attrs: null }, xato: null });
    let attrs: Record<string, any>;
    try {
      attrs = await this.engine().obyekt(gid);
    } catch {
      const f = this.tarmoq.get(gid);
      attrs = f ? { ...f.raw, tur: f.tur } : null;
    }
    // Tekshiruv holat qo'llanayotgan paytdagi eng yangi qiymat bilan (this.state bu yerda hali eski bo'lishi mumkin:
    // dvigatel darhol javob beradi, xarita bosishidan kelgan setState esa keyingi kadrda qo'llanadi)
    this.setState((s) => (s.panel.k === "obyekt" && s.panel.gid === gid
      ? { panel: { k: "obyekt", gid, attrs, xato: attrs ? undefined : t("Atributlarni olib bo'lmadi") } }
      : null));
  }

  private xatoAtributi(props: Record<string, any>) {
    this.setState({ right: "atribut", panel: { k: "xato", props } });
  }

  // ================================================================ trace
  private nuqtaQosh(rol: Rol, gid?: string) {
    const tn = this.state.tanlov;
    const gidlar = gid ? [gid] : tn.length === 1 ? tn : [];
    if (!gidlar.length) return this.xabar(tn.length > 1 ? t("Bitta obyekt tanlang") : t("Avval xaritada obyekt tanlang"), true);
    const n = { ...this.state.nuqtalar };
    for (const g of gidlar) {
      for (const r of ["bosh", "tosiq", "gacha"] as Rol[]) n[r] = n[r].filter((x) => x !== g);
      if (rol === "gacha") n.gacha = [g];
      else n[rol] = [...n[rol], g];
    }
    this.setState({ nuqtalar: n, right: "trace", traceTuri: rol === "gacha" ? "shortest_path" : this.state.traceTuri },
      () => this.belgilarniChiz());
  }

  private nuqtaOlibTashla = (rol: Rol, gid: string) => {
    this.setState((s) => ({ nuqtalar: { ...s.nuqtalar, [rol]: s.nuqtalar[rol].filter((x) => x !== gid) } }),
      () => this.belgilarniChiz());
  };

  private belgilarniChiz() {
    if (!this.belgiLayer) return;
    this.belgiLayer.removeAll();
    for (const rol of ["bosh", "tosiq", "gacha"] as Rol[]) {
      for (const g of this.state.nuqtalar[rol]) {
        const f = this.tarmoq.get(g);
        if (!f) continue;
        const r = ROL_RANG[rol];
        this.belgiLayer.add(new this.Graphic({
          geometry: project(fromGeoJson(f.geom), this.view.spatialReference),
          symbol: f.qatlam === "liniya"
            ? { type: "simple-line", color: r, width: 6, style: "dash" }
            : { type: "simple-marker", size: 20, color: r + "40", outline: { color: r, width: 3 } },
        }));
      }
    }
  }

  private runTrace = async () => {
    const { traceTuri, nuqtalar, tierOshib } = this.state;
    if (!nuqtalar.bosh.length) return this.xabar(t("Avval boshlang'ich nuqta belgilang"), true);
    if (traceTuri === "shortest_path" && !nuqtalar.gacha.length) {
      return this.xabar(t("Shortest Path uchun yo'l oxirini ham belgilang"), true);
    }
    this.setState({ traceRunning: true });
    try {
      const fc = await this.engineBilan(() => this.engine().trace({
        turi: traceTuri, boshlar: nuqtalar.bosh, tosiqlar: nuqtalar.tosiq,
        gacha: traceTuri === "shortest_path" ? nuqtalar.gacha : [], tierOshib,
      }));
      const x = fc.xulosa || {};
      this.setState({
        traceNatija: {
          liniyalar: x.liniyalar ?? 0,
          tp: fc.features.filter((f) => f.properties.tur === "Transformator").length,
          ps: fc.features.filter((f) => f.properties.tur === "Podstansiya").length,
          izoh: x.izoh,
        },
      });
      const nom = TRACE_TYPES.find((t) => t.id === traceTuri)?.label || traceTuri;
      if (!fc.features.length) this.xabar(t("{nom}: natija bo'sh", { nom }) + (x.izoh ? " — " + tx(x.izoh) : ""), true);
      this.jadvalniKorsat(`${nom} natijasi`, fc.features.map((f) => f.properties));
      this.tanlovniOrnat(fc.features.map((f) => f.properties.GLOBALID), { yaqin: true });
    } catch (e: any) {
      this.xabar(t("Trace bajarilmadi:") + " " + tx(e?.message || e), true);
    } finally {
      this.setState({ traceRunning: false });
    }
  };

  private nuqtalarniTozala() {
    const natijaJadvali = this.state.tableTitle.endsWith("natijasi");
    const bosh: Record<Rol, string[]> = { bosh: [], tosiq: [], gacha: [] };
    this.setState((s): Pick<State, "nuqtalar" | "traceNatija" | "tableRows" | "tableOpen"> => ({
      nuqtalar: bosh,
      traceNatija: null,
      tableRows: natijaJadvali ? [] : s.tableRows,
      tableOpen: natijaJadvali ? false : s.tableOpen,
    }), () => this.belgilarniChiz());
    this.tanlovniOrnat([]);
  }

  // ================================================================ atribut jadvali
  private jadvalniKorsat(title: string, rows: Qator[], filtr: JadvalFiltr = "hammasi") {
    this.setState((s) => ({ tableOpen: true, tableTitle: title, tableRows: rows, tableFilter: filtr, tableVersion: s.tableVersion + 1 }));
  }

  private tarmoqJadvali(filtr: JadvalFiltr = "hammasi") {
    this.jadvalniKorsat("Tarmoq", this.barchaQatorlar(), filtr);
  }

  // ================================================================ tekshiruv (xatolar)
  private async xatolarniYukla(kodlar: string[]): Promise<any[]> {
    const barcha: any[] = [];
    for (const kod of kodlar) {
      const fc = await this.engineBilan(() => this.engine().xatolar(kod));
      barcha.push(...(fc.features || []));
    }
    return barcha;
  }

  private xatolarniChiz(fs: any[]) {
    this.xatoFeatures = fs;
    if (!this.xatoLayer) return;
    this.xatoLayer.removeAll();
    for (const f of fs) {
      this.xatoLayer.add(new this.Graphic({
        geometry: project(fromGeoJson(f.geometry), this.view.spatialReference),
        attributes: f.properties,
        symbol: { type: "simple-marker", style: "diamond", size: 12,
          color: f.properties?.KOD === "FIZ1" ? "#c0392b" : "#e67e22", outline: { color: "#fff", width: 1.5 } },
      }));
    }
  }

  private async xatolarniKorsat() {
    const kodlar = ["FIZ1", "OGOH2"].filter((k) => (k === "FIZ1" ? this.state.fiz1 : this.state.ogoh2));
    if (!kodlar.length) return this.xatolarniChiz([]);
    try {
      this.xatolarniChiz(await this.xatolarniYukla(kodlar));
    } catch (e: any) {
      this.xabar(e?.message ? tx(e.message) : t("Xatolar yuklanmadi"), true);
    }
  }

  private async xatolarJadvali() {
    try {
      const fs = await this.xatolarniYukla(["FIZ1", "OGOH2"]);
      this.setState({ fiz1: true, ogoh2: true });
      this.xatolarniChiz(fs);
      this.jadvalniKorsat("Tekshiruv natijalari", fs.map((f) => ({
        GLOBALID: String(f.properties.OBYEKTLAR || "").split(", ")[0],
        tur: f.properties.KOD, NOMI: tx(f.properties.TUR), KUCHLANISH: tx(f.properties.IZOH), TUMAN_ID: "",
      })));
    } catch (e: any) {
      this.xabar(e?.message ? tx(e.message) : t("Xatolar yuklanmadi"), true);
    }
  }

  // ================================================================ qidiruv
  private onSearch = (v: string) => {
    this.setState({ search: v });
    const s = v.trim().toLowerCase();
    if (s.length < 2) return this.setState({ searchHits: null });
    const hits: SearchHit[] = [];
    for (const list of [this.tarmoq.devices, this.tarmoq.lines]) {
      for (const f of list) {
        if (nomi(f).toLowerCase().includes(s) || f.gid.toLowerCase().includes(s)) {
          hits.push({
            id: f.gid,
            nomi: nomi(f),
            izoh: f.qatlam === "liniya"
              ? `${kvMatn(f.p.KUCHLANISH)} · ${son(uzunlikM(f.geom))} m` : turMatn(f.tur),
            liniya: f.qatlam === "liniya",
          });
          if (hits.length >= 40) break;
        }
      }
      if (hits.length >= 40) break;
    }
    this.setState({ searchHits: hits });
  };

  // ================================================================ tahrirlash: umumiy
  /**
   * Dvigatel tekshirib bergan o'zgarishlar to'plamini Feature Layerga yozadi, tarixga qo'shadi va
   * dvigatelni yangilaydi. Qaytaradi: dvigatel javobi va rejadagi → haqiqiy GLOBALIDlar.
   */
  private async saqla(yol: string, body: any): Promise<{ j: any; gidlar: Record<string, string> }> {
    const j = await this.engineBilan(() => this.engine().post(yol, body));
    if (!j.fl_ozgarishlar) throw new Error(t("Hech narsa o'zgarmadi"));
    // Oldingi mahalliy o'zgarishlar hali yuborilmagan bo'lsa — tartib buzilmasin, bu ham mahalliy saqlanadi
    let n: { teskari: any; gidlar: Record<string, string> } = null;
    let sabab = this.state.kutilayotgan ? "oldingi o'zgarishlar hali Feature Layerga yuborilmagan" : "";
    if (toplamBosh(j.fl_ozgarishlar)) {
      // Feature Layerga yoziladigan narsa yo'q (o'zgargan maydonlar Feature Layer sxemasida yo'q)
      n = { teskari: { liniya: { qosh: [], yangila: [], ochir: [] }, qurilma: { qosh: [], yangila: [], ochir: [] } }, gidlar: {} };
    } else if (!sabab) {
      try {
        n = await qolla(j.fl_ozgarishlar, { liniya: this.lineLayer, qurilma: this.deviceLayer }, this.tarmoq, this.Graphic);
      } catch (e: any) {
        if (!ruxsatXatosimi(e)) throw e;
        sabab = e?.message || String(e);
      }
    }
    if (!n) {
      // Feature Layer yozishni rad etdi (ruxsat / litsenziya) — o'zgarish brauzerda saqlanadi va
      // xaritada ko'rinadi; ruxsat paydo bo'lgach "Feature Layerga yuborish" bilan yoziladi
      await this.engine().post("/tahrir/kutilayotgan", { toplam: j.fl_ozgarishlar, tarix: j.tarix });
      console.warn("[UnElektr] mahalliy saqlandi:", sabab);
      j.__mahalliy = true;
      await this.yuklash();
      void this.tarixniKorsat(false);
      return { j, gidlar: {} };
    }
    if (j.tarix) {
      const t = { ...j.tarix, globalid: n.gidlar[normalizeGlobalId(j.tarix.globalid || "")] || j.tarix.globalid };
      try {
        await this.engine().post("/tahrir/qayd", { ...t, teskari: n.teskari, almashtir: n.gidlar });

      } catch {
        this.xabar(t("O'zgarish saqlandi, lekin tarixga yozilmadi (ortga qaytarib bo'lmaydi)"), true);
      }
    }
    await this.yuklash();
    void this.tarixniKorsat(false);
    return { j, gidlar: n.gidlar };
  }

  private ogohMatni(j: any): string {
    let m = "";
    if (j.ogohlantirishlar?.length) m += " " + t("(ogohlantirish: {k})", { k: j.ogohlantirishlar.map((x: any) => x.kod).join(", ") });
    if (j.majburan_saqlangan_xatolar) m += " — " + t("{n} ta xato bilan", { n: j.majburan_saqlangan_xatolar });
    if (j.__mahalliy) m += " — " + t("mahalliy saqlandi (Feature Layerga hali yozilmagan, «Feature Layerga yuborish»)");
    return m;
  }

  /** Mahalliy saqlangan o'zgarishlarni tartib bo'yicha Feature Layerga yozadi. */
  private yuborish = async () => {
    if (!this.canEdit()) return;
    let royxat: any[];
    try {
      royxat = await this.engine().get("/tahrir/kutilayotgan");
    } catch (e: any) {
      return this.xabar(tx(e?.message || String(e)), true);
    }
    if (!royxat.length) return this.xabar(t("Yuboriladigan o'zgarish yo'q"));
    let yuborildi = 0;
    try {
      for (const k of royxat) {
        // har biri Feature Layerning hozirgi holatiga (keshsiz) qo'llanadi; yangi GLOBALIDlar dvigatelda
        // keyingi to'plamlarga almashtiriladi — shuning uchun ro'yxat har qadamda qayta olinadi
        const joriy = (await this.engine().get("/tahrir/kutilayotgan")).find((x: any) => x.id === k.id) || k;
        const n = await qolla(joriy.toplam, { liniya: this.lineLayer, qurilma: this.deviceLayer }, this.tarmoq, this.Graphic, true);
        await this.engine().post("/tahrir/kutilayotgan/yuborildi", { id: k.id, almashtir: n.gidlar, teskari: n.teskari });
        yuborildi++;
      }
      this.xabar(t("{n} ta o'zgarish Feature Layerga yozildi", { n: yuborildi }));
    } catch (e: any) {
      this.xabar(t("{n} ta yozildi, keyingisi yozilmadi:", { n: yuborildi }) + " " + tx(e?.message || e), true);
    }

    await this.yuklash();
    void this.tarixniKorsat(false);
  };

  /** Mahalliy qo'shilgan/o'zgartirilgan obyektlar xaritada (Feature Layerdagi asl nusxasi yashiriladi). */
  private mahalliyniChiz() {
    if (!this.mahalliyLayer || !this.view) return;
    this.mahalliyLayer.removeAll();
    for (const f of [...this.tarmoq.lines, ...this.tarmoq.devices]) {
      if (!f.mahalliy) continue;
      const geom = project(fromGeoJson(f.geom), this.view.spatialReference);
      if (f.qatlam === "liniya") {
        this.mahalliyLayer.add(new this.Graphic({ geometry: geom,
          symbol: { type: "simple-line", color: KV_COLORS[String(Number(f.p.KUCHLANISH))] || "#777", width: 3, style: "short-dash" } }));
      } else {
        this.mahalliyLayer.add(new this.Graphic({ geometry: geom,
          symbol: { type: "simple-marker", size: 22, color: [0, 0, 0, 0], outline: { color: "#e67e22", width: 2, style: "dash" } } }));
        this.mahalliyLayer.add(new this.Graphic({ geometry: geom, symbol: belgiSimvol(f.tur) }));
      }
    }
  }

  private rejimniOrnat(yangi: Rejim) {
    if (yangi && !this.canEdit()) return;
    try {
      this.svm?.cancel();
    } catch {
      /* ignore */
    }
    this.chizishDavom = false;
    this.kochGraphic = null;
    this.tahrirLayer?.removeAll();
    this.setState({
      rejim: yangi, rejimXabar: "", xato: null, saqlanmoqda: false,
      qirqKorish: null, qurKorish: null, linKorish: null, kochObyekt: null, kochKorish: null,
      right: yangi ? "atribut" : this.state.right,
    }, () => {
      // chizish asbobi holat qo'llangandan keyin (rejim === "liniya") ishga tushadi
      if (yangi === "liniya") this.chizishniBoshla();
    });
    if (!yangi) {
      if (this.state.tanlov.length === 1) void this.atributlarniKorsat(this.state.tanlov[0]);
      else this.setState({ panel: { k: "bosh" } });
    }
  }

  private nuqtaGrafik(lon: number, lat: number, symbol: any) {
    this.tahrirLayer.add(new this.Graphic({
      geometry: project(fromGeoJson({ type: "Point", coordinates: [lon, lat] }), this.view.spatialReference),
      symbol,
    }));
  }

  // ---------------------------------------------------------------- atributlar (7.1)
  private async tahrirFormasi(gid: string) {
    if (!this.canEdit()) return;
    if (this.state.rejim) this.rejimniOrnat(null);
    this.setState({ right: "atribut", panel: { k: "yuklanmoqda" }, xato: null });
    try {
      const m = await this.engineBilan(() => this.engine().maydonlar(gid));
      const asl = Object.fromEntries(m.maydonlar.map((x: Maydon) => [x.maydon, x.qiymat]));
      this.setState({ panel: { k: "forma", gid, qatlam: m.qatlam, maydonlar: m.maydonlar, asl }, forma: formaQiymatlari(m.maydonlar) });
    } catch (e: any) {
      this.setState({ panel: { k: "xabar", matn: t("Maydonlarni olib bo'lmadi:") + " " + tx(e?.message || e) } });
    }
  }

  private async atributniSaqla(majburan = false) {
    const p = this.state.panel;
    if (p.k !== "forma") return;
    const o: Record<string, string> = {};
    for (const m of p.maydonlar) {
      const v = this.state.forma[m.maydon] ?? "";
      if (ozgarganmi(m, v, p.asl[m.maydon])) o[m.maydon] = v.trim();
    }
    if (!Object.keys(o).length) return this.xabar(t("Hech narsa o'zgartirilmadi"));
    this.setState({ saqlanmoqda: true, xato: null });
    try {
      const { j } = await this.saqla("/tahrir/atribut", { globalid: p.gid, qiymatlar: o, majburan });
      this.xabar(t("Saqlandi: {n} ta maydon", { n: j.ozgarishlar }) + this.ogohMatni(j), !!j.majburan_saqlangan_xatolar);
      this.setState({ saqlanmoqda: false });
      void this.atributlarniKorsat(p.gid);
    } catch (e: any) {
      this.setState({ saqlanmoqda: false, xato: this.xatoInfo(e, "Saqlanmadi.", "Baribir saqlash") });
    }
  }

  // ---------------------------------------------------------------- qirqish (7.2)
  private async qirqishBosildi(e: any) {
    const [lon, lat] = lonLat(e.mapPoint);
    const f = this.yaqinObyekt(lon, lat, 8, "liniya");
    if (!f) return this.xabar(t("Liniya ustiga bosing"), true);
    const tol = pikselMetr(this.view, 8, lat);
    this.tanlovniOrnat([f.gid], { atributsiz: true });
    try {
      const k = await this.engineBilan(() => this.engine().post("/tahrir/qirqish",
        { globalid: f.gid, lon, lat, tolerans_m: tol, sinov: true }));
      this.tahrirLayer.removeAll();
      this.nuqtaGrafik(k.nuqta[0], k.nuqta[1],
        { type: "simple-marker", size: 14, color: "#ffffff", outline: { color: QIZIL, width: 3 } });
      this.setState({ qirqKorish: { gid: f.gid, lon: k.nuqta[0], lat: k.nuqta[1], ...k }, xato: null, rejimXabar: "" });
    } catch (err: any) {
      this.tahrirLayer.removeAll();
      this.setState({ qirqKorish: null, xato: { sarlavha: "Bu yerda qirqib bo'lmaydi.", matn: err?.message || String(err) } });
    }
  }

  private async qirqishniBajar(majburan = false) {
    const k = this.state.qirqKorish;
    if (!k) return;
    this.setState({ saqlanmoqda: true, xato: null });
    try {
      const { j, gidlar } = await this.saqla("/tahrir/qirqish",
        { globalid: k.gid, lon: k.lon, lat: k.lat, tolerans_m: 0.01, majburan });
      this.tahrirLayer.removeAll();
      this.setState({ qirqKorish: null, saqlanmoqda: false,
        rejimXabar: "Bajarildi. Ikkala bo'lak tanlangan (och ko'k). Bekor qilish uchun — Ortga qaytarish." });
      this.tanlovniOrnat([j.globalid, gidlar[normalizeGlobalId(j.yangi_globalid)] || j.yangi_globalid], { atributsiz: true });
      this.xabar(t("Liniya ikkiga bo'lindi: {a} m + {b} m", { a: son(j.a_m), b: son(j.b_m) }) + this.ogohMatni(j), !!j.majburan_saqlangan_xatolar);
    } catch (err: any) {
      this.setState({ saqlanmoqda: false, xato: this.xatoInfo(err, "Bajarilmadi.", "Baribir qirqish") });
    }
  }

  // ---------------------------------------------------------------- qurilma qo'yish (7.3)
  private async qurilmaBosildi(e: any) {
    const [lon, lat] = lonLat(e.mapPoint);
    const ag = this.state.qurTur;
    try {
      const k = await this.engineBilan(() => this.engine().post("/tahrir/qurilma",
        { asset_group: ag, lon, lat, tolerans_m: pikselMetr(this.view, 10, lat), sinov: true }));
      this.tahrirLayer.removeAll();
      this.nuqtaGrafik(k.nuqta[0], k.nuqta[1],
        { type: "simple-marker", size: 26, color: [0, 0, 0, 0], outline: { color: QIZIL, width: 2.5, style: "dash" } });
      this.nuqtaGrafik(k.nuqta[0], k.nuqta[1], belgiSimvol(QUR_TURLARI[ag].belgi, true));
      this.setState({ qurKorish: { ...k, ag }, forma: formaQiymatlari(k.maydonlar), xato: null, rejimXabar: "" });
      this.tanlovniOrnat(k.ulanishlar.map((u: any) => u.globalid), { atributsiz: true });
    } catch (err: any) {
      this.tahrirLayer.removeAll();
      this.setState({ qurKorish: null, xato: { sarlavha: "Bu yerga qo'yib bo'lmaydi.", matn: err?.message || String(err) } });
    }
  }

  private async qurilmaniSaqla(majburan = false) {
    const k = this.state.qurKorish;
    if (!k) return;
    const qiymatlar: Record<string, string> = {};
    for (const [m, v] of Object.entries(this.state.forma)) if (String(v).trim() !== "") qiymatlar[m] = String(v).trim();
    this.setState({ saqlanmoqda: true, xato: null });
    try {
      const { j, gidlar } = await this.saqla("/tahrir/qurilma",
        { asset_group: k.ag, lon: k.nuqta[0], lat: k.nuqta[1], tolerans_m: 0.01, qiymatlar, majburan });
      this.tahrirLayer.removeAll();
      this.setState({ qurKorish: null, saqlanmoqda: false,
        rejimXabar: "Bajarildi. Yangi qurilma tanlangan. Yana qo'yish uchun liniya ustiga bosing. Bekor qilish — Ortga qaytarish." });
      this.tanlovniOrnat([gidlar[normalizeGlobalId(j.globalid)] || j.globalid], { atributsiz: true });
      this.xabar(t(k.ag === 1 ? "Podstansiya qo'yildi" : "Transformator punkti qo'yildi") + ", " +
        (j.ulanishlar.length ? t("{n} ta liniya ulandi", { n: j.ulanishlar.length }) : t("hech narsaga ulanmagan")) + this.ogohMatni(j),
      !!j.majburan_saqlangan_xatolar);
    } catch (err: any) {
      this.setState({ saqlanmoqda: false, xato: this.xatoInfo(err, "Saqlanmadi.", "Baribir saqlash") });
    }
  }

  // ---------------------------------------------------------------- liniya chizish (7.4)
  private chizishniBoshla() {
    if (!this.svm || this.state.rejim !== "liniya") return;
    try {
      this.svm.create("polyline");
    } catch {
      // qatlam turi snappingni qo'llamasa — yopishishsiz (dvigatel uchlarni tolerans bilan baribir yopishtiradi)
      try {
        this.svm.snappingOptions = { enabled: false, featureSources: [] };
        this.svm.create("polyline");
      } catch (e: any) {
        this.xabar(t("Chizish asbobi ishga tushmadi:") + " " + tx(e?.message || e), true);
      }
    }
  }

  private onSketchCreate = (ev: any) => {
    if (this.state.rejim !== "liniya") return;
    if (ev.state === "start") {
      this.chizishDavom = true;
      this.tahrirLayer.graphics.toArray().filter((g: any) => g !== ev.graphic).forEach((g: any) => this.tahrirLayer.remove(g));
      this.setState({ linKorish: null, xato: null, rejimXabar: "" });
    } else if (ev.state === "cancel") {
      this.chizishDavom = false;
      this.bekorVaqt = Date.now();
      setTimeout(() => this.chizishniBoshla(), 0);
    } else if (ev.state === "complete") {
      this.chizishDavom = false;
      ev.graphic.symbol = { type: "simple-line", color: QIZIL, width: 3, style: "dash" };
      void this.liniyaTekshir(chiziqKoord(ev.graphic.geometry), null, ev.graphic);
      setTimeout(() => this.chizishniBoshla(), 0);
    }
  };

  private async liniyaTekshir(k: number[][], kuchlanish: number | null, grafik?: any) {
    const tol = pikselMetr(this.view, 10, k[0][1]);
    try {
      const r = await this.engineBilan(() => this.engine().post("/tahrir/liniya",
        { koordinatalar: k, tolerans_m: tol, sinov: true, kuchlanish }));
      // yopishgan uchlar bilan geometriyani yangilaymiz
      const g = grafik || this.tahrirLayer.graphics.getItemAt(0);
      if (g) g.geometry = project(fromGeoJson({ type: "LineString", coordinates: r.koordinatalar }), this.view.spatialReference);
      // kuchlanish o'zgarganda foydalanuvchi yozgan boshqa qiymatlar saqlanadi
      const eski = kuchlanish != null ? this.state.forma : {};
      const forma = { ...formaQiymatlari(r.maydonlar), ...eski };
      if (kuchlanish != null) forma.KUCHLANISH = String(kuchlanish);
      this.setState({ linKorish: r, forma, xato: null });
      this.tanlovniOrnat(r.uchlar.map((u: any) => u.globalid).filter(Boolean), { atributsiz: true });
    } catch (err: any) {
      this.setState({ linKorish: null, xato: { sarlavha: "Bunday liniya chizib bo'lmaydi.", matn: err?.message || String(err) } });
    }
  }

  private async liniyaniSaqla(majburan = false) {
    const k = this.state.linKorish;
    if (!k) return;
    const qiymatlar: Record<string, string> = {};
    for (const [m, v] of Object.entries(this.state.forma)) if (String(v).trim() !== "") qiymatlar[m] = String(v).trim();
    this.setState({ saqlanmoqda: true, xato: null });
    try {
      const { j, gidlar } = await this.saqla("/tahrir/liniya",
        { koordinatalar: k.koordinatalar, tolerans_m: 0.05, qiymatlar, majburan });
      this.tahrirLayer.removeAll();
      this.setState({ linKorish: null, saqlanmoqda: false,
        rejimXabar: "Bajarildi. Yangi liniya tanlangan. Keyingisini chizishingiz mumkin. Bekor qilish — Ortga qaytarish." });
      this.tanlovniOrnat([gidlar[normalizeGlobalId(j.globalid)] || j.globalid], { atributsiz: true });
      this.xabar(t("Liniya qo'shildi: {kv}, {m} m", { kv: kvMatn(j.kuchlanish), m: son(j.uzunlik_m) }) + this.ogohMatni(j),
        !!j.majburan_saqlangan_xatolar);
    } catch (err: any) {
      this.setState({ saqlanmoqda: false, xato: this.xatoInfo(err, "Saqlanmadi.", "Baribir saqlash") });
    }
  }

  // ---------------------------------------------------------------- ko'chirish (7.5)
  private kochirishBosildi(e: any) {
    if (this.state.kochObyekt) return; // tahrirlash davom etmoqda — avval Saqlash yoki Bekor qilish
    const [lon, lat] = lonLat(e.mapPoint);
    const f = this.yaqinObyekt(lon, lat, 6);
    if (!f) return this.xabar(t("Qurilma yoki liniya ustiga bosing"), true);
    this.tanlovniOrnat([f.gid], { atributsiz: true });
    this.tahrirLayer.removeAll();
    const chiziq = f.qatlam === "liniya";
    const geom = chiziq
      ? { type: "LineString", coordinates: f.geom.type === "LineString" ? f.geom.coordinates : f.geom.coordinates[0] }
      : f.geom;
    const g = new this.Graphic({
      geometry: project(fromGeoJson(geom), this.view.spatialReference),
      symbol: chiziq
        ? { type: "simple-line", color: QIZIL, width: 3, style: "dash" }
        : belgiSimvol(f.tur, true),
    });
    this.tahrirLayer.add(g);
    this.kochGraphic = g;
    this.setState({ kochObyekt: { gid: f.gid, tur: f.tur, nomi: nomi(f), kv: f.p.KUCHLANISH }, kochKorish: null, xato: null, rejimXabar: "" });
    void this.svm.update(g, { tool: chiziq ? "reshape" : "move" });
  }

  private onSketchUpdate = (ev: any) => {
    const o = this.state.kochObyekt;
    if (this.state.rejim !== "kochirish" || !o || !this.kochGraphic) return;
    const tur = ev.toolEventInfo?.type;
    if (tur === "move-stop" || tur === "reshape-stop" || tur === "vertex-add" || tur === "vertex-remove") {
      if (o.tur === "liniya") void this.geometriyaTekshir();
      else void this.qurilmaKochTekshir();
    }
    if (ev.state === "complete" && this.kochGraphic) {
      // xaritaning bo'sh joyiga bosilsa ham tahrirlash davom etadi (Saqlash yoki Bekor qilish gacha)
      const g = this.kochGraphic;
      setTimeout(() => {
        if (this.kochGraphic === g && this.state.rejim === "kochirish") void this.svm.update(g, { tool: o.tur === "liniya" ? "reshape" : "move" });
      }, 0);
    }
  };

  private async qurilmaKochTekshir() {
    const o = this.state.kochObyekt;
    const [lon, lat] = lonLat(this.kochGraphic.geometry);
    try {
      const k = await this.engineBilan(() => this.engine().post("/tahrir/kochirish", { globalid: o.gid, lon, lat, sinov: true }));
      this.tahrirLayer.graphics.toArray().filter((g: any) => g !== this.kochGraphic).forEach((g: any) => this.tahrirLayer.remove(g));
      for (const c of k.oldindan || []) {
        this.tahrirLayer.add(new this.Graphic({
          geometry: project(fromGeoJson({ type: "LineString", coordinates: c }), this.view.spatialReference),
          symbol: { type: "simple-line", color: QIZIL, width: 3, style: "dash" },
        }));
      }
      this.setState({ kochKorish: { ...k, lon, lat }, xato: null });
    } catch (err: any) {
      this.setState({ kochKorish: null, xato: { sarlavha: "Bu joyga ko'chirib bo'lmaydi.", matn: err?.message || String(err) } });
    }
  }

  private async geometriyaTekshir() {
    const o = this.state.kochObyekt;
    const k = chiziqKoord(this.kochGraphic.geometry);
    try {
      const r = await this.engineBilan(() => this.engine().post("/tahrir/geometriya",
        { globalid: o.gid, koordinatalar: k, tolerans_m: pikselMetr(this.view, 10, k[0][1]), sinov: true }));
      this.setState({ kochKorish: r, xato: null });
    } catch (err: any) {
      this.setState({ kochKorish: null, xato: { sarlavha: "Bunday o'zgartirib bo'lmaydi.", matn: err?.message || String(err) } });
    }
  }

  private kochirishBekor() {
    this.kochGraphic = null;
    try {
      this.svm?.cancel();
    } catch {
      /* ignore */
    }
    this.tahrirLayer.removeAll();
    this.setState({ kochObyekt: null, kochKorish: null, xato: null });
    this.tanlovniOrnat([], { atributsiz: true });
  }

  private async kochirishniSaqla(majburan = false) {
    const o = this.state.kochObyekt, k = this.state.kochKorish;
    if (!o || !k) return;
    this.setState({ saqlanmoqda: true, xato: null });
    try {
      const { j } = o.tur === "liniya"
        ? await this.saqla("/tahrir/geometriya", { globalid: o.gid, koordinatalar: k.koordinatalar, tolerans_m: 0.05, majburan })
        : await this.saqla("/tahrir/kochirish", { globalid: o.gid, lon: k.lon, lat: k.lat, majburan });
      this.kochGraphic = null;
      try {
        this.svm?.cancel();
      } catch {
        /* ignore */
      }
      this.tahrirLayer.removeAll();
      this.setState({ kochObyekt: null, kochKorish: null, saqlanmoqda: false,
        rejimXabar: "Bajarildi. Keyingi obyektni bosing. Bekor qilish — Ortga qaytarish." });
      this.tanlovniOrnat([j.globalid], { atributsiz: true });
      this.xabar((o.tur === "liniya" ? t("Liniya shakli saqlandi ({m} m)", { m: son(j.uzunlik_m) })
        : t("Qurilma {m} m ga ko'chirildi", { m: son(j.masofa_m, 1) })) + this.ogohMatni(j), !!j.majburan_saqlangan_xatolar);
    } catch (err: any) {
      this.setState({ saqlanmoqda: false, xato: this.xatoInfo(err, "Saqlanmadi.", "Baribir saqlash") });
    }
  }

  // ---------------------------------------------------------------- o'chirish (7.5)
  private async ochirishniBoshla() {
    const gidlar = [...this.state.tanlov];
    if (!gidlar.length) return this.xabar(t("Avval o'chiriladigan obyekt(lar)ni tanlang (Ctrl + bosish — bir nechtasini)"), true);
    if (this.state.rejim) this.rejimniOrnat(null);
    this.setState({ right: "atribut", panel: { k: "yuklanmoqda" }, xato: null });
    try {
      const korish = await this.engineBilan(() => this.engine().post("/tahrir/ochirish", { globalidlar: gidlar, sinov: true }));
      this.setState({ panel: { k: "ochirish", gidlar, korish } });
    } catch (e: any) {
      this.setState({ panel: { k: "xabar", matn: "" }, xato: { sarlavha: "O'chirib bo'lmaydi.", matn: e?.message || String(e) } });
    }
  }

  private async ochirishniBajar(majburan = false) {
    const p = this.state.panel;
    if (p.k !== "ochirish") return;
    this.setState({ saqlanmoqda: true, xato: null });
    try {
      const { j } = await this.saqla("/tahrir/ochirish", { globalidlar: p.gidlar, majburan });
      this.setState({ saqlanmoqda: false,
        panel: { k: "xabar", matn: t("{n} ta obyekt o'chirildi. Tiklash uchun — Ortga qaytarish.", { n: j.ochirilgan.length }) } });
      this.tanlovniOrnat([], { atributsiz: true });
      this.xabar(t("{n} ta obyekt o'chirildi", { n: j.ochirilgan.length }) + this.ogohMatni(j));
    } catch (err: any) {
      this.setState({ saqlanmoqda: false, xato: this.xatoInfo(err, "Bajarilmadi.", "Baribir o'chirish") });
    }
  }

  // ---------------------------------------------------------------- tarix va ortga qaytarish
  private async tarixniKorsat(ochish = true) {
    if (ochish) this.setState({ right: "tarix" });
    this.setState({ historyLoading: true });
    try {
      const items = await this.engine().tarix(200);
      this.setState({ history: items, historyLoading: false, historyXato: "" });
    } catch (e: any) {
      this.setState({ historyLoading: false, historyXato: e?.message || String(e) });
    }
  }

  private ortgaQaytar = async () => {
    if (!this.canEdit()) return;
    try {
      const q = await this.engine().get("/tahrir/qaytarish");
      if (q.kutilayotgan) {
        // mahalliy (Feature Layerga yozilmagan) o'zgarish — Feature Layerga tegilmaydi, faqat bekor qilinadi
        await this.engine().post("/tahrir/kutilayotgan/bekor", { id: q.kutilayotgan });
        await this.engine().post("/tahrir/qaytarildi", { guruh: q.guruh, almashtir: {} });
      } else {
        const n = await qolla(q.teskari, { liniya: this.lineLayer, qurilma: this.deviceLayer }, this.tarmoq, this.Graphic);
        await this.engine().post("/tahrir/qaytarildi", { guruh: q.guruh, almashtir: n.gidlar });
      }
      await this.yuklash();
      this.xabar(t("Oxirgi o'zgarish bekor qilindi"));
      const p = this.state.panel;
      if (p.k === "obyekt" && this.state.tanlov.length === 1) void this.atributlarniKorsat(this.state.tanlov[0]);
      void this.tarixniKorsat(false);
    } catch (e: any) {
      this.xabar(tx(e?.message || String(e)), true);
    }
  };

  // ================================================================ tasma tugmalari
  private onAction = (action: string) => {
    const tn = this.state.tanlov;
    switch (action) {
      case "fullExtent":
        void this.yaqinlash(this.tarmoq.lines.map((f) => f.gid));
        break;
      case "zoomSelection":
        if (tn.length) void this.yaqinlash(tn);
        else this.xabar(t("Hech narsa tanlanmagan"));
        break;
      case "clearSelection":
        this.tanlovniOrnat([]);
        break;
      case "toggleTable":
        if (this.state.tableOpen) this.setState({ tableOpen: false });
        else if (this.state.tableRows.length) this.setState({ tableOpen: true });
        else this.tarmoqJadvali();
        break;
      case "openTrace":
        this.setState({ right: "trace" });
        break;
      case "setStart":
        this.nuqtaQosh("bosh");
        break;
      case "setBarrier":
        this.nuqtaQosh("tosiq");
        break;
      case "setEnd":
        this.nuqtaQosh("gacha");
        break;
      case "clearTracePoints":
        this.nuqtalarniTozala();
        break;
      case "syncEngine":
        void this.yuklash().then((ok) => ok && this.xabar(t("Feature Layerdan qayta yuklandi")));
        break;
      case "liniya":
      case "qurilma":
      case "qirqish":
      case "kochirish":
        this.rejimniOrnat(this.state.rejim === action ? null : (action as Rejim));
        break;
      case "editAttrs":
        if (tn.length !== 1) {
          this.xabar(tn.length ? t("Atributlarni tahrirlash uchun bitta obyekt tanlang") : t("Avval xaritada bitta obyektni tanlang"), true);
        } else void this.tahrirFormasi(tn[0]);

        break;
      case "deleteFeat":
        void this.ochirishniBoshla();
        break;
      case "yuborish":
        void this.yuborish();
        break;
      case "undo":
        void this.ortgaQaytar();
        break;
      case "showHistory":
        void this.tarixniKorsat(true);
        break;
      case "errorTable":
        void this.xatolarJadvali();
        break;
      default:
        break;
    }
  };

  // ================================================================ chizish (render)
  private tavsifla = (gid: string): [string, string] => {
    const f = this.tarmoq.get(gid);
    return [f ? nomi(f) : gid, f ? kvMatn(f.p.KUCHLANISH) : ""];
  };

  private kvTeg(kv: any) {
    if (kv == null || kv === "") return null;
    const rang = KV_COLORS[String(Number(kv))];
    return <span className={`ue-tag${rang ? " kv" : ""}`} style={rang ? { background: rang } : undefined}>{kvMatn(kv)}</span>;
  }

  private obyektBoshi(nom: string, ic: string, tur: React.ReactNode) {
    return (
      <div className="ue-obyekt-bosh">
        <span className="ue-obyekt-ic"><Icon n={ic} size={20} /></span>
        <div style={{ minWidth: 0 }}>
          <div className="ue-attr-title">{nom}</div>
          <div className="ue-attr-tur">{tur}</div>
        </div>
      </div>
    );
  }

  private renderObyekt(p: Extract<Panel, { k: "obyekt" }>) {
    if (!p.attrs) {
      return <p className="ue-muted">{p.xato ? p.xato : <><span className="ue-spin" style={{ display: "inline-block", marginRight: 8 }} />{t("Yuklanmoqda…")}</>}</p>;
    }
    const f = this.tarmoq.get(p.gid);
    const qatorlar = Object.entries(p.attrs).filter(([k, v]) => v !== null && v !== "" && k !== "tur");
    const liniya = (f?.qatlam || (p.attrs.tur === "liniya" ? "liniya" : "")) === "liniya";
    return (
      <div>
        {this.obyektBoshi(p.attrs.NOMI || t("(nomsiz)"), liniya ? "line" : "device", <>
          {turMatn(p.attrs.tur)}
          {f && this.kvTeg(f.p.KUCHLANISH)}
          {f?.mahalliy && <span className="ue-tag mahalliy">{t("mahalliy")}</span>}
        </>)}
        <div className="ue-attr-tugmalar">
          <button type="button" onClick={() => this.nuqtaQosh("bosh", p.gid)}><Icon n="flag" size={14} />{t("Boshlang'ich nuqta")}</button>
          <button type="button" onClick={() => this.nuqtaQosh("tosiq", p.gid)}><Icon n="ban" size={14} />{t("To'siq")}</button>
          <button type="button" onClick={() => this.nuqtaQosh("gacha", p.gid)}><Icon n="pin" size={14} />{t("Yo'l oxiri")}</button>
          <button type="button" onClick={() => void this.yaqinlash([p.gid])}><Icon n="target" size={14} />{t("Yaqinlashish")}</button>
          {this.canEdit() && (
            <button type="button" className="tahrir-btn" onClick={() => void this.tahrirFormasi(p.gid)}>
              <Icon n="edit" size={14} />{t("Tahrirlash")}
            </button>
          )}
        </div>
        <table className="ue-attr-table">
          <tbody>
            {qatorlar.map(([k, v]) => <tr key={k}><th>{k}</th><td className={k === "GLOBALID" ? "gid" : ""}>{String(v)}</td></tr>)}
          </tbody>
        </table>
      </div>
    );
  }

  private renderXatoObyekt(props: Record<string, any>) {
    const gidlar = String(props.OBYEKTLAR || "").split(", ").filter(Boolean);
    return (
      <div>
        {this.obyektBoshi(t("Tekshiruv: {kod}", { kod: props.KOD }), "alert", tx(props.TUR))}
        <table className="ue-attr-table">
          <tbody>
            <tr><th>{t("Izoh")}</th><td>{tx(props.IZOH)}</td></tr>
            {gidlar.map((g) => {
              const o = this.tarmoq.get(g);
              return <tr key={g}><th>{o ? `${nomi(o)}, ${kvMatn(o.p.KUCHLANISH)}` : t("obyekt")}</th><td className="gid">{g}</td></tr>;
            })}
          </tbody>
        </table>
        <div className="ue-attr-tugmalar" style={{ marginTop: 12 }}>
          <button type="button" onClick={() => this.tanlovniOrnat(gidlar, { yaqin: true })}><Icon n="checks" size={14} />{t("Obyektlarni tanlash")}</button>
        </div>
      </div>
    );
  }

  private renderForma(p: Extract<Panel, { k: "forma" }>) {
    const f = this.tarmoq.get(p.gid);
    return (
      <div>
        {this.obyektBoshi(p.asl.NOMI || t("(nomsiz)"), "edit", <>
          {t("Tahrirlash")} · {turMatn(f ? f.tur : p.qatlam)}
        </>)}
        <div className="gid" style={{ marginTop: -4 }}>{p.gid}</div>
        <MaydonForma
          maydonlar={p.maydonlar}
          qiymatlar={this.state.forma}
          asl={p.asl}
          izoh={(m) => m.maydon === "KUCHLANISH" && p.qatlam === "liniya"
            ? <span className="ue-ogoh-matn"> — {t("ulanishga ta'sir qiladi, saqlashda tekshiriladi")}</span> : null}
          onChange={(m, v) => this.setState((s) => ({ forma: { ...s.forma, [m]: v } }))}
          onSubmit={() => void this.atributniSaqla(false)}
          onCancel={() => void this.atributlarniKorsat(p.gid)}
          saqlanmoqda={this.state.saqlanmoqda}
          xato={this.state.xato}
          onMajburan={() => void this.atributniSaqla(true)}
        />
      </div>
    );
  }

  private renderOchirish(p: Extract<Panel, { k: "ochirish" }>) {
    const k = p.korish;
    return (
      <div className="ue-ochir-dialog">
        <div className="sarlavha"><Icon n="trash" size={18} />{t("O'chirishni tasdiqlang")}</div>
        <div className="ue-muted">{t("{n} ta obyekt o'chiriladi:", { n: k.obyektlar_royxati.length })}</div>
        <ul className="ue-ochir-royxat">
          {k.obyektlar_royxati.map((x: any) => (
            <li key={x.globalid}>
              <b>{turMatn(x.tur === "Liniya" ? "liniya" : x.tur)}</b> «{x.nomi || t("(nomsiz)")}»{" "}
              <span className="ue-muted">{kvMatn(x.kv)}{x.uzunlik_m ? ` · ${son(x.uzunlik_m)} m` : ""}</span>
            </li>
          ))}
        </ul>
        {k.tozalanadigan_terminallar > 0 && (
          <p className="ue-muted">{t("Qurilmaga ulangan {n} ta liniya o'chirilmaydi — faqat terminallari tozalanadi.", { n: k.tozalanadigan_terminallar })}</p>
        )}
        {k.ogohlantirish.map((x: string, i: number) => <p key={i} className="ue-ogoh"><Icon n="alert" size={15} />{tx(x)}</p>)}
        <p className="ue-muted">{t("Kerak bo'lsa keyin «Ortga qaytarish» bilan tiklash mumkin.")}</p>
        <XatoQuti xato={this.state.xato} onMajburan={() => void this.ochirishniBajar(true)} />
        <div className="ue-row">
          <button type="button" className="ue-btn xavfli" disabled={this.state.saqlanmoqda} onClick={() => void this.ochirishniBajar(false)}>
            {this.state.saqlanmoqda ? <><span className="ue-spin" />{t("O'chirilmoqda…")}</>
              : <><Icon n="trash" size={15} />{t("O'chirish ({n})", { n: k.obyektlar_royxati.length })}</>}
          </button>
          <button type="button" className="ue-btn" onClick={() =>
            this.state.tanlov.length === 1 ? void this.atributlarniKorsat(this.state.tanlov[0]) : this.setState({ panel: { k: "bosh" } })}>
            {t("Bekor qilish")}
          </button>
        </div>
      </div>
    );
  }

  private renderRejim() {
    const s = this.state;
    const karta = (ic: string, sarlavha: string, matn: React.ReactNode, qadamlar: React.ReactNode[]) => (
      <div className="ue-rejim-karta">
        <div className="sarlavha"><Icon n={ic} size={17} />{sarlavha}</div>
        {matn}
        <ol>{qadamlar.map((q, i) => <li key={i}>{q}</li>)}</ol>
      </div>
    );
    const xabarlar = s.rejimXabar
      ? <p className="ue-ogoh" style={{ marginTop: 10, color: "var(--success)", background: "var(--success-soft)" }}>
        <Icon n="check" size={15} />{t(s.rejimXabar)}</p>
      : null;
    const m = (v: number) => son(v, 1);
    const qaytadan = (
      <button type="button" className="ue-btn kichik"
        onClick={() => { this.tahrirLayer.removeAll(); this.setState({ xato: null }); }}>{t("Qaytadan chizish")}</button>
    );

    if (s.rejim === "qirqish") {
      const k = s.qirqKorish;
      const f = k && this.tarmoq.get(k.gid);
      return (
        <div>
          {karta("scissors", t("Qirqish rejimi"), t("Qirqmoqchi bo'lgan liniya ustiga, kerakli nuqtaga bosing."), [
            t("Nuqta mavjud vertexga yaqin bo'lsa, o'shanga yopishadi."),
            t("Saqlashdan oldin bo'laklar uzunligi ko'rsatiladi."),
            <>{t("Tugatish:")} <kbd>Esc</kbd> {t("yoki yana «Qirqish» tugmasi.")}</>,
          ])}
          {xabarlar}
          {k && (
            <div className="ue-bolim">
              <div className="ue-attr-title">{nomi(f)}</div>
              <div className="ue-attr-tur">
                {t("Liniya")} {this.kvTeg(f?.p.KUCHLANISH)} · {t("jami {m} m", { m: m(k.jami_m) })}{k.vertexga ? ` · ${t("mavjud vertexda")}` : ""}
              </div>
              <div className="ue-bolaklar">
                <div>{t("1-bo'lak (boshi)")}<b>{m(k.a_m)} m</b>{t("asl GLOBALID qoladi")}</div>
                <div>{t("2-bo'lak (oxiri)")}<b>{m(k.b_m)} m</b>{t("yangi GLOBALID")}</div>
              </div>
            </div>
          )}
          <XatoQuti xato={s.xato} onMajburan={() => void this.qirqishniBajar(true)} />
          {k && (
            <div className="ue-row">
              <button type="button" className="ue-btn primary" disabled={s.saqlanmoqda} onClick={() => void this.qirqishniBajar(false)}>
                {s.saqlanmoqda ? <><span className="ue-spin" />{t("Tekshirilmoqda…")}</> : <><Icon n="scissors" size={15} />{t("Qirqish")}</>}
              </button>
              <button type="button" className="ue-btn" onClick={() => { this.tahrirLayer.removeAll(); this.setState({ qirqKorish: null, xato: null }); }}>
                {t("Bekor qilish")}
              </button>
            </div>
          )}
        </div>
      );
    }

    if (s.rejim === "qurilma") {
      const k = s.qurKorish;
      return (
        <div>
          {karta("device", t("Qurilma qo'yish"), (
            <>
              {t("Turini tanlang, keyin xaritada liniya ustiga bosing.")}
              <div className="ue-tur-tanlov">
                {[2, 1].map((ag) => (
                  <button key={ag} type="button" className={ag === s.qurTur ? "faol" : ""}
                    onClick={() => { this.tahrirLayer.removeAll(); this.setState({ qurTur: ag, qurKorish: null, xato: null }); }}>
                    <span className={`ue-belgi ${ag === 1 ? "ue-belgi-ps" : "ue-belgi-tp"}`} />{t(QUR_TURLARI[ag].nom)}
                  </button>
                ))}
              </div>
            </>
          ), [
            t("Liniya o'rtasiga qo'yilsa — liniya qirqilib, ikkala bo'lak ulanadi."),
            t("Liniya uchiga qo'yilsa — o'sha uch ulanadi."),
            <>{t("Terminal kuchlanishga qarab o'zi tanlanadi.")} {t("Tugatish:")} <kbd>Esc</kbd></>,
          ])}
          {xabarlar}
          {!k && <XatoQuti xato={s.xato} />}
          {k && (
            <div className="ue-bolim">
              <div className="ue-attr-title">{t(k.ag === 1 ? "Yangi podstansiya" : "Yangi transformator punkti")}</div>
              <div className="ue-attr-tur">{t("Ulanishlar (saqlanganda bajariladi):")}</div>
              <ul className="ue-ulanish-royxat">
                {k.ulanishlar.length ? k.ulanishlar.map((u: any) => (
                  <li key={u.globalid}><b>{u.nomi || t("(nomsiz)")}</b> · {kvMatn(u.kv)} → <b>{tx(u.terminal)}</b> {t("terminali")}<br />
                    <span className="ue-muted">{tx(u.holat)}</span></li>
                )) : <li className="otadi">{t("Yaqinda liniya yo'q — qurilma hech narsaga ulanmaydi (keyin liniya chizib ulaysiz).")}</li>}
                {(k.otib_ketadi || []).map((u: any) => (
                  <li key={u.globalid} className="otadi"><b>{u.nomi || t("(nomsiz)")}</b> · {kvMatn(u.kv)} — {t("shu nuqtadan o'tib ketadi, ulanmaydi. Saqlashda xato chiqishi mumkin: qurilmani biroz suring.")}</li>
                ))}
              </ul>
              <MaydonForma maydonlar={k.maydonlar} qiymatlar={s.forma}
                onChange={(mm, v) => this.setState((x) => ({ forma: { ...x.forma, [mm]: v } }))}
                onSubmit={() => void this.qurilmaniSaqla(false)}
                onCancel={() => { this.tahrirLayer.removeAll(); this.setState({ qurKorish: null, xato: null }); this.tanlovniOrnat([], { atributsiz: true }); }}
                saqlanmoqda={s.saqlanmoqda} xato={s.xato} onMajburan={() => void this.qurilmaniSaqla(true)} />
            </div>
          )}
        </div>
      );
    }

    if (s.rejim === "liniya") {
      const k = s.linKorish;
      const uch = (u: any, nom: string) => <li className={u.tur === "bosh" ? "otadi" : ""}><b>{nom}:</b> {tx(u.matn)}</li>;
      return (
        <div>
          {karta("line", t("Liniya chizish"), t("Xaritada nuqtama-nuqta bosing, oxirgi nuqtada ikki marta bosib tugating."), [
            t("Uchlari yaqin turgan qurilma, liniya uchi yoki liniya o'rtasiga o'zi yopishadi."),
            t("Kuchlanish ulanadigan liniyadan olinadi, terminal o'zi tanlanadi."),
            <><kbd>Backspace</kbd> {t("— oxirgi nuqtani o'chirish,")} <kbd>Esc</kbd> {t("— chizishni bekor qilish (yana Esc — chiqish).")}</>,
          ])}
          {xabarlar}
          {!k && s.xato && <div><XatoQuti xato={s.xato} />{qaytadan}</div>}
          {k && (
            <div className="ue-bolim">
              <div className="ue-attr-title">{t("Yangi liniya")}</div>
              <div className="ue-attr-tur">{this.kvTeg(k.kuchlanish)} <span className="ue-tag">{son(k.uzunlik_m, 1)} m</span></div>
              <div className="ue-attr-tur">{t("Ulanishlar (saqlanganda bajariladi):")}</div>
              <ul className="ue-ulanish-royxat">{uch(k.uchlar[0], t("Boshi"))}{uch(k.uchlar[1], t("Oxiri"))}</ul>
              <MaydonForma maydonlar={k.maydonlar} qiymatlar={s.forma}
                onChange={(mm, v) => {
                  this.setState((x) => ({ forma: { ...x.forma, [mm]: v } }));
                  // kuchlanish o'zgarsa — terminallarni qayta hisoblaymiz
                  if (mm === "KUCHLANISH") void this.liniyaTekshir(k.koordinatalar, Number(v));
                }}
                onSubmit={() => void this.liniyaniSaqla(false)}
                onCancel={() => { this.tahrirLayer.removeAll(); this.setState({ linKorish: null, xato: null }); this.tanlovniOrnat([], { atributsiz: true }); }}
                saqlanmoqda={s.saqlanmoqda} xato={s.xato} onMajburan={() => void this.liniyaniSaqla(true)} />
            </div>
          )}
        </div>
      );
    }

    // ko'chirish
    const o = s.kochObyekt, k = s.kochKorish;
    return (
      <div>
        {karta("move", t("Ko'chirish"), t("Ko'chirmoqchi bo'lgan qurilma yoki liniyani bosing."), [
          t("Qurilma — sudrab yangi joyga qo'ying. Ulangan liniya uchlari ham birga suriladi."),
          t("Liniya — vertexlarini suring. Chiziq o'rtasidan tortsangiz yangi vertex qo'shiladi."),
          t("Liniya uchini boshqa liniya yoki qurilmaga olib borsangiz — eski ulanishi uziladi, yangisiga ulanadi."),
        ])}
        {xabarlar}
        {o && (
          <div className="ue-bolim">
            <div className="ue-attr-title">{o.nomi}</div>
            {!k && (
              <div className="ue-attr-tur">
                {o.tur === "liniya" ? <>{t("Liniya")} {this.kvTeg(o.kv)} — {t("vertexlarini suring")}</>
                  : <>{turMatn(o.tur)} — {t("sichqoncha bilan sudrab yangi joyga qo'ying")}</>}
              </div>
            )}
            {k && o.tur !== "liniya" && (
              <>
                <div className="ue-attr-tur">{t("{m} m ga suriladi", { m: son(k.masofa_m, 1) })}</div>
                <ul className="ue-ulanish-royxat">
                  {k.liniyalar.length ? k.liniyalar.map((n: string, i: number) => <li key={i}>«{n}» — {t("uchi birga suriladi")}</li>)
                    : <li className="otadi">{t("Ulangan liniya yo'q")}</li>}
                </ul>
              </>
            )}
            {k && o.tur === "liniya" && (
              <>
                <div className="ue-attr-tur">{t("Uzunlik: {a} m → {b} m", { a: son(k.eski_uzunlik_m, 1), b: son(k.uzunlik_m, 1) })}</div>
                <ul className="ue-ulanish-royxat">
                  <li className={k.uchlar[0].tur === "bosh" ? "otadi" : ""}><b>{t("Boshi")}:</b> {tx(k.uchlar[0].matn)}</li>
                  <li className={k.uchlar[1].tur === "bosh" ? "otadi" : ""}><b>{t("Oxiri")}:</b> {tx(k.uchlar[1].matn)}</li>
                </ul>
                <p className="ue-muted">{t("Yana suring yoki saqlang.")}</p>
              </>
            )}
            <XatoQuti xato={s.xato} onMajburan={() => void this.kochirishniSaqla(true)} />
            <div className="ue-row">
              {k && (
                <button type="button" className="ue-btn primary" disabled={s.saqlanmoqda} onClick={() => void this.kochirishniSaqla(false)}>
                  {s.saqlanmoqda ? <><span className="ue-spin" />{t("Tekshirilmoqda…")}</> : <><Icon n="check" size={15} />{t("Saqlash")}</>}
                </button>
              )}
              <button type="button" className="ue-btn" onClick={() => this.kochirishBekor()}>{t("Bekor qilish")}</button>
            </div>
          </div>
        )}
        {!o && <XatoQuti xato={s.xato} />}
      </div>
    );
  }

  private renderAtributPanel() {
    const { yozishXato, rejim, panel } = this.state;
    const tahrirda = rejim || panel.k === "forma" || panel.k === "ochirish";
    if (yozishXato && tahrirda) {
      return (
        <div>
          <div className="ue-ogoh" style={{ marginBottom: 12 }}>
            <Icon n="upload" size={16} />
            <span><b>{t("Feature Layerga yozib bo'lmaydi — o'zgarishlar mahalliy saqlanadi.")}</b> {tx(yozishXato)}</span>
          </div>
          {rejim ? this.renderRejim() : this.renderPanel()}
        </div>
      );
    }
    return rejim ? this.renderRejim() : this.renderPanel();
  }

  private renderPanel() {
    const p = this.state.panel;
    switch (p.k) {
      case "yuklanmoqda":
        return <p className="ue-muted"><span className="ue-spin" style={{ display: "inline-block", marginRight: 8 }} />{t("Yuklanmoqda…")}</p>;
      case "obyekt":
        return this.renderObyekt(p);
      case "xato":
        return this.renderXatoObyekt(p.props);
      case "forma":
        return this.renderForma(p);
      case "ochirish":
        return this.renderOchirish(p);
      case "xabar":
        return (<div>{p.matn && <p className="ue-ogoh" style={{ color: "var(--text)", background: "var(--surface-2)" }}><Icon n="info" size={15} />{p.matn}</p>}<XatoQuti xato={this.state.xato} /></div>);
      default:
        return (
          <div className="ue-bosh-holat">
            <span className="ic"><Icon n="pointer" size={24} /></span>
            <b>{t("Obyekt tanlanmagan")}</b>
            <span>{t("Xaritada obyektni bosing — uning atributlari shu yerda chiqadi.")}</span>
            <span className="ue-yorliq"><kbd>Ctrl</kbd> + {t("bosish — bir nechta obyekt")}</span>
          </div>
        );
    }
  }

  private static REJIM: Record<string, { ic: string; nomi: string }> = {
    liniya: { ic: "line", nomi: "Liniya chizish rejimi" },
    qurilma: { ic: "device", nomi: "Qurilma qo'yish rejimi" },
    qirqish: { ic: "scissors", nomi: "Qirqish rejimi" },
    kochirish: { ic: "move", nomi: "Ko'chirish rejimi" },
  };

  render(): React.ReactNode {
    const cfg = this.cfg();
    const mapId = this.props.useMapWidgetIds?.[0];
    const canEdit = this.canEdit();
    const s = this.state;
    const qorongi = this.qorongimi();
    const rejim = s.rejim ? Widget.REJIM[s.rejim] : null;
    // yuklanish: xarita ochilib, tarmoq birinchi marta qurilguncha — markazda (xarita ostida xira ko'rinadi);
    // keyin (qayta yuklash, trace, saqlash) — tepada, xaritani to'smaydi
    const xaritaYuklanmoqda = !s.mapMessage && (!s.mapReady || !s.tarmoqTayyor);
    const yuklanishMatni = !s.mapReady ? t(mapId ? "Xarita ulanmoqda…" : "Xarita yuklanmoqda…") : t(s.serverStatus, s.serverVars);
    const ishMatni = xaritaYuklanmoqda || !s.mapReady ? "" : s.serverOk === null ? t(s.serverStatus, s.serverVars)
      : s.traceRunning ? t("Trace bajarilmoqda…") : s.saqlanmoqda ? t("Saqlanmoqda…") : "";
    const RIGHT: Array<{ id: RightPanel; ic: string; nomi: string }> = [
      { id: "trace", ic: "activity", nomi: "Trace" },
      { id: "atribut", ic: "form", nomi: t("Atributlar") },
      { id: "tarix", ic: "clock", nomi: t("Tarix") },
    ];

    return (
      <TilContext.Provider value={s.til}>
        <div className="ue-root" ref={this.rootRef} data-theme={qorongi ? "dark" : "light"} lang={s.til === "ru" ? "ru" : "uz"}>
          {mapId && (
            <div className="ue-hidden-map-bridge">
              <JimuMapViewComponent useMapWidgetId={mapId} onActiveViewChange={this.onActiveViewChange} />
            </div>
          )}

          <HeaderTabs
            title={t(cfg.title)}
            tab={s.tab}
            onTab={(tab) => this.setState({ tab })}
            search={s.search}
            onSearch={this.onSearch}
            searchHits={s.searchHits}
            onSearchPick={(id) => {
              this.setState({ searchHits: null });
              this.tanlovniOrnat([id], { yaqin: true });
            }}
            userName={this.foydalanuvchi() || "UnElektr"}
            roleLabel={t(ROL_NOMI[cfg.role] || cfg.role)}
            canEdit={canEdit}
            til={s.til}
            onTil={this.tilniTanla}
            mavzu={s.mavzu}
            onMavzu={this.mavzuniTanla}
          />

          <Ribbon
            tab={s.tab}
            canEdit={canEdit}
            rejim={s.rejim}
            kutilayotgan={s.kutilayotgan}
            basemap={s.basemap}
            onBasemap={(basemap) => {
              yoz(SAQLASH_KALITI.fon, basemap);
              this.setState({ basemap });
              if (mapId) this.applyBasemap(basemap); // ichki xaritada EmbeddedMap o'zi
            }}
            fiz1={s.fiz1}
            ogoh2={s.ogoh2}
            onFiz1={(fiz1) => this.setState({ fiz1 }, () => void this.xatolarniKorsat())}
            onOgoh2={(ogoh2) => this.setState({ ogoh2 }, () => void this.xatolarniKorsat())}
            onAction={this.onAction}
          />

          <div className={`ue-body${s.contentsCollapsed ? " chap-yigilgan" : ""}`}>
            <ContentsPanel
              collapsed={s.contentsCollapsed}
              onCollapse={(contentsCollapsed) => this.setState({ contentsCollapsed })}
              lineVisible={s.lineVisible}
              deviceVisible={s.deviceVisible}
              soni={s.soni}
              onLineToggle={(kv, on) => this.setState((x) => ({ lineVisible: { ...x.lineVisible, [kv]: on } }), () => this.applyFilters())}
              onDeviceToggle={(tur, on) => this.setState((x) => ({ deviceVisible: { ...x.deviceVisible, [tur]: on } }), () => this.applyFilters())}
              onJadval={(f) => this.tarmoqJadvali(f)}
              mahalliy={s.kutilayotgan > 0}
            />

            <div className="ue-center">
              <div className="ue-map-host">
                {!mapId && (
                  <EmbeddedMap
                    useDataSources={this.props.useDataSources}
                    basemap={s.basemap}
                    qorongi={qorongi}
                    webMapItemId={cfg.webMapItemId}
                    portalUrl={cfg.portalUrl}
                    onViewReady={this.onEmbeddedReady}
                    onError={(mapMessage) => this.setState({ mapReady: false, mapMessage })}
                  />
                )}
                {rejim && (
                  <div className="ue-map-chip">
                    <span className="nuqta" />
                    <Icon n={rejim.ic} size={15} />
                    {t(rejim.nomi)}
                    <kbd>Esc</kbd>
                    <button type="button" onClick={() => this.rejimniOrnat(null)}>{t("Chiqish")}</button>
                  </div>
                )}
                <div className={`ue-yuk-chiziq${xaritaYuklanmoqda || ishMatni ? " faol" : ""}`} aria-hidden="true" />
                {ishMatni && <div className="ue-yuk-pill" role="status"><span className="ue-yuk-halqa" />{ishMatni}</div>}
                <div className={`ue-yuk-ekran${xaritaYuklanmoqda ? " faol" : ""}`} role="status" aria-hidden={!xaritaYuklanmoqda}>
                  <div className="ue-yuk-belgi">
                    <span className="ue-yuk-tolqin" />
                    <span className="ue-yuk-tolqin ikkinchi" />
                    <span className="ue-yuk-yoy" />
                    <Icon n="bolt" size={24} />
                  </div>
                  <div className="ue-yuk-matn">
                    <b>{yuklanishMatni}</b>
                    <span>{t(cfg.title)}</span>
                  </div>
                </div>
                {!s.mapReady && s.mapMessage && (
                  <div className="ue-map-note">
                    <div className="ue-map-note-karta">
                      <Icon n="alert" size={24} />
                      <span>{tx(s.mapMessage)}</span>
                    </div>
                  </div>
                )}
              </div>
              <ResultsTable
                open={s.tableOpen}
                title={s.tableTitle}
                rows={s.tableRows}
                version={s.tableVersion}
                initialFilter={s.tableFilter}
                tanlov={s.tanlov}
                onRowClick={(g, toggle) => {
                  if (toggle) this.tanlovniOrnat(s.tanlov.includes(g) ? s.tanlov.filter((x) => x !== g) : [...s.tanlov, g]);
                  else this.tanlovniOrnat([g], { yaqin: true });
                }}
                onSelectAll={(gids) => this.tanlovniOrnat(gids, { yaqin: true })}
                onClose={() => this.setState({ tableOpen: false })}
                onMessage={(m) => this.xabar(m)}
              />
            </div>

            <aside className="ue-right">
              <div className="ue-right-tabs" role="tablist">
                {RIGHT.map((p) => (
                  <button key={p.id} type="button" role="tab" aria-selected={s.right === p.id} className={s.right === p.id ? "faol" : ""}
                    onClick={() => { this.setState({ right: p.id }); if (p.id === "tarix") void this.tarixniKorsat(false); }}>
                    <Icon n={p.ic} size={15} />{p.nomi}
                  </button>
                ))}
              </div>
              <div className="ue-right-body">
                {s.right === "trace" && (
                  <TracePanel
                    turi={s.traceTuri}
                    onTuri={(traceTuri) => this.setState({ traceTuri })}
                    nuqtalar={s.nuqtalar}
                    tavsifla={this.tavsifla}
                    tierOshib={s.tierOshib}
                    onTierOshib={(tierOshib) => this.setState({ tierOshib })}
                    onRemove={this.nuqtaOlibTashla}
                    onRun={this.runTrace}
                    running={s.traceRunning}
                    natija={s.traceNatija}
                  />
                )}
                {s.right === "atribut" && this.renderAtributPanel()}
                {s.right === "tarix" && (
                  <HistoryPanel
                    items={s.history}
                    loading={s.historyLoading}
                    xato={s.historyXato}
                    onUndo={this.ortgaQaytar}
                    onPick={(g) => { if (this.tarmoq.get(g)) { this.tanlovniOrnat([g], { yaqin: true, atributsiz: true }); } }}
                    canEdit={canEdit}
                  />
                )}
              </div>
            </aside>
          </div>

          <StatusBar
            server={t(s.serverStatus, s.serverVars)}
            serverOk={s.serverOk}
            kutilayotgan={s.kutilayotgan}
            selectionCount={s.tanlov.length}
            coords={s.coords}
            scale={s.scale}
            message={s.toast}
            isError={s.toastError}
          />
        </div>
      </TilContext.Provider>
    );
  }
}
