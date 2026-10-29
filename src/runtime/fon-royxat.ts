/**
 * Fon xaritalar katalogi (faqat ma'lumot — ArcGIS modullarisiz, tasma va sozlamalar ham ishlatadi).
 * Hammasi API kalitsiz ishlaydi (brauzerda tekshirilgan): Esri ochiq xizmatlari (services.arcgisonline.com),
 * OpenStreetMap va uning hamjamiyat serverlari, OpenTopoMap. CARTO endi kalit talab qiladi — ishlatilmaydi.
 */
export type Fon =
  | "osm" | "osmfr" | "hot" | "cyclosm" | "kocha-esri" | "topo" | "opentopo"
  | "sputnik" | "gibrid"
  | "kulrang" | "qorongi"
  | "yoq";

export type FonGuruh = "Ko'cha xaritalari" | "Sun'iy yo'ldosh" | "Tahlil uchun" | "Boshqa";

export interface FonQatlam {
  /** "tile" — ArcGIS MapServer (TileLayer), "web" — {level}/{col}/{row} andozasi (WebTileLayer). */
  tur: "tile" | "web";
  url: string;
  sub?: string[];
  copyright?: string;
}

export interface FonTuri {
  id: Fon;
  nomi: string;
  /** Qisqa izoh (ro'yxatda nomi ostida). */
  izoh: string;
  guruh: FonGuruh;
  /** Qorong'i fon — tun rejimiga mos. */
  qorongi?: boolean;
  qatlamlar: FonQatlam[];
}

const ESRI = "https://services.arcgisonline.com/ArcGIS/rest/services/";
const OSM_C = "© OpenStreetMap contributors";

export const FONLAR: FonTuri[] = [
  { id: "osm", nomi: "OpenStreetMap", izoh: "Standart ko'cha xaritasi", guruh: "Ko'cha xaritalari",
    qatlamlar: [{ tur: "web", url: "https://tile.openstreetmap.org/{level}/{col}/{row}.png", copyright: OSM_C }] },
  { id: "osmfr", nomi: "OSM batafsil", izoh: "Ko'proq nom va yorliqlar", guruh: "Ko'cha xaritalari",
    qatlamlar: [{ tur: "web", url: "https://{subDomain}.tile.openstreetmap.fr/osmfr/{level}/{col}/{row}.png", sub: ["a", "b", "c"], copyright: OSM_C + ", OSM France" }] },
  { id: "hot", nomi: "OSM gumanitar", izoh: "Yumshoq ranglar, binolar", guruh: "Ko'cha xaritalari",
    qatlamlar: [{ tur: "web", url: "https://{subDomain}.tile.openstreetmap.fr/hot/{level}/{col}/{row}.png", sub: ["a", "b", "c"], copyright: OSM_C + ", HOT" }] },
  { id: "cyclosm", nomi: "CycloSM", izoh: "Yo'llar va transport", guruh: "Ko'cha xaritalari",
    qatlamlar: [{ tur: "web", url: "https://{subDomain}.tile-cyclosm.openstreetmap.fr/cyclosm/{level}/{col}/{row}.png", sub: ["a", "b", "c"], copyright: OSM_C + ", CycloSM" }] },
  { id: "kocha-esri", nomi: "Esri ko'cha xaritasi", izoh: "Ko'chalar va manzillar", guruh: "Ko'cha xaritalari",
    qatlamlar: [{ tur: "tile", url: ESRI + "World_Street_Map/MapServer" }] },
  { id: "topo", nomi: "Topografik xarita", izoh: "Esri topografik", guruh: "Ko'cha xaritalari",
    qatlamlar: [{ tur: "tile", url: ESRI + "World_Topo_Map/MapServer" }] },
  { id: "opentopo", nomi: "Relyef", izoh: "OpenTopoMap, balandlik chiziqlari", guruh: "Ko'cha xaritalari",
    qatlamlar: [{ tur: "web", url: "https://{subDomain}.tile.opentopomap.org/{level}/{col}/{row}.png", sub: ["a", "b", "c"],
      copyright: OSM_C + ", SRTM | © OpenTopoMap" }] },
  { id: "sputnik", nomi: "Sun'iy yo'ldosh", izoh: "Esri World Imagery", guruh: "Sun'iy yo'ldosh",
    qatlamlar: [{ tur: "tile", url: ESRI + "World_Imagery/MapServer" }] },
  { id: "gibrid", nomi: "Sun'iy yo'ldosh + nomlar", izoh: "Tasvir ustida joy nomlari", guruh: "Sun'iy yo'ldosh", qatlamlar: [
    { tur: "tile", url: ESRI + "World_Imagery/MapServer" },
    { tur: "tile", url: ESRI + "Reference/World_Boundaries_and_Places/MapServer" },
  ] },
  { id: "kulrang", nomi: "Och kulrang", izoh: "Tarmoq yaqqol ko'rinadi", guruh: "Tahlil uchun", qatlamlar: [
    { tur: "tile", url: ESRI + "Canvas/World_Light_Gray_Base/MapServer" },
    { tur: "tile", url: ESRI + "Canvas/World_Light_Gray_Reference/MapServer" },
  ] },
  { id: "qorongi", nomi: "To'q kulrang", izoh: "Tun rejimi uchun", guruh: "Tahlil uchun", qorongi: true, qatlamlar: [
    { tur: "tile", url: ESRI + "Canvas/World_Dark_Gray_Base/MapServer" },
    { tur: "tile", url: ESRI + "Canvas/World_Dark_Gray_Reference/MapServer" },
  ] },
  { id: "yoq", nomi: "Fonsiz", izoh: "Faqat tarmoq", guruh: "Boshqa", qatlamlar: [] },
];

export const FON_GURUHLARI: FonGuruh[] = ["Ko'cha xaritalari", "Sun'iy yo'ldosh", "Tahlil uchun", "Boshqa"];

export function fonTuri(id: string): FonTuri | undefined {
  return FONLAR.find((f) => f.id === id);
}

// Ko'rinish rasmi: Toshkent markazi (z=13) plitkasi
const RASM = { z: 13, x: 5672, y: 3061 };

/** Fon xaritaning kichik ko'rinish rasmi (bir yoki bir nechta ustma-ust plitka URL). */
export function fonRasmi(f: FonTuri): string[] {
  const { z, x, y } = RASM;
  return f.qatlamlar.map((q) => (q.tur === "tile"
    ? `${q.url}/tile/${z}/${y}/${x}`
    : q.url.replace("{subDomain}", (q.sub || ["a"])[0]).replace("{level}", String(z)).replace("{col}", String(x)).replace("{row}", String(y))));
}

// Mavzu almashganda fon ham mos juftiga o'tadi (faqat juftligi bor fonlar)
const TUNGA: Partial<Record<Fon, Fon>> = { osm: "qorongi", osmfr: "qorongi", hot: "qorongi", kulrang: "qorongi" };
const KUNGA: Partial<Record<Fon, Fon>> = { qorongi: "osm" };

export function mavzugaMosFon(fon: Fon, qorongi: boolean): Fon {
  return (qorongi ? TUNGA[fon] : KUNGA[fon]) || fon;
}
