import { React } from "jimu-core";
import { KV_COLORS, KV_ORDER } from "../layers";
import Icon from "./Icon";
import { son, t, useTil } from "../i18n";

interface Props {
  lineVisible: Record<string, boolean>;
  deviceVisible: Record<string, boolean>;
  /** Kuchlanish ("10") yoki qurilma turi ("Podstansiya") → soni. */
  soni: Record<string, number>;
  onLineToggle: (kv: string, on: boolean) => void;
  onDeviceToggle: (tur: string, on: boolean) => void;
  onJadval: (filtr: "liniya" | "qurilma") => void;
  collapsed: boolean;
  onCollapse: (v: boolean) => void;
  /** Mahalliy (Feature Layerga yuborilmagan) o'zgarishlar bormi — shartli belgi izohi. */
  mahalliy: boolean;
}

const DEVICES = [
  { id: "Podstansiya", label: "Podstansiyalar", belgi: "ue-belgi-ps" },
  { id: "Transformator", label: "Transformator punktlari", belgi: "ue-belgi-tp" },
  { id: "Tashqi_manba", label: "Tashqi manbalar", belgi: "ue-belgi-tm" },
];

function Qator(props: { on: boolean; onChange: (v: boolean) => void; belgi: React.ReactNode; nomi: string; soni: string }) {
  return (
    <label className={`ue-qatlam${props.on ? "" : " ochiq"}`}>
      <span className="ue-cb">
        <input type="checkbox" checked={props.on} onChange={(e) => props.onChange(e.target.checked)} />
        <span />
      </span>
      {props.belgi}
      <span className="nomi">{props.nomi}</span>
      <span className="ue-soni">{props.soni}</span>
    </label>
  );
}

export default function ContentsPanel(props: Props): React.ReactElement {
  useTil();
  const yigilgan = props.collapsed;
  const jBtn = (f: "liniya" | "qurilma") => (
    <button type="button" className="ue-jadval-btn" title={t("Atribut jadvalini ochish")} onClick={() => props.onJadval(f)}>
      <Icon n="table" size={13} />{t("Jadval")}
    </button>
  );
  // Panel doim chiziladi: yig'ilganda kengligi silliq kichrayadi, ichidagi ro'yxat o'rniga tor tasma ko'rinadi
  return (
    <aside className={`ue-contents${yigilgan ? " yigilgan" : ""}`}>
      <div className="ue-side-rail" aria-hidden={!yigilgan}>
        <button type="button" className="ue-icon-btn" tabIndex={yigilgan ? 0 : -1} onClick={() => props.onCollapse(false)} title={t("Qatlamlar panelini ochish")}>
          <Icon n="layers" size={18} />
        </button>
        <button type="button" className="ue-icon-btn" tabIndex={yigilgan ? 0 : -1} onClick={() => props.onCollapse(false)} title={t("Qatlamlar panelini ochish")}>
          <Icon n="right" size={16} />
        </button>
      </div>
      <div className="ue-contents-ichki" aria-hidden={yigilgan}>
        <div className="ue-panel-head">
          <Icon n="layers" size={17} />
          <span>{t("Qatlamlar")}</span>
          <button type="button" className="ue-icon-btn" title={t("Yig'ish")} onClick={() => props.onCollapse(true)}>
            <Icon n="left" size={16} />
          </button>
        </div>
        <div className="ue-panel-body">
          <div className="ue-section">
            <div className="ue-section-title">{t("Elektr liniyalari")} {jBtn("liniya")}</div>
            {KV_ORDER.map((kv) => {
              const k = String(kv);
              return (
                <Qator key={k} on={props.lineVisible[k] !== false} onChange={(v) => props.onLineToggle(k, v)}
                  belgi={<span className="ue-swatch" style={{ background: KV_COLORS[k] || "#888" }} />}
                  nomi={t("{kv} kV liniyalar", { kv: k.replace(".", ",") })} soni={son(props.soni[k])} />
              );
            })}
          </div>
          <div className="ue-section">
            <div className="ue-section-title">{t("Qurilmalar")} {jBtn("qurilma")}</div>
            {DEVICES.map((d) => (
              <Qator key={d.id} on={props.deviceVisible[d.id] !== false} onChange={(v) => props.onDeviceToggle(d.id, v)}
                belgi={<span className={`ue-belgi ${d.belgi}`} />} nomi={t(d.label)} soni={son(props.soni[d.id])} />
            ))}
          </div>
          {props.mahalliy && (
            <div className="ue-legend-izoh">
              <div><span className="ue-legend-chiziq" />{t("Uzuq chiziq — mahalliy o'zgarish")}</div>
              <div style={{ color: "var(--warning)" }}><Icon n="upload" size={14} />{t("Feature Layerga hali yuborilmagan")}</div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
