/** Feature Layerni o'qish: GeoJSON nusxa (dvigatel uchun), maydonlar sxemasi, GLOBALID ko'rinishi. */
import type { GeoJsonFC } from "./dvigatel";

export type { GeoJsonFC };

/** FeatureLayer maydonlari — dvigatelga sxema sifatida beriladi (tahrir formasi shu sxemadan quriladi). */
export function layerSchema(layer: any): any[] {
  return (layer?.fields || []).map((f: any) => ({
    name: f.name,
    type: f.type,
    editable: f.editable !== false,
    alias: f.alias,
  }));
}

/** FeatureLayer → GeoJSON FeatureCollection (WGS84). maxRecordCount dan oshsa ham hammasini oladi. */
export async function layerToGeoJson(layer: any): Promise<GeoJsonFC> {
  if (!layer) return { type: "FeatureCollection", features: [] };
  await layer.load?.();
  const oidField = layer.objectIdField || "OBJECTID";
  const idQ = layer.createQuery();
  idQ.where = "1=1";
  const ids: number[] = ((await layer.queryObjectIds(idQ)) || []).slice().sort((a: number, b: number) => a - b);
  const qadam = Math.max(100, Math.min(Number(layer.capabilities?.query?.maxRecordCount) || 1000, 2000));
  const bolaklar: number[][] = [];
  for (let i = 0; i < ids.length; i += qadam) bolaklar.push(ids.slice(i, i + qadam));

  const features: any[] = [];
  let navbat = 0;
  const ishchi = async () => {
    while (navbat < bolaklar.length) {
      const bolak = bolaklar[navbat++];
      const q = layer.createQuery();
      q.objectIds = bolak;
      q.outFields = ["*"];
      q.returnGeometry = true;
      q.returnZ = false;
      q.outSpatialReference = { wkid: 4326 };
      const res = await layer.queryFeatures(q);
      for (const f of res?.features || []) {
        const feat = graphicToFeature(f);
        if (feat.properties.OBJECTID == null) feat.properties.OBJECTID = f.attributes?.[oidField];
        features.push(feat);
      }
    }
  };
  await Promise.all([ishchi(), ishchi(), ishchi()]);
  return { type: "FeatureCollection", features };
}

export function graphicToFeature(g: any): any {
  const attrs = { ...(g.attributes || {}) };
  const geom = g.geometry;
  let geometry: any = null;
  if (geom) {
    if (geom.type === "point") {
      geometry = { type: "Point", coordinates: [geom.x, geom.y] };
    } else if (geom.type === "polyline") {
      const paths = geom.paths || [];
      geometry =
        paths.length === 1
          ? { type: "LineString", coordinates: paths[0].map(xy) }
          : { type: "MultiLineString", coordinates: paths.map((p: number[][]) => p.map(xy)) };
    }
  }
  return { type: "Feature", geometry, properties: attrs };
}

function xy(c: number[]): number[] {
  return [c[0], c[1]];
}

export function normalizeGlobalId(gid: string): string {
  let g = String(gid || "").trim().toUpperCase();
  if (!g) return g;
  if (!g.startsWith("{")) g = "{" + g;
  if (!g.endsWith("}")) g = g + "}";
  return g;
}
