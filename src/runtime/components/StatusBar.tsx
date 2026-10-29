import { React } from "jimu-core";
import Icon from "./Icon";
import { t, useTil } from "../i18n";

interface Props {
  server: string;
  serverOk: boolean | null;
  /** Feature Layerga yuborilmagan (mahalliy) o'zgarishlar soni. */
  kutilayotgan: number;
  selectionCount: number;
  coords: string;
  scale: number;
  message: string;
  isError: boolean;
}

export default function StatusBar(props: Props): React.ReactElement {
  useTil();
  return (
    <>
      <footer className="ue-status">
        <span className={props.serverOk === true ? "ok" : props.serverOk === false ? "yoq" : ""}>
          <span className="nuqta" />{props.server}
        </span>
        {props.kutilayotgan > 0 && (
          <span className="kut"><Icon n="upload" size={13} />{t("{n} ta o'zgarish Feature Layerga yuborilmagan", { n: props.kutilayotgan })}</span>
        )}
        <span><Icon n="pointer" size={13} />{t("Tanlangan: {n}", { n: props.selectionCount })}</span>
        <span className="ue-flex" />
        {props.coords && <span className="mono">{props.coords}</span>}
        {props.scale > 0 && <span>{t("Masshtab")} 1:{Math.round(props.scale).toLocaleString("ru-RU")}</span>}
      </footer>
      {props.message && (
        <div className={`ue-toast ${props.isError ? "xato" : ""}`} role="status">
          <Icon n={props.isError ? "alert" : "check"} size={17} />
          <span>{props.message}</span>
        </div>
      )}
    </>
  );
}
