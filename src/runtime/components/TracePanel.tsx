import { React } from "jimu-core";
import Icon from "./Icon";
import Tanlov from "./Tanlov";
import { son, t, tx, useTil } from "../i18n";

export const TRACE_TYPES = [
  { id: "downstream", label: "Downstream" },
  { id: "upstream", label: "Upstream" },
  { id: "subnetwork", label: "Subnetwork" },
  { id: "subnetwork_controllers", label: "Subnetwork Controllers" },
  { id: "connected", label: "Connected" },
  { id: "loops", label: "Loops" },
  { id: "shortest_path", label: "Shortest Path" },
  { id: "isolation", label: "Isolation" },
];

// UN_Dvigatel ilova.js dagi tavsiflar
const TAVSIF: Record<string, string> = {
  downstream: "Nuqtadan keyin ta'minlanadigan hamma narsa: shu joy o'chsa, nima tokdan qoladi.",
  upstream: "Nuqtadan manbagacha bo'lgan yo'l: tok qayerdan keladi.",
  subnetwork: "Nuqta joylashgan butun zona: bitta podstansiya yoki guruh ta'minlaydigan hudud.",
  subnetwork_controllers: "Nuqtani ta'minlayotgan podstansiya yoki manbalar.",
  connected: "Nuqtaga tegib turgan hamma narsa, yo'nalish va kuchlanishga qaramasdan.",
  loops: "Nuqta joylashgan tarmoqdagi halqalar.",
  shortest_path: "Ikki nuqta orasidagi eng qisqa yo'l. Yo'l oxirini ham belgilang.",
  isolation: "Nuqtani o'chirish uchun yopiladigan viklyuchatellar va tokdan qoladigan hudud.",
};

// ro'yxatdagi qisqa izoh va piktogramma
const QISQA: Record<string, string> = {
  downstream: "Nuqtadan keyingi iste'molchilar",
  upstream: "Manbagacha bo'lgan yo'l",
  subnetwork: "Butun ta'minot zonasi",
  subnetwork_controllers: "Ta'minlovchi podstansiyalar",
  connected: "Tegib turgan hamma narsa",
  loops: "Tarmoqdagi halqalar",
  shortest_path: "Ikki nuqta orasidagi yo'l",
  isolation: "O'chirish uchun viklyuchatellar",
};
const TRACE_IC: Record<string, string> = {
  downstream: "down", upstream: "upload", subnetwork: "layers", subnetwork_controllers: "server",
  connected: "network", loops: "refresh", shortest_path: "pin", isolation: "ban",
};

export type Rol = "bosh" | "tosiq" | "gacha";

export interface TraceNatija {
  liniyalar: number;
  tp: number;
  ps: number;
  izoh?: string;
}

interface Props {
  turi: string;
  onTuri: (v: string) => void;
  nuqtalar: Record<Rol, string[]>;
  /** GLOBALID → [nomi, kuchlanish matni] */
  tavsifla: (gid: string) => [string, string];
  tierOshib: boolean;
  onTierOshib: (v: boolean) => void;
  onRemove: (rol: Rol, gid: string) => void;
  onRun: () => void;
  running: boolean;
  natija: TraceNatija | null;
}

const ROL: Record<Rol, { nomi: string; rang: string; bosh: string }> = {
  bosh: { nomi: "Boshlang'ich nuqtalar", rang: "var(--success)", bosh: "Xaritada obyektni tanlang va «Boshlang'ich nuqta» tugmasini bosing." },
  tosiq: { nomi: "To'siqlar", rang: "var(--danger)", bosh: "To'siq belgilanmagan" },
  gacha: { nomi: "Yo'l oxiri", rang: "var(--violet)", bosh: "Yo'l oxiri belgilanmagan" },
};

function Royxat(props: { rol: Rol; items: string[]; tavsifla: Props["tavsifla"]; onRemove: Props["onRemove"] }) {
  const r = ROL[props.rol];
  return (
    <div className="ue-blok">
      <div className="ue-blok-nomi">
        <span className="ue-rol-nuqta" style={{ background: r.rang }} />
        {t(r.nomi)}
        {props.items.length > 0 && <span className="soni">{props.items.length}</span>}
      </div>
      {!props.items.length ? <div className="ue-bosh-blok">{t(r.bosh)}</div> : (
        <div className="ue-nuqta-list">
          {props.items.map((g) => {
            const [nom, kv] = props.tavsifla(g);
            return (
              <div key={g} className={`ue-nuqta ${props.rol}-n`}>
                <span title={g}>{nom}</span>
                <span className="kv">{kv}</span>
                <button type="button" title={t("Olib tashlash")} onClick={() => props.onRemove(props.rol, g)}>
                  <Icon n="x" size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function TracePanel(props: Props): React.ReactElement {
  useTil();
  const x = props.natija;
  return (
    <div className="ue-trace-panel">
      <div className="ue-field">
        {t("Trace turi")}
        <Tanlov className="forma" ic="activity" title={t("Trace turi")} qiymat={props.turi} onChange={props.onTuri}
          variantlar={TRACE_TYPES.map((tt) => ({ id: tt.id, nomi: tt.label, izoh: t(QISQA[tt.id]), ic: TRACE_IC[tt.id] }))} />
      </div>
      <p className="ue-tavsif"><Icon n="info" size={15} /><span>{t(TAVSIF[props.turi] || "")}</span></p>
      <Royxat rol="bosh" items={props.nuqtalar.bosh} tavsifla={props.tavsifla} onRemove={props.onRemove} />
      <Royxat rol="tosiq" items={props.nuqtalar.tosiq} tavsifla={props.tavsifla} onRemove={props.onRemove} />
      {props.turi === "shortest_path" && (
        <Royxat rol="gacha" items={props.nuqtalar.gacha} tavsifla={props.tavsifla} onRemove={props.onRemove} />
      )}
      <label className="ue-switch" style={{ whiteSpace: "normal", margin: "4px 0" }}>
        <input type="checkbox" checked={props.tierOshib} onChange={(e) => props.onTierOshib(e.target.checked)} />
        <span className="iz" />
        <span>{t("Podstansiyadan o'tib boshqa kuchlanishga davom etsin")}</span>
      </label>
      <button type="button" className="ue-btn primary wide" disabled={props.running} onClick={props.onRun}>
        {props.running ? <><span className="ue-spin" />{t("Bajarilmoqda…")}</> : <><Icon n="play" size={15} />{t("Trace'ni bajarish")}</>}
      </button>
      {x && (
        <div className="ue-natija">
          <div className="ue-natija-sarlavha"><Icon n="check" size={17} />{t("Natija")}</div>
          <div className="ue-natija-raqamlar">
            <div><b>{son(x.liniyalar)}</b>{t("liniya")}</div>
            <div><b>{son(x.tp)}</b>TP</div>
            <div><b>{son(x.ps)}</b>{t("podstansiya")}</div>
          </div>
          {x.izoh && <div className="ue-izoh">{tx(x.izoh)}</div>}
          <div className="ue-izoh">{t("Natija xaritada tanlangan. Ro'yxati pastdagi atribut jadvalida.")}</div>
        </div>
      )}
    </div>
  );
}
