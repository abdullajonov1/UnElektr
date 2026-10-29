import { loadArcGISJSAPIModules } from "jimu-arcgis";
import { fonTuri, type Fon, type FonQatlam } from "./fon-royxat";

/** Fon xarita (fon-royxat.ts katalogidan). Topilmasa yoki "yoq" — null (fonsiz). */
export async function fonYasa(mode: Fon): Promise<any> {
  const f = fonTuri(mode);
  if (!f || !f.qatlamlar.length) return null;
  const [Basemap, TileLayer, WebTileLayer] = await loadArcGISJSAPIModules(
    ["esri/Basemap", "esri/layers/TileLayer", "esri/layers/WebTileLayer"]);
  const qatlam = (q: FonQatlam) => (q.tur === "tile"
    ? new TileLayer({ url: q.url })
    : new WebTileLayer({ urlTemplate: q.url, subDomains: q.sub, copyright: q.copyright }));
  const [asos, ...ustki] = f.qatlamlar;
  return new Basemap({ id: f.id, title: f.nomi, baseLayers: [qatlam(asos)], referenceLayers: ustki.map(qatlam) });
}



/** Xarita fonining rangi (fon xarita yo'q joylarda ko'rinadi). */
export function fonRangi(qorongi: boolean): number[] {
  return qorongi ? [13, 21, 34, 1] : [227, 232, 239, 1];
}
