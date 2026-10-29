/**
 * WGS84 (EPSG:4326) ↔ UTM 42N (EPSG:32642) — UN_Dvigatel dagi pyproj o'rniga.
 *
 * Dvigatel tolerans va uzunliklarni metrda hisoblaydi (graf.TOLERANS = 2.83 mm), shuning uchun koordinatalar
 * avval UTM ga o'tkaziladi. Krüger qatori (6-tartib) — zona ichida xatosi mikrometrdan kichik.
 */
const A_ = 6378137;
const F_ = 1 / 298.257223563;
const K0 = 0.9996;
const FE = 500000;
const LON0 = (69 * Math.PI) / 180;

const N = F_ / (2 - F_);
const N2 = N * N, N3 = N2 * N, N4 = N3 * N, N5 = N4 * N, N6 = N5 * N;
const E = Math.sqrt(F_ * (2 - F_));
const AA = (A_ / (1 + N)) * (1 + N2 / 4 + N4 / 64 + N6 / 256);

const ALFA = [
  N / 2 - (2 * N2) / 3 + (5 * N3) / 16 + (41 * N4) / 180 - (127 * N5) / 288 + (7891 * N6) / 37800,
  (13 * N2) / 48 - (3 * N3) / 5 + (557 * N4) / 1440 + (281 * N5) / 630 - (1983433 * N6) / 1935360,
  (61 * N3) / 240 - (103 * N4) / 140 + (15061 * N5) / 26880 + (167603 * N6) / 181440,
  (49561 * N4) / 161280 - (179 * N5) / 168 + (6601661 * N6) / 7257600,
  (34729 * N5) / 80640 - (3418889 * N6) / 1995840,
  (212378941 * N6) / 319334400,
];
const BETA = [
  N / 2 - (2 * N2) / 3 + (37 * N3) / 96 - N4 / 360 - (81 * N5) / 512 + (96199 * N6) / 604800,
  N2 / 48 + N3 / 15 - (437 * N4) / 1440 + (46 * N5) / 105 - (1118711 * N6) / 3870720,
  (17 * N3) / 480 - (37 * N4) / 840 - (209 * N5) / 4480 + (5569 * N6) / 90720,
  (4397 * N4) / 161280 - (11 * N5) / 504 - (830251 * N6) / 7257600,
  (4583 * N5) / 161280 - (108847 * N6) / 3991680,
  (20648693 * N6) / 638668800,
];
const DELTA = [
  2 * N - (2 * N2) / 3 - 2 * N3 + (116 * N4) / 45 + (26 * N5) / 45 - (2854 * N6) / 675,
  (7 * N2) / 3 - (8 * N3) / 5 - (227 * N4) / 45 + (2704 * N5) / 315 + (2323 * N6) / 945,
  (56 * N3) / 15 - (136 * N4) / 35 - (1262 * N5) / 105 + (73814 * N6) / 2835,
  (4279 * N4) / 630 - (332 * N5) / 35 - (399572 * N6) / 14175,
  (4174 * N5) / 315 - (144838 * N6) / 6237,
  (601676 * N6) / 22275,
];

/** [lon, lat] (gradus) → [x, y] (UTM 42N, metr). */
export function utmga(lon: number, lat: number): [number, number] {
  const fi = (lat * Math.PI) / 180;
  const l = (lon * Math.PI) / 180 - LON0;
  const s = Math.sin(fi);
  const t = Math.sinh(Math.atanh(s) - E * Math.atanh(E * s));
  const xi1 = Math.atan2(t, Math.cos(l));
  const eta1 = Math.atanh(Math.sin(l) / Math.sqrt(1 + t * t));
  let xi = xi1, eta = eta1;
  for (let j = 1; j <= 6; j++) {
    xi += ALFA[j - 1] * Math.sin(2 * j * xi1) * Math.cosh(2 * j * eta1);
    eta += ALFA[j - 1] * Math.cos(2 * j * xi1) * Math.sinh(2 * j * eta1);
  }
  return [FE + K0 * AA * eta, K0 * AA * xi];
}

/** [x, y] (UTM 42N) → [lon, lat] (gradus). */
export function wgsga(x: number, y: number): [number, number] {
  const xi = y / (K0 * AA);
  const eta = (x - FE) / (K0 * AA);
  let xi1 = xi, eta1 = eta;
  for (let j = 1; j <= 6; j++) {
    xi1 -= BETA[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
    eta1 -= BETA[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
  }
  const chi = Math.asin(Math.sin(xi1) / Math.cosh(eta1));
  let fi = chi;
  for (let j = 1; j <= 6; j++) fi += DELTA[j - 1] * Math.sin(2 * j * chi);
  const l = LON0 + Math.atan2(Math.sinh(eta1), Math.cos(xi1));
  return [(l * 180) / Math.PI, (fi * 180) / Math.PI];
}
