import { React } from "jimu-core";
import Icon from "./Icon";
import Tanlov from "./Tanlov";
import { TILLAR, t, useTil, type Mavzu, type Til } from "../i18n";

export type MainTab = "xarita" | "un" | "tahrir" | "tekshiruv";

export interface SearchHit {
  id: string;
  nomi: string;
  izoh: string;
  liniya: boolean;
}

interface Props {
  title: string;
  tab: MainTab;
  onTab: (t: MainTab) => void;
  search: string;
  onSearch: (v: string) => void;
  searchHits: SearchHit[] | null;
  onSearchPick: (id: string) => void;
  userName: string;
  roleLabel: string;
  canEdit: boolean;
  til: Til;
  onTil: (t: Til) => void;
  mavzu: Mavzu;
  onMavzu: (m: Mavzu) => void;
}

const MAVZULAR: Array<{ id: Mavzu; ic: string; nomi: string; izoh: string }> = [
  { id: "light", ic: "sun", nomi: "Kunduzgi", izoh: "Yorug' ranglar" },
  { id: "dark", ic: "moon", nomi: "Tungi", izoh: "Qorong'i ranglar" },
  { id: "auto", ic: "monitor", nomi: "Tizimga moslash", izoh: "Kompyuter sozlamasiga qarab" },
];

export default function HeaderTabs(props: Props): React.ReactElement {
  useTil();
  const tabs: { id: MainTab; label: string; ic: string; hide?: boolean }[] = [
    { id: "xarita", label: t("Xarita"), ic: "map" },
    { id: "un", label: "Utility Network", ic: "network" },
    { id: "tahrir", label: t("Tahrir"), ic: "edit", hide: !props.canEdit },
    { id: "tekshiruv", label: t("Tekshiruv"), ic: "shield" },
  ];
  const soz = String(props.userName || "?").trim().split(/\s+/).filter(Boolean);
  const avatar = (soz.length > 1 ? soz[0][0] + soz[1][0] : (soz[0] || "?").slice(0, 2)).toUpperCase();

  return (
    <header className="ue-header">
      <div className="ue-brand">
        <span className="ue-logo" aria-hidden><Icon n="bolt" size={19} stroke={1.6} /></span>
        <span className="ue-brand-matn">
          <b>{props.title}</b>
          <span>{t("Elektr tarmog'i boshqaruvi")}</span>
        </span>
      </div>
      <nav className="ue-tabs" role="tablist">
        {tabs.filter((x) => !x.hide).map((x) => (
          <button key={x.id} type="button" role="tab" aria-selected={props.tab === x.id} title={x.label}
            className={props.tab === x.id ? "faol" : ""} onClick={() => props.onTab(x.id)}>
            <Icon n={x.ic} size={16} />
            <span>{x.label}</span>
          </button>
        ))}
      </nav>
      <div className="ue-search">
        <Icon n="search" size={16} />
        <input type="search" placeholder={t("Qidirish: nomi yoki GLOBALID")} autoComplete="off"
          value={props.search} onChange={(e) => props.onSearch(e.target.value)} />
        {props.searchHits && (
          <ul className="ue-search-hits">
            {props.searchHits.map((h) => (
              <li key={h.id}>
                <button type="button" onClick={() => props.onSearchPick(h.id)}>
                  <span className="ue-hit-ic"><Icon n={h.liniya ? "line" : "device"} size={15} /></span>
                  <span className="nom">{h.nomi}</span>
                  <span className="ue-yorliq">{h.izoh}</span>
                </button>
              </li>
            ))}
            {!props.searchHits.length && <li className="ue-yorliq bosh">{t("Hech narsa topilmadi")}</li>}
          </ul>
        )}
      </div>
      <div className="ue-tools">
        <Tanlov title={t("Til")} ic="globe" className="til" kenglik={200} qiymat={props.til} onChange={(id) => props.onTil(id as Til)}
          qisqa={(v) => TILLAR.find((x) => x.id === v.id)?.qisqa || v.nomi}
          variantlar={TILLAR.map((x) => ({ id: x.id, nomi: x.qisqa, izoh: `${x.nomi} · ${t(x.izoh)}` }))} />
        <Tanlov title={t("Mavzu")} className="mavzu" kenglik={200} qiymat={props.mavzu} onChange={(id) => props.onMavzu(id as Mavzu)}
          variantlar={MAVZULAR.map((x) => ({ id: x.id, nomi: t(x.nomi), izoh: t(x.izoh), ic: x.ic }))} />
      </div>
      <div className="ue-user" title={`${props.userName} — ${props.roleLabel}`}>
        <span className="ue-avatar">{avatar}</span>
        <span className="ue-men-matn"><span>{props.userName}</span><span>{props.roleLabel}</span></span>
      </div>
    </header>
  );
}
