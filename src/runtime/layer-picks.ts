import {
  DataSourceManager,
  getAppStore,
  type UseDataSource,
} from "jimu-core";

export interface LayerPick {
  id: string;
  url: string;
  title: string;
  itemId: string;
  portalUrl: string;
  layerId: string;
}

function readVal(obj: any, key: string): any {
  if (!obj) return undefined;
  try {
    if (typeof obj.get === "function") return obj.get(key);
  } catch {
    /* ignore */
  }
  try {
    return obj[key];
  } catch {
    return undefined;
  }
}

function dsRecord(appDs: any, id: string): any {
  if (!appDs || !id) return null;
  try {
    if (typeof appDs.get === "function") return appDs.get(id);
  } catch {
    /* ignore */
  }
  try {
    return appDs[id];
  } catch {
    return null;
  }
}

function portalFromStore(): string {
  const state = getAppStore().getState() as any;
  return String(state?.portalUrl || state?.appConfig?.portalUrl || "").replace(
    /\/$/,
    "",
  );
}

export function toPlainUseDataSources(value: unknown): UseDataSource[] {
  if (!value) return [];
  if (Array.isArray(value)) return value as UseDataSource[];
  if (typeof (value as any).toArray === "function") {
    return (value as any).toArray() as UseDataSource[];
  }
  if (typeof (value as any).asMutable === "function") {
    return (value as any).asMutable({ deep: true }) as UseDataSource[];
  }
  return [];
}

function urlFromDsm(dataSourceId: string): string {
  try {
    const ds: any = DataSourceManager.getInstance().getDataSource(dataSourceId);
    if (!ds) return "";
    const json = typeof ds.getDataSourceJson === "function" ? ds.getDataSourceJson() : null;
    let url = String(
      readVal(json, "url") ||
        ds.url ||
        ds.layer?.url ||
        ds.layerDefinition?.url ||
        "",
    ).replace(/\/$/, "");
    const layerId =
      readVal(json, "layerId") ??
      ds.layerId ??
      ds.layer?.layerId;
    if (url && layerId !== undefined && layerId !== null && layerId !== "") {
      if (!/\/\d+$/.test(url)) url = `${url}/${layerId}`;
    }
    // ba'zi FL DS: getUrl()
    if (!url && typeof ds.getUrl === "function") {
      url = String(ds.getUrl() || "").replace(/\/$/, "");
    }
    return url;
  } catch {
    return "";
  }
}

/**
 * AppConfig + DataSourceManager orqali Feature Layer URL/title.
 * Utility Network child layerlarda url odatda parentda bo'ladi.
 */
export function layerPicksFromUseDataSources(
  useDataSources: unknown,
): LayerPick[] {
  const list = toPlainUseDataSources(useDataSources);
  const state = getAppStore().getState() as any;
  const appDs = state?.appConfig?.dataSources;
  const fallbackPortal = portalFromStore();

  return list.map((uds) => {
    const id = String(uds?.dataSourceId || "");
    const rec = dsRecord(appDs, id);
    const rootId = String(
      uds?.rootDataSourceId ||
        uds?.mainDataSourceId ||
        readVal(rec, "parentDataSourceId") ||
        "",
    );

    let url = String(readVal(rec, "url") || "").replace(/\/$/, "");
    let layerId = String(
      readVal(rec, "layerId") ?? readVal(uds, "layerId") ?? "",
    );
    if (url && layerId !== "" && !/\/\d+$/.test(url)) {
      url = `${url}/${layerId}`;
    }

    let itemId = String(readVal(rec, "itemId") || "");
    let portalUrl = String(readVal(rec, "portalUrl") || "");
    let walkId = rootId || String(readVal(rec, "parentDataSourceId") || "");
    const seen = new Set<string>();
    while (walkId && !seen.has(walkId)) {
      seen.add(walkId);
      const parent = dsRecord(appDs, walkId);
      if (!itemId) itemId = String(readVal(parent, "itemId") || "");
      if (!portalUrl) portalUrl = String(readVal(parent, "portalUrl") || "");
      if (!url) {
        const pUrl = String(readVal(parent, "url") || "").replace(/\/$/, "");
        if (pUrl) {
          url =
            layerId && !/\/\d+$/.test(pUrl) ? `${pUrl}/${layerId}` : pUrl;
        }
      }
      walkId = String(readVal(parent, "parentDataSourceId") || "");
    }

    if (!url && id) {
      url = urlFromDsm(id);
    }

    const title = String(
      readVal(rec, "sourceLabel") ||
        readVal(rec, "label") ||
        readVal(uds, "dataSourceId") ||
        id,
    );

    return {
      id,
      url,
      title,
      itemId,
      portalUrl: (portalUrl || fallbackPortal).replace(/\/$/, ""),
      layerId,
    };
  });
}

function normUrl(u: string): string {
  return String(u || "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

function walkMapLayers(map: any): any[] {
  const out: any[] = [];
  const visit = (layer: any) => {
    if (!layer) return;
    out.push(layer);
    const kids =
      typeof layer.layers?.toArray === "function"
        ? layer.layers.toArray()
        : layer.allLayers?.toArray?.() || layer.layers || [];
    const arr = Array.isArray(kids) ? kids : [];
    for (const c of arr) visit(c);
  };
  const roots =
    typeof map?.layers?.toArray === "function"
      ? map.layers.toArray()
      : map?.allLayers?.toArray?.() || [];
  for (const r of roots) visit(r);
  return out;
}

export function findMapLayerByUrl(map: any, url: string): any | null {
  const target = normUrl(url);
  if (!target) return null;
  for (const layer of walkMapLayers(map)) {
    const u = normUrl(layer?.url || layer?.parsedUrl?.path || "");
    if (!u) continue;
    if (u === target || u.startsWith(target) || target.startsWith(u)) {
      return layer;
    }
  }
  return null;
}

export function findMapLayerByTitle(map: any, title: string): any | null {
  const t = normTitle(title);
  if (!t) return null;
  for (const layer of walkMapLayers(map)) {
    const lt = normTitle(layer?.title || layer?.name || "");
    if (!lt) continue;
    if (lt === t || lt.includes(t) || t.includes(lt)) return layer;
  }
  return null;
}

function normTitle(t: string): string {
  return String(t || "")
    .toLowerCase()
    .replace(/[''`ʼ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function classifyPick(pick: LayerPick): "line" | "device" | "unknown" {
  const t = normTitle(pick.title);
  // Avval aniqroq kalitlar
  if (
    t.includes("device") ||
    t.includes("qurilma") ||
    t.includes("uskuna") ||
    /\bdev\b/.test(t) ||
    t.includes("transformator") ||
    t.includes("podstansiya")
  ) {
    return "device";
  }
  if (
    t.includes("line") ||
    t.includes("liniya") ||
    t.includes("conductor") ||
    t.includes("tarmog")
  ) {
    return "line";
  }
  return "unknown";
}
