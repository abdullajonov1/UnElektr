import { React } from "jimu-core";
import { loadArcGISJSAPIModules } from "jimu-arcgis";
import {
  classifyPick,
  findMapLayerByTitle,
  findMapLayerByUrl,
  layerPicksFromUseDataSources,
  type LayerPick,
} from "./layer-picks";
import { fonRangi, fonYasa } from "./fon";
import type { Fon } from "./components/Ribbon";
import {
  DEFAULT_PORTAL_URL,
  DEFAULT_WEBMAP_ITEM_ID,
} from "../config";

interface Props {
  useDataSources: unknown;
  basemap: Fon;
  /** Qorong'i mavzu — xarita fon rangi. */
  qorongi?: boolean;
  webMapItemId?: string;
  portalUrl?: string;
  onViewReady: (view: any, layers: { lineLayer: any; deviceLayer: any }) => void;
  onError: (message: string) => void;
}

function normTitle(t: unknown): string {
  return String(t || "")
    .toLowerCase()
    .replace(/[''`ʼ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** ElektrTarmogiV5 dagi kabi — UN Device / Line. */
function isDeviceTitle(title: string): boolean {
  const t = normTitle(title);
  if (!t.includes("uskuna") && !t.includes("device") && !t.includes("qurilma")) {
    return false;
  }
  if (
    t.includes("assembly") ||
    t.includes("junction") ||
    t.includes("subnet") ||
    t.includes("structure")
  ) {
    return false;
  }
  return true;
}

function isLineTitle(title: string): boolean {
  const t = normTitle(title);
  if (t.includes("uskuna") || t.includes("device") || t.includes("qurilma")) {
    return false;
  }
  if (
    t.includes("assembly") ||
    t.includes("junction") ||
    t.includes("subnet") ||
    t.includes("structure") ||
    t.includes("boundary")
  ) {
    return false;
  }
  if (t.includes("line") || t.includes("liniya")) return true;
  // "Elektr tarmog'i" (asosan liniya SubtypeGroup)
  if (t === "elektr tarmogi" || t === "elektr tarmog i") return true;
  if (t.startsWith("elektr tarmogi") && t.split(" ").length <= 3) return true;
  return false;
}

function allMapLayers(map: any): any[] {
  return map?.allLayers?.toArray?.() || map?.layers?.toArray?.() || [];
}

/**
 * Select data → ichki MapView.
 * URL bo'lmasa WebMap; faqat Line+Device ko'rsatiladi, basemap majburiy.
 */
export default class EmbeddedMap extends React.PureComponent<Props> {
  private containerRef = React.createRef<HTMLDivElement>();
  private view: any = null;
  private map: any = null;
  private destroyed = false;
  private Basemap: any = null;
  private bootToken = 0;

  componentDidMount(): void {
    void this.boot();
  }

  componentDidUpdate(prev: Props): void {
    const prevKey = JSON.stringify(prev.useDataSources || []);
    const nextKey = JSON.stringify(this.props.useDataSources || []);
    if (
      prevKey !== nextKey ||
      prev.webMapItemId !== this.props.webMapItemId ||
      prev.portalUrl !== this.props.portalUrl
    ) {
      void this.boot();
    }
    if (prev.basemap !== this.props.basemap) {
      this.applyBasemap(this.props.basemap);
    }
    if (prev.qorongi !== this.props.qorongi && this.view) {
      this.view.background = { color: fonRangi(!!this.props.qorongi) };
    }
  }

  componentWillUnmount(): void {
    this.destroyed = true;
    this.destroyView();
  }

  private destroyView() {
    try {
      this.view?.destroy?.();
    } catch {
      /* ignore */
    }
    this.view = null;
    this.map = null;
  }

  private applyBasemap(mode: Fon) {
    if (!this.map) return;
    void fonYasa(mode).then((b) => {
      if (this.map && this.props.basemap === mode) this.map.basemap = b;
    }).catch(() => { /* fon xarita yuklanmasa — fonsiz */ });
  }

  private async boot() {
    const el = this.containerRef.current;
    if (!el) return;
    const token = ++this.bootToken;
    this.destroyView();

    const picks = layerPicksFromUseDataSources(this.props.useDataSources);
    if (!picks.length) {
      this.props.onError(
        "Select data orqali liniya va qurilma Feature Layerlarini tanlang.",
      );
      return;
    }

    const withUrl = picks.filter((p) => p.url);
    const itemId =
      this.props.webMapItemId ||
      picks.find((p) => p.itemId)?.itemId ||
      DEFAULT_WEBMAP_ITEM_ID;
    const portalUrl = (
      this.props.portalUrl ||
      picks.find((p) => p.portalUrl)?.portalUrl ||
      DEFAULT_PORTAL_URL
    ).replace(/\/$/, "");

    try {
      if (withUrl.length >= 1) {
        await this.bootFromFeatureLayers(el, withUrl, token);
      } else if (itemId) {
        await this.bootFromWebMap(el, picks, itemId, portalUrl, token);
      } else {
        this.props.onError("Qatlam URL / WebMap topilmadi.");
      }
    } catch (e: any) {
      if (this.destroyed || token !== this.bootToken) return;
      this.props.onError(e?.message || "Ichki xarita ochilmadi");
    }
  }

  private async finishView(
    view: any,
    lineLayer: any,
    deviceLayer: any,
    token: number,
  ) {
    if (this.destroyed || token !== this.bootToken) return;

    // Faqat Line + Device ko'rinsin
    for (const layer of allMapLayers(view.map)) {
      try {
        if (layer === lineLayer || layer === deviceLayer) {
          layer.visible = true;
          if (layer.opacity != null) layer.opacity = 1;
        } else if (
          layer !== this.highlightLayerSafe(view) &&
          String(layer.type || "") !== "graphics"
        ) {
          // basemap tiles alohida
          const t = String(layer.type || "");
          if (t === "feature" || t === "subtype-group" || t === "group") {
            layer.visible = false;
          }
        }
      } catch {
        /* ignore */
      }
    }

    this.applyBasemap(this.props.basemap);

    try {
      view.resize?.();
    } catch {
      /* ignore */
    }

    await this.zoomToLayers(view, [lineLayer, deviceLayer]);

    // Ikkinchi resize — layout keyin
    setTimeout(() => {
      try {
        view.resize?.();
      } catch {
        /* ignore */
      }
    }, 200);

    this.props.onViewReady(view, { lineLayer, deviceLayer });
  }

  private highlightLayerSafe(_view: any): any {
    return null;
  }

  private async bootFromFeatureLayers(
    el: HTMLDivElement,
    picks: LayerPick[],
    token: number,
  ) {
    const [Map, MapView, FeatureLayer, Basemap] = await loadArcGISJSAPIModules([
      "esri/Map",
      "esri/views/MapView",
      "esri/layers/FeatureLayer",
      "esri/Basemap",
    ]);
    if (this.destroyed || token !== this.bootToken) return;
    this.Basemap = Basemap;

    const map = new Map({ basemap: await fonYasa(this.props.basemap).catch((): any => null) });
    this.map = map;

    const { lineLayer, deviceLayer } = await this.buildFromUrls(
      FeatureLayer,
      picks,
    );
    if (lineLayer) map.add(lineLayer);
    if (deviceLayer) map.add(deviceLayer);
    if (!lineLayer && !deviceLayer) {
      this.props.onError("Feature Layer URL dan qatlam yuklanmadi.");
      return;
    }

    const view = new MapView({
      container: el,
      map,
      center: [69.27, 41.31],
      zoom: 12,
      ui: { components: ["zoom"] },
      constraints: { rotationEnabled: false },
      background: { color: fonRangi(!!this.props.qorongi) },
    });
    this.view = view;
    await view.when();
    await this.finishView(view, lineLayer, deviceLayer, token);
  }

  private async bootFromWebMap(
    el: HTMLDivElement,
    picks: LayerPick[],
    itemId: string,
    portalUrl: string,
    token: number,
  ) {
    const [WebMap, MapView, Basemap] = await loadArcGISJSAPIModules([
      "esri/WebMap",
      "esri/views/MapView",
      "esri/Basemap",
    ]);
    if (this.destroyed || token !== this.bootToken) return;
    this.Basemap = Basemap;

    const map = new WebMap({
      portalItem: { id: itemId, portal: { url: portalUrl } },
    });
    await map.load();
    if (this.destroyed || token !== this.bootToken) return;
    this.map = map;

    const view = new MapView({
      container: el,
      map,
      ui: { components: ["zoom"] },
      constraints: { rotationEnabled: false },
      background: { color: fonRangi(!!this.props.qorongi) },
      center: [69.27, 41.31],

      zoom: 11,
    });
    this.view = view;
    await view.when();
    if (this.destroyed || token !== this.bootToken) return;

    const { lineLayer, deviceLayer } = this.resolveOperationalLayers(map, picks);
    if (!lineLayer && !deviceLayer) {
      this.props.onError(
        "WebMap yuklandi, lekin Line/Device qatlam topilmadi.",
      );
      return;
    }

    await this.finishView(view, lineLayer, deviceLayer, token);
  }

  private resolveOperationalLayers(
    map: any,
    picks: LayerPick[],
  ): { lineLayer: any; deviceLayer: any } {
    let lineLayer: any = null;
    let deviceLayer: any = null;

    // 1) Select data title/url
    for (const pick of picks) {
      const layer =
        (pick.url ? findMapLayerByUrl(map, pick.url) : null) ||
        findMapLayerByTitle(map, pick.title);
      if (!layer) continue;
      const kind = classifyPick(pick);
      if (kind === "device" || isDeviceTitle(pick.title)) {
        if (!deviceLayer) deviceLayer = layer;
      } else if (kind === "line" || isLineTitle(pick.title)) {
        if (!lineLayer) lineLayer = layer;
      }
    }

    // 2) UN title rules
    const all = allMapLayers(map);
    if (!deviceLayer) {
      deviceLayer = all.find((l) => isDeviceTitle(l?.title || l?.name)) || null;
    }
    if (!lineLayer) {
      lineLayer = all.find((l) => isLineTitle(l?.title || l?.name)) || null;
    }

    // 3) geometry fallback (faqat UN operational)
    if (!deviceLayer) {
      deviceLayer =
        all.find((l) => {
          const t = normTitle(l?.title);
          const g = String(l?.geometryType || "").toLowerCase();
          return (
            g.includes("point") &&
            !t.includes("structure") &&
            !t.includes("junction") &&
            !t.includes("assembly")
          );
        }) || null;
    }
    if (!lineLayer) {
      lineLayer =
        all.find((l) => {
          const t = normTitle(l?.title);
          const g = String(l?.geometryType || "").toLowerCase();
          return (
            (g.includes("polyline") || g.includes("line")) &&
            !t.includes("structure") &&
            !t.includes("subnet")
          );
        }) || null;
    }

    return { lineLayer, deviceLayer };
  }

  private async buildFromUrls(FeatureLayer: any, picks: LayerPick[]) {
    let lineLayer: any = null;
    let deviceLayer: any = null;
    for (const pick of picks) {
      try {
        const fl = new FeatureLayer({
          url: pick.url,
          title: pick.title || pick.url,
          outFields: ["*"],
        });
        await fl.load();
        const g = String(fl.geometryType || "").toLowerCase();
        const kind = classifyPick(pick);
        if (!deviceLayer && (kind === "device" || g.includes("point"))) {
          deviceLayer = fl;
        } else if (
          !lineLayer &&
          (kind === "line" || g.includes("polyline") || g.includes("line"))
        ) {
          lineLayer = fl;
        }
      } catch {
        /* skip */
      }
    }
    return { lineLayer, deviceLayer };
  }

  private async zoomToLayers(view: any, layers: any[]) {
    const usable = layers.filter(Boolean);
    for (const layer of usable) {
      try {
        await layer.when?.();
        const ext = layer.fullExtent;
        if (ext && Number.isFinite(ext.xmin) && ext.xmin !== 0) {
          await view.goTo(ext.expand?.(1.2) || ext);
          return;
        }
        // query extent
        if (typeof layer.queryExtent === "function") {
          const q = layer.createQuery();
          q.where = "1=1";
          const res = await layer.queryExtent(q);
          if (res?.extent) {
            await view.goTo(res.extent.expand?.(1.2) || res.extent);
            return;
          }
        }
      } catch {
        /* next */
      }
    }
    // Toshkent fallback
    try {
      await view.goTo({ center: [69.27, 41.31], zoom: 12 });
    } catch {
      /* ignore */
    }
  }

  render(): React.ReactNode {
    return <div className="ue-embedded-map" ref={this.containerRef} />;
  }
}
