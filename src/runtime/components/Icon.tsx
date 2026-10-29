import { React } from "jimu-core";

// Chiziqli piktogrammalar (24×24, stroke = currentColor)
const P: Record<string, string> = {
  bolt: "M13 2 4 14h7l-1 8 9-12h-7l1-8z",
  map: "M9 4 3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5L9 4z M9 4v13.5 M15 6.5V20",
  network: "M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M8.6 13.5l6.8 4 M15.4 6.5l-6.8 4",
  edit: "M12 20h9 M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z M9 12l2 2 4-4",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.3-4.3",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z M12 1v2 M12 21v2 M4.2 4.2l1.4 1.4 M18.4 18.4l1.4 1.4 M1 12h2 M21 12h2 M4.2 19.8l1.4-1.4 M18.4 5.6l1.4-1.4",
  moon: "M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z",
  monitor: "M3 4h18v12H3z M8 20h8 M12 16v4",
  globe: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M2 12h20 M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10 15 15 0 0 1-4-10 15 15 0 0 1 4-10z",
  expand: "M15 3h6v6 M9 21H3v-6 M21 3l-7 7 M3 21l7-7",
  target: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M22 12h-2 M4 12H2 M12 4V2 M12 22v-2",
  eraser: "M20 20H8l-4.3-4.3a1.5 1.5 0 0 1 0-2.1L13.6 3.7a1.5 1.5 0 0 1 2.1 0l4.6 4.6a1.5 1.5 0 0 1 0 2.1L11 20 M7 11l6 6",
  table: "M3 4h18v16H3z M3 10h18 M3 15h18 M9 10v10",
  activity: "M22 12h-4l-3 9L9 3l-3 9H2",
  play: "M6 4l14 8-14 8V4z",
  flag: "M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z M4 22v-7",
  ban: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M4.9 4.9l14.2 14.2",
  pin: "M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  trash: "M3 6h18 M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6 M10 11v6 M14 11v6 M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2",
  refresh: "M21 4v6h-6 M3 20v-6h6 M5.1 9a8 8 0 0 1 13.2-3L21 10 M3 14l2.7 4a8 8 0 0 0 13.2-3",
  line: "M5 19c4 0 4-7 7-7s3-7 7-7 M5 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M19 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  device: "M4 4h16v16H4z M12 8v8 M8 12h8",
  scissors: "M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M20 4 8.1 15.9 M14.5 14.5 20 20 M8.1 8.1 12 12",
  move: "M5 9l-3 3 3 3 M9 5l3-3 3 3 M15 19l-3 3-3-3 M19 9l3 3-3 3 M2 12h20 M12 2v20",
  form: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8",
  undo: "M3 7v6h6 M21 17a9 9 0 0 0-15-6.7L3 13",
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 6v6l4 2",
  upload: "M16 16l-4-4-4 4 M12 12v9 M20.4 18.4A5 5 0 0 0 18 9h-1.3A8 8 0 1 0 3 16.3",
  alert: "M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z M12 9v4 M12 17h.01",
  check: "M22 11.1V12a10 10 0 1 1-5.9-9.1 M22 4 12 14l-3-3",
  info: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 16v-4 M12 8h.01",
  layers: "M12 2 2 7l10 5 10-5-10-5z M2 17l10 5 10-5 M2 12l10 5 10-5",
  left: "M15 18l-6-6 6-6",
  right: "M9 18l6-6-6-6",
  down: "M6 9l6 6 6-6",
  x: "M18 6 6 18 M6 6l12 12",
  download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3",
  image: "M3 3h18v18H3z M8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M21 15l-5-5L5 21",
  square: "M3 3h18v18H3z",
  checkmark: "M20 6 9 17l-5-5",
  checks: "M3 12l3 3 6-6 M10 17l2 2 9-9",
  filter: "M22 3H2l8 9.5V19l4 2v-8.5L22 3z",
  user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  server: "M3 3h18v8H3z M3 13h18v8H3z M7 7h.01 M7 17h.01",
  pointer: "M4 4l7 17 2.5-7.5L21 11 4 4z",
  list: "M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01",
  zap: "M13 2 4 14h7l-1 8 9-12h-7l1-8z",
  sliders: "M4 21v-7 M4 10V3 M12 21v-9 M12 8V3 M20 21v-5 M20 12V3 M1 14h6 M9 8h6 M17 16h6",
};

interface Props {
  n: keyof typeof P | string;
  size?: number;
  className?: string;
  stroke?: number;
}

export default function Icon(props: Props): React.ReactElement {
  const d = P[props.n] || P.square;
  const s = props.size || 18;
  return (
    <svg className={`ue-ic ${props.className || ""}`} width={s} height={s} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={props.stroke || 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d.split(" M").map((p, i) => <path key={i} d={(i ? "M" : "") + p} />)}
    </svg>
  );
}
