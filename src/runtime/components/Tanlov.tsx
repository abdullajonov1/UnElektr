import { React, ReactDOM } from "jimu-core";
import Icon from "./Icon";

/**
 * Ochiladigan ro'yxat (brauzer <select> o'rniga — variantlar to'liq bezatiladi).
 * Menyu .ue-root ichiga portal bilan chiziladi: tasma/sarlavhaning overflow'i uni kesmaydi, mavzu ranglari saqlanadi.
 */
export interface TanlovVariant {
  id: string;
  nomi: string;
  izoh?: string;
  /** Chap tomondagi piktogramma (Icon nomi). */
  ic?: string;
  /** Ko'rinish rasmi: ustma-ust qo'yiladigan rasm URL lari. */
  rasm?: string[];
  /** Rasm o'rniga katak naqsh (masalan, "Fonsiz"). */
  bosh?: boolean;
  guruh?: string;
}

interface Props {
  qiymat: string;
  variantlar: TanlovVariant[];
  onChange: (id: string) => void;
  /** Tugma oldidagi piktogramma (berilmasa — tanlangan variantniki). */
  ic?: string;
  /** Tugmada nomi o'rniga qisqa matn. */
  qisqa?: (v: TanlovVariant) => string;
  title?: string;
  className?: string;
  /** "royxat" — oddiy ro'yxat, "rasmli" — rasmli kartalar to'ri. */
  turi?: "royxat" | "rasmli";
  /** Menyu kengligi (px). */
  kenglik?: number;
}

export function Rasm(props: { v: TanlovVariant; className?: string }): React.ReactElement {
  const v = props.v;
  return (
    <span className={`ue-dd-rasm ${props.className || ""}${v.bosh ? " bosh" : ""}`} aria-hidden>
      {(v.rasm || []).map((u, i) => <img key={i} src={u} alt="" loading="lazy" draggable={false} />)}
    </span>
  );
}

export default function Tanlov(props: Props): React.ReactElement {
  const [ochiq, setOchiq] = React.useState(false);
  const [faol, setFaol] = React.useState(-1);
  const [joy, setJoy] = React.useState<{ left: number; top?: number; bottom?: number; width: number; maxH: number; root: HTMLElement } | null>(null);
  const tugma = React.useRef<HTMLButtonElement>(null);
  const menyu = React.useRef<HTMLDivElement>(null);
  const tanlangan = props.variantlar.find((v) => v.id === props.qiymat) || props.variantlar[0];
  const rasmli = props.turi === "rasmli";

  const joylash = React.useCallback(() => {
    const b = tugma.current;
    const root = b?.closest(".ue-root") as HTMLElement;
    if (!b || !root) return;
    const r = b.getBoundingClientRect(), rr = root.getBoundingClientRect();
    const width = Math.max(props.kenglik || 0, r.width);
    const left = Math.min(Math.max(8, r.left - rr.left), Math.max(8, rr.width - width - 8));
    // pastda joy yetmasa — yuqoriga ochiladi
    const past = rr.bottom - r.bottom - 14, tepa = r.top - rr.top - 14;
    const yuqoriga = past < 240 && tepa > past;
    const maxH = Math.max(140, Math.min(470, yuqoriga ? tepa : past));
    setJoy(yuqoriga ? { left, bottom: rr.bottom - r.top + 6, width, maxH, root } : { left, top: r.bottom - rr.top + 6, width, maxH, root });
  }, [props.kenglik]);

  const och = () => {
    joylash();
    setFaol(Math.max(0, props.variantlar.findIndex((v) => v.id === props.qiymat)));
    setOchiq(true);
  };
  const yop = (fokus = true) => {
    setOchiq(false);
    if (fokus) tugma.current?.focus();
  };
  const tanla = (id: string) => {
    yop();
    if (id !== props.qiymat) props.onChange(id);
  };

  React.useEffect(() => {
    if (!ochiq) return undefined;
    const tashqi = (e: MouseEvent) => {
      const n = e.target as Node;
      if (!menyu.current?.contains(n) && !tugma.current?.contains(n)) yop(false);
    };
    const qayta = () => joylash();
    // panel aylantirilsa menyu tugmadan ajralib qoladi — yopamiz (menyuning o'z aylanishi bundan mustasno)
    const aylandi = (e: Event) => {
      if (!menyu.current?.contains(e.target as Node)) yop(false);
    };
    document.addEventListener("mousedown", tashqi, true);
    document.addEventListener("scroll", aylandi, true);
    window.addEventListener("resize", qayta);
    return () => {
      document.removeEventListener("mousedown", tashqi, true);
      document.removeEventListener("scroll", aylandi, true);
      window.removeEventListener("resize", qayta);
    };
  }, [ochiq, joylash]);

  React.useEffect(() => {
    if (!ochiq || faol < 0) return;
    menyu.current?.querySelector<HTMLElement>(`[data-i="${faol}"]`)?.scrollIntoView({ block: "nearest" });
  }, [ochiq, faol]);

  const tugmaBosildi = (e: React.KeyboardEvent) => {
    const n = props.variantlar.length;
    if (!ochiq) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        och();
      }
      return;
    }
    const qadam = rasmli && (e.key === "ArrowDown" || e.key === "ArrowUp") ? 2 : 1;
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); yop(); }
    else if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); setFaol((i) => Math.min(n - 1, i + qadam)); }
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); setFaol((i) => Math.max(0, i - qadam)); }
    else if (e.key === "Home") { e.preventDefault(); setFaol(0); }
    else if (e.key === "End") { e.preventDefault(); setFaol(n - 1); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (faol >= 0) tanla(props.variantlar[faol].id); }
    else if (e.key === "Tab") yop(false);
  };

  // guruhlar (berilgan tartibda)
  const guruhlar: Array<[string, Array<[TanlovVariant, number]>]> = [];
  props.variantlar.forEach((v, i) => {
    const g = v.guruh || "";
    let q = guruhlar.find((x) => x[0] === g);
    if (!q) guruhlar.push((q = [g, []]));
    q[1].push([v, i]);
  });

  const variant = ([v, i]: [TanlovVariant, number]) => {
    const tan = v.id === props.qiymat;
    return (
      <div key={v.id} data-i={i} role="option" aria-selected={tan}
        className={`ue-dd-opt${tan ? " tanlangan" : ""}${i === faol ? " faol" : ""}`}
        onMouseEnter={() => setFaol(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => tanla(v.id)}>
        {rasmli ? <Rasm v={v} /> : v.ic ? <span className="ue-dd-ic"><Icon n={v.ic} size={16} /></span> : null}
        <span className="ue-dd-matn">
          <span className="nomi">{v.nomi}</span>
          {v.izoh && <span className="izoh">{v.izoh}</span>}
        </span>
        {tan && <span className="ue-dd-belgi"><Icon n="checkmark" size={14} stroke={2.4} /></span>}
      </div>
    );
  };

  const menyuEl = ochiq && joy ? ReactDOM.createPortal(
    <div ref={menyu} className={`ue-dd-menu${rasmli ? " rasmli" : ""}`} role="listbox"
      style={{ left: joy.left, top: joy.top, bottom: joy.bottom, width: joy.width, maxHeight: joy.maxH }}>
      {guruhlar.map(([g, vs]) => (
        <div key={g || "_"} className="ue-dd-guruh">
          {g && <div className="ue-dd-sarlavha">{g}</div>}
          <div className={rasmli ? "ue-dd-tor" : "ue-dd-qatorlar"}>{vs.map(variant)}</div>
        </div>
      ))}
    </div>,
    joy.root,
  ) : null;

  return (
    <>
      <button ref={tugma} type="button" className={`ue-dd-btn${ochiq ? " ochiq" : ""} ${props.className || ""}`}
        title={props.title} aria-haspopup="listbox" aria-expanded={ochiq}
        onClick={() => (ochiq ? yop() : och())} onKeyDown={tugmaBosildi}>
        {rasmli && tanlangan ? <Rasm v={tanlangan} className="kichik" />
          : <Icon n={props.ic || tanlangan?.ic || "list"} size={16} />}
        <span className="ue-dd-qiymat">{tanlangan ? (props.qisqa ? props.qisqa(tanlangan) : tanlangan.nomi) : ""}</span>
        <Icon n="down" size={14} className="ue-dd-chevron" />
      </button>
      {menyuEl}
    </>
  );
}
