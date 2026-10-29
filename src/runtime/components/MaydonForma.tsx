import { React } from "jimu-core";
import Icon from "./Icon";
import Tanlov from "./Tanlov";
import { t, tx, useTil } from "../i18n";
import { kvMatn } from "../network";

export interface Maydon {
  maydon: string;
  nomi: string;
  tur: "matn" | "son" | "butun";
  qiymat: any;
  tanlov?: number[];
}

/** Server rad etgan saqlash: 409 da yangi xatolar ro'yxati, admin uchun "Baribir saqlash". */
export interface XatoInfo {
  /** Interfeys matni (t() bilan tarjima qilinadi). */
  sarlavha: string;
  /** Dvigatel yoki Feature Layer matni (tx() bilan). */
  matn: string;
  xatolar?: Array<{ kod: string; tur: string; izoh?: string; obyektlar?: string }>;
  majburanMatn?: string;
}

export function XatoQuti(props: { xato: XatoInfo | null; onMajburan?: () => void }): React.ReactElement | null {
  useTil();
  const x = props.xato;
  if (!x) return null;
  return (
    <div className="ue-tahrir-xato" role="alert">
      <div className="sarlavha">
        <Icon n="alert" size={16} />
        <span><b>{t(x.sarlavha)}</b> {tx(x.matn)}</span>
      </div>
      {x.xatolar?.length > 0 && (
        <ul>
          {x.xatolar.map((e, i) => (
            <li key={i}>
              <b>{e.kod}</b> — {tx(e.tur)}
              {e.izoh && <><br />{tx(e.izoh)}</>}
              {e.obyektlar && <><br /><span className="gid">{e.obyektlar}</span></>}
            </li>
          ))}
        </ul>
      )}
      {x.majburanMatn && props.onMajburan && (
        <button type="button" className="ue-btn kichik" onClick={props.onMajburan}>{t(x.majburanMatn)}</button>
      )}
    </div>
  );
}

/** Formadagi qiymat aslidan farq qiladimi (son maydonlarida "2,5" == 2.5). */
export function ozgarganmi(m: Maydon, v: string, asl: any): boolean {
  const a = asl == null ? "" : String(asl);
  v = v.trim();
  if (m.tanlov || m.tur !== "matn") return v === "" ? a !== "" : a === "" || Number(v.replace(",", ".")) !== Number(a);
  return v !== a;
}

interface Props {
  maydonlar: Maydon[];
  qiymatlar: Record<string, string>;
  /** Berilsa — o'zgargan maydonlar belgilanadi va tugmada soni ko'rsatiladi. */
  asl?: Record<string, any>;
  izoh?: (m: Maydon) => React.ReactNode;
  onChange: (maydon: string, qiymat: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  saqlanmoqda: boolean;
  xato: XatoInfo | null;
  onMajburan?: () => void;
}

export default function MaydonForma(props: Props): React.ReactElement {
  useTil();
  const ozgargan = props.asl
    ? props.maydonlar.filter((m) => ozgarganmi(m, props.qiymatlar[m.maydon] ?? "", props.asl[m.maydon]))
    : [];
  const kirit = (m: Maydon) => {
    const v = props.qiymatlar[m.maydon] ?? "";
    if (m.tanlov) {
      return (
        <Tanlov className="forma" ic="zap" title={tx(m.nomi)} qiymat={v} onChange={(id) => props.onChange(m.maydon, id)}
          variantlar={m.tanlov.map((x) => ({ id: String(x), nomi: kvMatn(x), ic: "zap" }))} />
      );
    }
    // son maydonlarini ham matn sifatida olamiz: vergul (2,5) ham o'tadi
    return (
      <input type="text" value={v} inputMode={m.tur !== "matn" ? "decimal" : undefined}
        onChange={(e) => props.onChange(m.maydon, e.target.value)} />
    );
  };
  return (
    <form className="ue-tahrir-forma" autoComplete="off" onSubmit={(e) => { e.preventDefault(); props.onSubmit(); }}>
      {props.maydonlar.map((m) => (
        m.tanlov ? (
          <div key={m.maydon} className={`ue-forma-qator${ozgargan.includes(m) ? " ozgargan" : ""}`}>
            <span>{tx(m.nomi)}{props.izoh?.(m)}</span>
            {kirit(m)}
          </div>
        ) : (
          <label key={m.maydon} className={`ue-forma-qator${ozgargan.includes(m) ? " ozgargan" : ""}`}>
            <span>{tx(m.nomi)}{props.izoh?.(m)}</span>
            {kirit(m)}
          </label>
        )
      ))}
      <div className="ue-tahrir-tugmalar">
        <XatoQuti xato={props.xato} onMajburan={props.onMajburan} />
        <button type="submit" className="ue-btn primary" disabled={props.saqlanmoqda}>
          {props.saqlanmoqda
            ? <><span className="ue-spin" />{t("Tekshirilmoqda…")}</>
            : <><Icon n="check" size={15} />{ozgargan.length ? t("Saqlash ({n})", { n: ozgargan.length }) : t("Saqlash")}</>}
        </button>
        <button type="button" className="ue-btn" onClick={props.onCancel}>{t("Bekor qilish")}</button>
      </div>
    </form>
  );
}

export function formaQiymatlari(maydonlar: Maydon[]): Record<string, string> {
  const q: Record<string, string> = {};
  for (const m of maydonlar) q[m.maydon] = m.qiymat == null ? "" : String(m.qiymat);
  return q;
}
