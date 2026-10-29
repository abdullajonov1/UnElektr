import { React } from "jimu-core";
import { USTUNLAR, type Qator } from "../network";
import Icon from "./Icon";
import { TilContext, son, t } from "../i18n";

export type JadvalFiltr = "hammasi" | "liniya" | "qurilma";

interface Props {
  open: boolean;
  /** Sarlavha (interfeys matni — t() bilan tarjima qilinadi). */
  title: string;
  rows: Qator[];
  /** O'zgarsa — filtr, tartib va sahifa boshlang'ich holatga qaytadi (yangi jadval ochildi). */
  version: number;
  initialFilter: JadvalFiltr;
  tanlov: string[];
  /** toggle — Ctrl/Shift bilan bosildi; aks holda bitta obyekt tanlanadi va unga yaqinlashiladi. */
  onRowClick: (gid: string, toggle: boolean) => void;
  onSelectAll: (gids: string[]) => void;
  onClose: () => void;
  onMessage: (matn: string) => void;
}

interface State {
  filtr: JadvalFiltr;
  tartib: { k: string | null; yon: number };
  faqatTanlangan: boolean;
  korsatilgan: number;
  /** Panel DOM da bormi (yopilish animatsiyasi tugaguncha qoladi). */
  chizilgan: boolean;
  /** Ochiq holat klassi — panel shu bilan pastdan silliq ko'tariladi. */
  ochiq: boolean;
}

const QADAM = 400; // bir martada chiziladigan qatorlar soni (katta jadval tez ochilishi uchun)
const ANIMATSIYA_MS = 300; // widget.css dagi --ue-harakat bilan bir xil (+ zaxira)

export default class ResultsTable extends React.PureComponent<Props, State> {
  static contextType = TilContext;
  state: State = {
    filtr: this.props.initialFilter, tartib: { k: null, yon: 1 }, faqatTanlangan: false, korsatilgan: QADAM,
    chizilgan: this.props.open, ochiq: this.props.open,
  };

  /** Yopilayotganda ko'rsatiladigan oxirgi holat (jadval qatorlari shu payt tozalanib ketishi mumkin). */
  private yopilish: Pick<Props, "title" | "rows" | "tanlov"> | null = null;
  private taymer: any = null;
  private kadr = 0;

  componentDidUpdate(prev: Props): void {
    if (prev.version !== this.props.version) {
      this.setState({ filtr: this.props.initialFilter, tartib: { k: null, yon: 1 }, faqatTanlangan: false, korsatilgan: QADAM });
    }
    if (!prev.open && this.props.open) this.och();
    else if (prev.open && !this.props.open) this.yop(prev);
  }

  componentWillUnmount(): void {
    clearTimeout(this.taymer);
    cancelAnimationFrame(this.kadr);
  }

  private och() {
    clearTimeout(this.taymer);
    this.yopilish = null;
    if (this.state.chizilgan) return this.setState({ ochiq: true }); // yopilayotgan edi — qaytadan ochiladi
    // avval yopiq holda chiziladi, keyingi kadrda ochiq klassi qo'yiladi — balandlik 0 dan silliq o'sadi
    this.setState({ chizilgan: true, ochiq: false }, () => {
      this.kadr = requestAnimationFrame(() => {
        this.kadr = requestAnimationFrame(() => this.props.open && this.setState({ ochiq: true }));
      });
    });
  }

  private yop(prev: Props) {
    cancelAnimationFrame(this.kadr);
    this.yopilish = { title: prev.title, rows: prev.rows, tanlov: prev.tanlov };
    this.setState({ ochiq: false });
    // transitionend kelmasa ham (masalan, animatsiya o'chirilgan) panel olib tashlanadi
    this.taymer = setTimeout(this.olibTashla, ANIMATSIYA_MS + 60);
  }

  private olibTashla = () => {
    clearTimeout(this.taymer);
    if (this.props.open) return;
    this.yopilish = null;
    this.setState({ chizilgan: false });
  };

  private onTransitionEnd = (e: React.TransitionEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && e.propertyName === "height" && !this.state.ochiq) this.olibTashla();
  };

  private filtrlangan(): Qator[] {
    const { filtr, faqatTanlangan, tartib } = this.state;
    const { rows, tanlov } = this.yopilish || this.props;
    const tset = new Set(tanlov);
    let q = rows.filter(
      (r) => filtr === "hammasi" || (filtr === "liniya" ? r.tur === "liniya" : r.tur !== "liniya"),
    );
    if (faqatTanlangan) q = q.filter((r) => tset.has(r.GLOBALID));
    if (tartib.k) {
      const k = tartib.k, y = tartib.yon;
      q = [...q].sort((a, b) => ((a[k] ?? "") > (b[k] ?? "") ? y : (a[k] ?? "") < (b[k] ?? "") ? -y : 0));
    }
    return q;
  }

  private csv(q: Qator[]) {
    if (!q.length) return this.props.onMessage(t("Jadval bo'sh"));
    const ustunlar = USTUNLAR.filter((u) => q.some((r) => r[u.k] != null && r[u.k] !== ""));
    const satr = [ustunlar.map((u) => t(u.n)).join(";")];
    for (const r of q) {
      satr.push(ustunlar.map((u) => String((u.f ? u.f(r[u.k]) : r[u.k]) ?? "").replace(/;/g, ",")).join(";"));
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + satr.join("\n")], { type: "text/csv;charset=utf-8" }));
    a.download = t(this.props.title).replace(/[^\p{L}\d\- ]+/gu, "").trim().replace(/\s+/g, "_") + ".csv";
    a.click();
  }

  render(): React.ReactNode {
    if (!this.state.chizilgan) return null;
    const { filtr, tartib, faqatTanlangan, korsatilgan, ochiq } = this.state;
    const { title, tanlov } = this.yopilish || this.props;
    const tset = new Set(tanlov);
    const q = this.filtrlangan();
    // faqat ichida qiymati bor ustunlarni ko'rsatamiz
    const ustunlar = USTUNLAR.filter((u) => q.some((r) => r[u.k] != null && r[u.k] !== ""));
    const tanlanganSoni = q.filter((r) => tset.has(r.GLOBALID)).length;
    const korinadi = q.slice(0, korsatilgan);

    return (
      <div className={`ue-table-qobiq${ochiq ? " ochiq" : ""}`} onTransitionEnd={this.onTransitionEnd} aria-hidden={!ochiq}>
        <div className="ue-table-panel">
          <div className="ue-table-head">
            <span className="ue-jadval-nomi">
              <Icon n="table" size={16} />
              {t(title)}
              <span className="ue-soni">{son(q.length)}</span>
              {tanlanganSoni > 0 && <span className="ue-tag">{t("tanlangan: {n}", { n: tanlanganSoni })}</span>}
            </span>
            <div className="ue-seg" role="tablist">
              {(["hammasi", "liniya", "qurilma"] as const).map((f) => (
                <button key={f} type="button" className={filtr === f ? "faol" : ""}
                  onClick={() => this.setState({ filtr: f, korsatilgan: QADAM })}>
                  {f === "hammasi" ? t("Hammasi") : f === "liniya" ? t("Liniyalar") : t("Qurilmalar")}
                </button>
              ))}
            </div>
            <button type="button" className={`ue-btn kichik ${faqatTanlangan ? "faol" : ""}`}
              title={t("Faqat tanlangan qatorlarni ko'rsatish")}
              onClick={() => this.setState({ faqatTanlangan: !faqatTanlangan, korsatilgan: QADAM })}>
              <Icon n="filter" size={13} />{t("Faqat tanlanganlar")}
            </button>
            <button type="button" className="ue-btn kichik" title={t("Jadvaldagi barcha qatorlarni xaritada tanlash")}
              onClick={() => this.props.onSelectAll(q.map((r) => r.GLOBALID))}>
              <Icon n="checks" size={13} />{t("Hammasini tanlash")}
            </button>
            <span className="ue-flex" />
            <button type="button" className="ue-btn kichik" onClick={() => this.csv(q)}>
              <Icon n="download" size={13} />CSV
            </button>
            <button type="button" className="ue-icon-btn" title={t("Yopish")} onClick={this.props.onClose}>
              <Icon n="x" size={16} />
            </button>
          </div>
          <div className="ue-table-body">
            <table>
              <thead>
                <tr>
                  {ustunlar.map((u) => (
                    <th key={u.k} onClick={() =>
                      this.setState({ tartib: { k: u.k, yon: tartib.k === u.k ? -tartib.yon : 1 } })}>
                      {t(u.n)} {tartib.k === u.k && <span className="tartib">{tartib.yon > 0 ? "▲" : "▼"}</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {korinadi.map((r, i) => (
                  <tr key={`${r.GLOBALID}-${i}`} className={tset.has(r.GLOBALID) ? "selected" : ""}
                    onClick={(e) => this.props.onRowClick(r.GLOBALID, e.ctrlKey || e.shiftKey)}>
                    {ustunlar.map((u) => (
                      <td key={u.k} className={u.cls || ""}>{String((u.f ? u.f(r[u.k]) : r[u.k]) ?? "")}</td>
                    ))}
                  </tr>
                ))}
                {q.length > korsatilgan && (
                  <tr className="yana">
                    <td colSpan={ustunlar.length}>
                      <button type="button" className="ue-btn kichik"
                        onClick={() => this.setState({ korsatilgan: korsatilgan + QADAM })}>
                        {t("Yana {n} ta qatorni ko'rsatish (jami {jami})",
                          { n: Math.min(QADAM, q.length - korsatilgan), jami: son(q.length) })}
                      </button>
                    </td>
                  </tr>
                )}
                {!q.length && (
                  <tr className="yana">
                    <td colSpan={Math.max(1, ustunlar.length)}>
                      {faqatTanlangan ? t("Jadvaldagi obyektlardan hech biri tanlanmagan.") : t("Jadval bo'sh.")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }
}
