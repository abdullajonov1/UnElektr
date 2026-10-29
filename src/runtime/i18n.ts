/**
 * Tillar: o'zbek (lotin) — asl matn, o'zbek (kirill) — lotindan avtomatik o'giriladi, rus — lug'at (tarjima-ru.ts).
 *
 *   t("Liniya chizish")                  — interfeys matni (kalit = o'zbekcha lotin matn)
 *   t("{n} ta obyekt o'chirildi", { n }) — o'zgaruvchili matn (o'zgaruvchilar o'girilmaydi: obyekt nomlari asl holida)
 *   tx(matn)                             — dvigateldan (UN_Dvigatel) kelgan matn: kirillga o'giriladi, ruschaga
 *                                          andozalar bo'yicha tarjima qilinadi
 */
import { React } from "jimu-core";
import { RU, RU_DVIGATEL, RU_SOZ } from "./tarjima-ru";

export type Til = "uz" | "kr" | "ru";
export type Mavzu = "light" | "dark" | "auto";

export const TILLAR: Array<{ id: Til; qisqa: string; nomi: string; izoh: string }> = [
  { id: "uz", qisqa: "UZ", nomi: "O'zbekcha", izoh: "Lotin yozuvi" },
  { id: "kr", qisqa: "KR", nomi: "Ўзбекча", izoh: "Kirill yozuvi" },
  { id: "ru", qisqa: "RU", nomi: "Русский", izoh: "Rus tili" },
];

let joriy: Til = "uz";

export function tilniOrnat(til: Til): void {
  joriy = til;
}

export function joriyTil(): Til {
  return joriy;
}

/** Komponentlar til almashganda qayta chizilishi uchun (qiymati — joriy til). */
export const TilContext = React.createContext<Til>("uz");

export function useTil(): Til {
  return React.useContext(TilContext);
}

/** Sonlar va sanalar uchun locale. */
export function locale(): string {
  return joriy === "ru" ? "ru-RU" : "uz-Latn-UZ";
}

export function son(n: number, kasr = 0): string {
  return Number(n || 0).toLocaleString("ru-RU", { maximumFractionDigits: kasr });
}

function qoy(matn: string, v?: Record<string, any>): string {
  if (!v) return matn;
  return matn.replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k] ?? "") : m));
}

const kesh: Record<Til, Map<string, string>> = { uz: new Map(), kr: new Map(), ru: new Map() };

export function t(matn: string, v?: Record<string, any>): string {
  if (joriy === "uz") return qoy(matn, v);
  let r = kesh[joriy].get(matn);
  if (r == null) {
    r = joriy === "ru" ? (RU[matn] ?? ruSozlar(matn)) : kirill(matn);
    kesh[joriy].set(matn, r);
  }
  return qoy(r, v);
}

/** Dvigateldan kelgan (o'zbekcha) matn. */
export function tx(matn: any): string {
  if (matn == null) return "";
  const s = String(matn);
  if (joriy === "uz" || !s) return s;
  if (joriy === "kr") return kirill(s);
  if (RU[s] != null) return RU[s];
  let r = s;

  for (const [re, yangi] of RU_DVIGATEL) r = r.replace(re, yangi as any);
  return ruSozlar(r);
}

/** Lug'atda bo'lmagan matnda alohida so'zlar (qurilma turlari, terminal nomlari va h.k.). */
function ruSozlar(s: string): string {
  let r = s;
  for (const [re, yangi] of RU_SOZ) r = r.replace(re, yangi);
  return r;
}

// ---------------------------------------------------------------- lotin → kirill
// O'girilmaydigan so'zlar (mahsulot nomlari, kodlar). Ulardan keyin o'zbekcha qo'shimcha kelsa — qo'shimcha o'giriladi.
const SAQLA = [
  "Feature", "Layer", "Utility", "Network", "Trace", "Downstream", "Upstream", "Subnetwork", "Controllers", "Connected",
  "subnetwork", "controller", "Dark", "Matter", "Positron", "Esri", "OpenTopoMap", "Loops", "Shortest", "Path", "Isolation", "UnElektr", "UN_Dvigatel", "WebMap", "Portal", "Select", "data", "Map",
  "Engine", "OpenStreetMap", "Esc", "Backspace", "Ctrl", "Shift", "Enter", "CSV", "GLOBALID", "OBJECTID", "Advanced",
  "Editing", "uvicorn", "server", "app", "sync", "reload", "ArcGIS", "Contents", "ID", "SubtypeGroup", "Pro",
  "End", "vertex", "applyEdits", "UN", "FIZ", "OGOH", "Organization", "Licenses", "Line", "Device", "Enable", "editing",
];
// Imlo istisnolari: o'zak → kirill (qo'shimchasi odatdagidek o'giriladi)
const ISTISNO: Array<[string, string]> = [["obyekt", "объект"], ["subyekt", "субъект"], ["proyekt", "проект"]];
const SAQLA_SET = new Set(SAQLA);
const KATTA_OGIR = new Set(["TP", "PS", "TETK", "AJ"]);

const HARF: Record<string, string> = {
  a: "а", b: "б", d: "д", e: "е", f: "ф", g: "г", h: "ҳ", i: "и", j: "ж", k: "к", l: "л", m: "м", n: "н", o: "о",
  p: "п", q: "қ", r: "р", s: "с", t: "т", u: "у", v: "в", x: "х", y: "й", z: "з", c: "к", w: "в",
};
const UNLI = /[aeiouаеиоуўэяюё]/i;
const TUTUQ = /['‘’ʻʼ`]/;

function harfKattami(c: string) {
  return c !== c.toLowerCase();
}

function soz(w: string): string {
  if (/^\d/.test(w)) return w;
  // kV, kVt, mm, km
  if (w === "kV") return "кВ";
  if (/[A-Z].*[A-Z]/.test(w) && w === w.toUpperCase()) {
    return KATTA_OGIR.has(w) ? [...w].map((c) => (HARF[c.toLowerCase()] || c).toUpperCase()).join("") : w;
  }
  if (/\d/.test(w) || /[a-z][A-Z]/.test(w)) return w;    // FIZ1, UnElektr
  if (SAQLA_SET.has(w)) return w;
  for (const [o, k] of ISTISNO) {
    if (w.toLowerCase().startsWith(o)) {
      const bosh = harfKattami(w[0]) ? k[0].toUpperCase() + k.slice(1) : k;
      return bosh + (w.length > o.length ? soz(w.slice(o.length)) : "");
    }
  }
  for (const p of SAQLA) {
    const q = w.slice(p.length);
    if (p.length > 2 && w.startsWith(p) && /^['’]?[a-z']+$/.test(q)) return p + (TUTUQ.test(q[0]) ? "'" : "") + soz(q.replace(/^['’]/, ""));
  }
  let out = "";
  const n = w.length;
  for (let i = 0; i < n; i++) {
    const c = w[i], lc = c.toLowerCase(), kat = harfKattami(c);
    const keyin = w[i + 1] || "", keyin2 = w[i + 2] || "";
    const K = (s: string) => (kat ? s.toUpperCase() : s);

    if (TUTUQ.test(c)) {
      out += "ъ";
      continue;
    }
    if ((lc === "o" || lc === "g") && TUTUQ.test(keyin)) {
      out += kat ? (lc === "o" ? "Ў" : "Ғ") : (lc === "o" ? "ў" : "ғ");
      i++;
      continue;
    }
    if (lc === "s" && keyin.toLowerCase() === "h") { out += K("ш"); i++; continue; }
    if (lc === "c" && keyin.toLowerCase() === "h") { out += K("ч"); i++; continue; }
    if (lc === "y") {
      const k = keyin.toLowerCase();
      // yo'l -> йўл (o' — alohida harf)
      if (k === "o" && !TUTUQ.test(keyin2)) { out += K("ё"); i++; continue; }
      if (k === "u") { out += K("ю"); i++; continue; }
      if (k === "a") { out += K("я"); i++; continue; }
      if (k === "e") { out += K("е"); i++; continue; }
    }
    // -tsiya / -nsiya / -ksiya (станция, изоляция, секция)
    if (lc === "t" && keyin.toLowerCase() === "s" && /^i[yo]/i.test(w.slice(i + 2))) { out += K("ц"); i++; continue; }
    if (lc === "s" && /[nk]/i.test(w[i - 1] || "") && /^iya/i.test(w.slice(i + 1))) { out += K("ц"); continue; }
    if (lc === "e") {
      const old = w[i - 1] || "";
      out += K(!old || UNLI.test(old) ? "э" : "е");
      continue;
    }
    const h = HARF[lc];
    out += h ? (kat ? h.toUpperCase() : h) : c;
  }
  return out;
}

const KR_KESH = new Map<string, string>();

/** O'zbek lotin matnini kirillga o'giradi. «…» ichidagi nomlar, {…} va GLOBALIDlar o'zgarmaydi. */
export function kirill(s: string): string {
  const k = KR_KESH.get(s);
  if (k != null) return k;
  const r = s.replace(/(\(Server: [^)]*\)|\{[^}]*\}|«[^»]*»|https?:\/\/\S+|\/[\w/]+|[A-Za-z][A-Za-z'‘’ʻʼ_]*[A-Za-z0-9_]|[A-Za-z][0-9]*)/g, (m) =>
    m[0] === "{" || m[0] === "«" || m[0] === "/" || m[0] === "(" || m.startsWith("http") ? m : soz(m));

  KR_KESH.set(s, r);
  return r;
}
