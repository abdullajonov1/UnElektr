/** Geometriya yordamchilari: GeoJSON (WGS84) ↔ ArcGIS geometriyasi, istalgan koordinata tizimiga proyeksiya. */
import { loadArcGISJSAPIModules } from "jimu-arcgis";

let M: any = null;

export async function geoInit(): Promise<void> {
  if (M) return;
  const [projection, Point, Polyline, Extent, SpatialReference] = await loadArcGISJSAPIModules([
    "esri/geometry/projection",
    "esri/geometry/Point",
    "esri/geometry/Polyline",
    "esri/geometry/Extent",
    "esri/geometry/SpatialReference",
  ]);
  await projection.load();
  M = { projection, Point, Polyline, Extent, SpatialReference };
}

const WGS = { wkid: 4326 };

/** GeoJSON → ArcGIS geometriya (WGS84). hasZ — Z li qatlam uchun z=0 qo'shiladi. */
export function fromGeoJson(g: any, hasZ = false): any {
  if (!g) return null;
  const z = (c: number[]) => (hasZ ? [c[0], c[1], 0] : [c[0], c[1]]);
  if (g.type === "Point") {
    return new M.Point({ x: g.coordinates[0], y: g.coordinates[1], ...(hasZ ? { z: 0 } : {}), spatialReference: WGS });
  }
  const paths = g.type === "LineString" ? [g.coordinates] : g.type === "MultiLineString" ? g.coordinates : null;
  if (!paths) return null;
  return new M.Polyline({ paths: paths.map((p: number[][]) => p.map(z)), hasZ, spatialReference: WGS });
}

export function project(geom: any, sr: any): any {
  if (!geom || !sr) return geom;
  if (geom.spatialReference?.equals?.(sr)) return geom;
  return M.projection.project(geom, sr);
}

export function toWgs(geom: any): any {
  return project(geom, M.SpatialReference.WGS84);
}

/** Xaritadagi nuqta → [lon, lat]. */
export function lonLat(p: any): [number, number] {
  const w = toWgs(p);
  return [w.x, w.y];
}

/** Chizilgan polyline → [[lon, lat], ...] (birinchi yo'l). */
export function chiziqKoord(geom: any): number[][] {
  const w = toWgs(geom);
  return (w.paths?.[0] || []).map((c: number[]) => [c[0], c[1]]);
}

/** GeoJSON geometriyalar ro'yxatining umumiy chegarasi (WGS84 Extent). */
export function extentOf(geoms: any[]): any {
  let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
  const yur = (c: any) => {
    if (typeof c[0] === "number") {
      xmin = Math.min(xmin, c[0]); xmax = Math.max(xmax, c[0]);
      ymin = Math.min(ymin, c[1]); ymax = Math.max(ymax, c[1]);
    } else {
      for (const x of c) yur(x);
    }
  };
  for (const g of geoms) if (g?.coordinates) yur(g.coordinates);
  if (!Number.isFinite(xmin)) return null;
  return new M.Extent({ xmin, ymin, xmax, ymax, spatialReference: WGS });
}

/** Ekrandagi `piksel` necha metrga to'g'ri kelishi (dvigatel tolerans_m uchun). */
export function pikselMetr(view: any, piksel: number, lat: number): number {
  const sr = view.spatialReference;
  const res = Number(view.resolution) || 1;
  const cos = Math.cos((lat * Math.PI) / 180);
  if (sr?.isWebMercator) return piksel * res * cos;
  if (sr?.isGeographic) return piksel * res * 111320 * cos;
  return piksel * res;
}
