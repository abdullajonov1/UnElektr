/** Map ichidan liniya / qurilma FeatureLayer topish. */

export interface LayerPair {
  lineLayer: any | null;
  deviceLayer: any | null;
}

function titleOf(layer: any): string {
  return String(layer?.title || layer?.name || "").trim();
}

function norm(t: string): string {
  return t
    .toLowerCase()
    .replace(/[''`ʼ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function walkLayers(map: any): any[] {
  const out: any[] = [];
  const visit = (layer: any) => {
    if (!layer) return;
    out.push(layer);
    const kids =
      typeof layer.layers?.toArray === "function"
        ? layer.layers.toArray()
        : layer.layers || layer.allLayers || [];
    const arr = Array.isArray(kids)
      ? kids
      : typeof kids?.toArray === "function"
        ? kids.toArray()
        : [];
    for (const c of arr) visit(c);
  };
  const roots =
    typeof map?.layers?.toArray === "function"
      ? map.layers.toArray()
      : map?.allLayers?.toArray?.() || [];
  for (const r of roots) visit(r);
  return out;
}

function isFeatureLike(layer: any): boolean {
  const t = String(layer?.type || layer?.declaredClass || "");
  return (
    t.includes("feature") ||
    t.includes("FeatureLayer") ||
    t.includes("SubtypeGroup") ||
    !!layer?.queryFeatures
  );
}

export function findLineLayer(map: any, preferredTitle = ""): any | null {
  const layers = walkLayers(map).filter(isFeatureLike);
  const pref = norm(preferredTitle);
  if (pref) {
    const hit = layers.find((l) => norm(titleOf(l)) === pref || norm(titleOf(l)).includes(pref));
    if (hit) return hit;
  }
  for (const l of layers) {
    const t = norm(titleOf(l));
    if (t.includes("liniya") || t.includes("line") || t.includes("conductor")) return l;
    if (t.includes("elektr") && !t.includes("device") && !t.includes("qurilma") && !t.includes("uskuna")) {
      return l;
    }
  }
  // geometry type
  for (const l of layers) {
    const g = String(l.geometryType || "").toLowerCase();
    if (g.includes("polyline") || g.includes("line")) return l;
  }
  return null;
}

export function findDeviceLayer(map: any, preferredTitle = ""): any | null {
  const layers = walkLayers(map).filter(isFeatureLike);
  const pref = norm(preferredTitle);
  if (pref) {
    const hit = layers.find((l) => norm(titleOf(l)) === pref || norm(titleOf(l)).includes(pref));
    if (hit) return hit;
  }
  for (const l of layers) {
    const t = norm(titleOf(l));
    if (
      t.includes("qurilma") ||
      t.includes("device") ||
      t.includes("uskuna") ||
      t.includes("transformator") ||
      t.includes("podstansiya")
    ) {
      return l;
    }
  }
  for (const l of layers) {
    const g = String(l.geometryType || "").toLowerCase();
    if (g.includes("point")) return l;
  }
  return null;
}

export function resolveLayers(
  map: any,
  lineTitle = "",
  deviceTitle = "",
): LayerPair {
  return {
    lineLayer: findLineLayer(map, lineTitle),
    deviceLayer: findDeviceLayer(map, deviceTitle),
  };
}

export function fieldName(layer: any, candidates: string[]): string {
  const fields: any[] = layer?.fields || [];
  const lower = new Map(
    fields.map((f) => [String(f.name).toLowerCase(), String(f.name)]),
  );
  for (const c of candidates) {
    const hit = lower.get(c.toLowerCase());
    if (hit) return hit;
  }
  // fields hali yuklanmagan bo'lsa — birinchi candidateni qaytaramiz
  return candidates[0] || "";
}

export const KV_COLORS: Record<string, string> = {
  "0.4": "#2fbf3a",
  "6": "#c026d3",
  "10": "#1f6fe0",
  "35": "#f08c00",
  "110": "#d62828",
};

export const KV_ORDER = [110, 35, 10, 6, 0.4];
