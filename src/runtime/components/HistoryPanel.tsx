import { React } from "jimu-core";
import Icon from "./Icon";
import { t, tx, useTil } from "../i18n";

export interface HistoryItem {
  id?: number;
  guruh?: number;
  vaqt?: string;
  foydalanuvchi?: string;
  amal?: string;
  qatlam?: string;
  globalid?: string;
  nomi?: string;
  maydon?: string;
  eski?: string | null;
  yangi?: string | null;
  bekor?: number;
  /** 1 — Feature Layerga hali yozilmagan (mahalliy saqlangan). */
  mahalliy?: number;
}

interface Props {
  items: HistoryItem[];
  loading: boolean;
  xato: string;
  onUndo: () => void;
  onPick: (gid: string) => void;
  canEdit: boolean;
}

// ilova.js tarixniKorsat() dagi matnlar
const NOM: Record<string, string> = {
  atribut: "Atribut o'zgardi", qirqish: "Liniya qirqildi", qurilma: "Qurilma qo'yildi", liniya: "Liniya chizildi",
  kochirish: "Qurilma ko'chirildi", geometriya: "Liniya shakli o'zgardi", ochirish: "O'chirildi",
};
const ORTGA: Record<string, string> = {
  atribut: "Ortga qaytarildi", qirqish: "Qirqish ortga qaytarildi", qurilma: "Qurilma olib tashlandi (ortga)",
  liniya: "Liniya olib tashlandi (ortga)", kochirish: "Ko'chirish ortga qaytarildi",
  geometriya: "Liniya shakli tiklandi (ortga)", ochirish: "O'chirilganlar tiklandi (ortga)",
};
const IC: Record<string, string> = {
  atribut: "form", qirqish: "scissors", qurilma: "device", liniya: "line", kochirish: "move", geometriya: "move", ochirish: "trash",
};
const MAYDON_AMAL: Record<string, string> = {
  qirqish: "qirqish", "qo'yildi": "qurilma", chizildi: "liniya", "ko'chirildi": "kochirish",
  shakli: "geometriya", "o'chirildi": "ochirish",
};

export default function HistoryPanel(props: Props): React.ReactElement {
  useTil();
  const guruhlar = new Map<number, HistoryItem[]>();
  for (const r of props.items) {
    const k = r.guruh ?? r.id ?? 0;
    if (!guruhlar.has(k)) guruhlar.set(k, []);
    guruhlar.get(k).push(r);
  }
  return (
    <div className="ue-tarix">
      <div className="ue-tarix-bosh">
        <span className="ue-blok-nomi katta"><Icon n="clock" size={16} />{t("O'zgarishlar tarixi")}</span>
        {props.canEdit && (
          <button type="button" className="ue-btn kichik" title={t("Oxirgi saqlashni bekor qilish")} onClick={props.onUndo}>
            <Icon n="undo" size={14} />{t("Ortga qaytarish")}
          </button>
        )}
      </div>
      {props.loading && <p className="ue-muted"><span className="ue-spin" style={{ display: "inline-block", marginRight: 8 }} />{t("Yuklanmoqda…")}</p>}
      {!props.loading && props.xato && <p className="ue-muted">{t("Tarixni olib bo'lmadi:")} {tx(props.xato)}</p>}
      {!props.loading && !props.xato && props.items.length === 0 && (
        <div className="ue-bosh-holat">
          <span className="ic"><Icon n="clock" size={24} /></span>
          <b>{t("Hali hech narsa o'zgartirilmagan")}</b>
          <span>{t("Saqlangan har bir tahrir shu yerda ko'rinadi.")}</span>
        </div>
      )}
      <div className="ue-tarix-list">
        {[...guruhlar.entries()].map(([k, g]) => {
          const r = g[0];
          const ortga = r.amal === "ortga";
          const nima = ortga ? MAYDON_AMAL[r.maydon || ""] || "atribut" : r.amal || "";
          const holat = ortga ? t(ORTGA[nima]) : t(NOM[nima] || nima);
          const mahalliy = !!r.mahalliy && !r.bekor;
          return (
            <div key={k} className={`ue-tarix-guruh ${ortga ? "ortga" : r.bekor ? "bekor" : mahalliy ? "mahalliy" : ""}`}
              onClick={() => r.globalid && props.onPick(r.globalid)}>
              <div className="ue-tarix-yuqori">
                <Icon n={ortga ? "undo" : IC[nima] || "edit"} size={14} />
                <span className="amal">{holat}</span>
                {!!r.bekor && !ortga && <span className="ue-tag">{t("bekor qilingan")}</span>}
                {mahalliy && <span className="ue-tag mahalliy" title={t("Feature Layerga hali yuborilmagan")}>{t("mahalliy")}</span>}
                <span className="ue-tarix-vaqt">{r.vaqt}</span>
              </div>
              <div className="nom">
                {r.nomi || t("(nomsiz)")} <span className="ue-muted">· {r.qatlam === "liniya" ? t("liniya") : t("qurilma")}</span>
              </div>
              {g.map((x, i) =>
                x.eski == null && x.amal !== "atribut" ? (
                  <div key={i} className="q"><ins>{tx(x.yangi ?? "")}</ins></div>
                ) : x.yangi == null && x.amal !== "atribut" ? (
                  <div key={i} className="q"><s>{tx(x.eski)}</s></div>
                ) : (
                  <div key={i} className="q">
                    {x.maydon}: <s>{x.eski ?? t("bo'sh")}</s> → <ins>{x.yangi ?? t("bo'sh")}</ins>
                  </div>
                ),
              )}
              <div className="ue-tarix-kim"><Icon n="user" size={12} />{r.foydalanuvchi}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
