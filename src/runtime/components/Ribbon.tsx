import { React } from "jimu-core";
import type { MainTab } from "./HeaderTabs";
import Icon from "./Icon";
import { t, useTil } from "../i18n";

import { FONLAR, fonRasmi, type Fon } from "../fon-royxat";
import Tanlov from "./Tanlov";

export type { Fon };
export type Rejim = null | "liniya" | "qurilma" | "qirqish" | "kochirish";

interface Props {
  tab: MainTab;
  canEdit: boolean;
  rejim: Rejim;
  /** Feature Layerga hali yozilmagan (mahalliy) o'zgarishlar soni. */
  kutilayotgan: number;
  basemap: Fon;
  onBasemap: (v: Fon) => void;
  fiz1: boolean;
  ogoh2: boolean;
  onFiz1: (v: boolean) => void;
  onOgoh2: (v: boolean) => void;
  onAction: (action: string) => void;
}

// Tugmalar va guruhlar UN_Dvigatel ilova/index.html dagi tasma bilan bir xil
export default function Ribbon(props: Props): React.ReactElement {
  useTil();
  const btn = (action: string, ic: string, label: string, title: string,
    opts: { primary?: boolean; faol?: boolean; cls?: string } = {}) => (
    <button key={action} type="button" title={t(title)}
      className={`ue-rb${opts.primary ? " primary" : ""}${opts.faol ? " faol" : ""}${opts.cls ? " " + opts.cls : ""}`}
      onClick={() => props.onAction(action)}>
      <Icon n={ic} size={21} />
      <span>{label}</span>
    </button>
  );
  const guruh = (nomi: string, items: React.ReactNode, ustun = false, cls = "") => (
    <div className={`ue-group ${cls}`}>
      <div className={`ue-group-items${ustun ? " ustun" : ""}`}>{items}</div>
      <div className="ue-group-name">{nomi}</div>
    </div>
  );
  const kalit = (checked: boolean, on: (v: boolean) => void, matn: React.ReactNode) => (
    <label className="ue-switch">
      <input type="checkbox" checked={checked} onChange={(e) => on(e.target.checked)} />
      <span className="iz" />
      <span>{matn}</span>
    </label>
  );

  return (
    <div className="ue-ribbon">
      {props.tab === "xarita" && (
        <>
          {guruh(t("Navigatsiya"), <>
            {btn("fullExtent", "expand", t("To'liq ko'rinish"), "Butun tarmoqni ko'rsatish")}
            {btn("zoomSelection", "target", t("Tanlovga"), "Tanlangan obyektlarga yaqinlashish")}
          </>)}
          {guruh(t("Fon xarita"), (
            <Tanlov turi="rasmli" kenglik={452} className="fon" title={t("Fon xarita")} qiymat={props.basemap}
              onChange={(id) => props.onBasemap(id as Fon)}
              variantlar={FONLAR.map((f) => ({ id: f.id, nomi: t(f.nomi), izoh: t(f.izoh), guruh: t(f.guruh), rasm: fonRasmi(f), bosh: !f.qatlamlar.length }))} />
          ))}
          {guruh(t("Tanlov"), <>
            {btn("clearSelection", "eraser", t("Tozalash"), "Tanlovni bekor qilish")}
            {btn("toggleTable", "table", t("Atribut jadvali"), "Atribut jadvalini ochish/yopish")}
          </>)}
        </>
      )}

      {props.tab === "un" && (
        <>
          {guruh(t("Tahlil"), btn("openTrace", "activity", "Trace", "Trace panelini ochish", { primary: true }))}
          {guruh(t("Trace nuqtalari"), <>
            {btn("setStart", "flag", t("Boshlang'ich nuqta"), "Tanlangan obyektni boshlang'ich nuqta qilish")}
            {btn("setBarrier", "ban", t("To'siq"), "Tanlangan obyektni to'siq qilish")}
            {btn("setEnd", "pin", t("Yo'l oxiri"), "Shortest Path uchun yo'l oxiri")}
            {btn("clearTracePoints", "eraser", t("Tozalash"), "Barcha nuqta va natijalarni tozalash")}
          </>)}
          {guruh("Feature Layer",
            btn("syncEngine", "refresh", t("Yangilash"), "Feature Layerdagi oxirgi holatni dvigatelga qayta yuklash (boshqa foydalanuvchilar o'zgarishlari)"))}
        </>
      )}

      {props.tab === "tahrir" && props.canEdit && (
        <>
          {guruh(t("Yaratish"), <>
            {btn("liniya", "line", t("Liniya chizish"), "Yangi liniya chizish (ikki marta bosib tugatiladi, Esc — chiqish)",
              { primary: true, faol: props.rejim === "liniya" })}
            {btn("qurilma", "device", t("Qurilma qo'yish"), "Yangi TP yoki podstansiya qo'yish (Esc — tugatish)",
              { primary: true, faol: props.rejim === "qurilma" })}
          </>)}
          {guruh(t("O'zgartirish"), <>
            {btn("qirqish", "scissors", t("Qirqish"), "Liniyani bosilgan nuqtada ikkiga bo'lish (Esc — tugatish)",
              { primary: true, faol: props.rejim === "qirqish" })}
            {btn("kochirish", "move", t("Ko'chirish"), "Qurilmani surish yoki liniya shaklini (vertexlarini) o'zgartirish",
              { primary: true, faol: props.rejim === "kochirish" })}
            {btn("editAttrs", "form", t("Atributlar"), "Tanlangan obyekt atributlarini tahrirlash", { primary: true })}
            {btn("deleteFeat", "trash", t("O'chirish"), "Tanlangan obyekt(lar)ni o'chirish", { cls: "xavfli" })}
          </>)}
          {guruh(t("Tarix"), <>
            {btn("undo", "undo", t("Ortga qaytarish"), "Oxirgi saqlangan o'zgarishni bekor qilish")}
            {btn("showHistory", "clock", t("Tarix"), "O'zgarishlar tarixini ko'rish")}
          </>)}
          {props.kutilayotgan > 0 && guruh(t("Mahalliy o'zgarishlar"),
            btn("yuborish", "upload", t("Yuborish ({n})", { n: props.kutilayotgan }),
              "Mahalliy saqlangan o'zgarishlarni Feature Layerga yozish (ruxsat berilgan bo'lishi kerak)", { cls: "yuborish" }))}
          <div className="ue-group ue-izoh-guruh">
            <p><Icon n="info" size={15} /><span>{t("Har bir o'zgarish saqlashdan oldin tekshiriladi va «Ortga qaytarish» bilan bekor qilinadi.")}</span></p>
          </div>
        </>
      )}

      {props.tab === "tekshiruv" && (
        <>
          {guruh(t("Xaritada ko'rsatish"), <>
            {kalit(props.fiz1, props.onFiz1, <>{t("Fizik xatolar")} <b>FIZ1</b></>)}
            {kalit(props.ogoh2, props.onOgoh2, <>{t("Ulanmagan T-tegishlar")} <b>OGOH2</b></>)}
          </>, true)}
          {guruh(t("Ro'yxat"), btn("errorTable", "list", t("Xatolar jadvali"), "Xatolar ro'yxatini jadvalda ochish", { primary: true }))}
        </>
      )}
    </div>
  );
}
