import { type ImmutableObject } from "jimu-core";

/** Widget roli — tahrir/admin tugmalarini ko'rsatish uchun. */
export type UnElektrRole = "koruvchi" | "muharrir" | "admin";

export interface Config {
  title?: string;
  /** Tahrir tarixi jadvali (Feature Service table URL). Bo'sh — tarix brauzerda saqlanadi. */
  tarixJadvalUrl?: string;
  /** Map ichidagi liniya qatlami nomi (bo'sh = avto). */
  lineLayerTitle?: string;
  /** Map ichidagi qurilma qatlami nomi (bo'sh = avto). */
  deviceLayerTitle?: string;
  /** UI roli (Portal mapping keyinchalik). */
  role?: UnElektrRole;
  /** URL bo'lmasa ichki xarita shu WebMap dan ochiladi (Utility Network). */
  webMapItemId?: string;
  portalUrl?: string;
  /** Boshlang'ich til (foydalanuvchi tanlovi brauzerda eslab qolinadi). */
  til?: "uz" | "kr" | "ru";
  /** Boshlang'ich mavzu: kunduzgi, tungi yoki tizimga moslash. */
  mavzu?: "light" | "dark" | "auto";
}

export type IMConfig = ImmutableObject<Config>;

export const DEFAULT_TITLE = "Elektr tarmog'i";
export const DEFAULT_ROLE: UnElektrRole = "muharrir";
/** ElektrTarmogiV5 bilan bir xil UN web map (fallback). */
export const DEFAULT_PORTAL_URL = "https://sgm.uzspace.uz/portal";
export const DEFAULT_WEBMAP_ITEM_ID = "12f4ad92bc51435b96a82b929954de4d";

export function readConfig(config: any): Required<Config> {
  const get = (key: string) =>
    typeof config?.get === "function" ? config.get(key) : config?.[key];
  const role = (get("role") || DEFAULT_ROLE) as UnElektrRole;
  return {
    title: String(get("title") || DEFAULT_TITLE),
    tarixJadvalUrl: String(get("tarixJadvalUrl") || "").trim().replace(/\/$/, ""),
    lineLayerTitle: String(get("lineLayerTitle") || ""),
    deviceLayerTitle: String(get("deviceLayerTitle") || ""),
    role:
      role === "koruvchi" || role === "muharrir" || role === "admin"
        ? role
        : DEFAULT_ROLE,
    webMapItemId: String(get("webMapItemId") || DEFAULT_WEBMAP_ITEM_ID),
    portalUrl: String(get("portalUrl") || DEFAULT_PORTAL_URL).replace(/\/$/, ""),
    til: (["uz", "kr", "ru"].includes(get("til")) ? get("til") : "uz") as Config["til"],
    mavzu: (["light", "dark", "auto"].includes(get("mavzu")) ? get("mavzu") : "auto") as Config["mavzu"],
  };

}
