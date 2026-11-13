import { useId } from "react";
import { PIECES } from "./pieceShapes.js";

// Each part is filled, shaded along its lower right edge, then outlined.

export default function Piece({ type = "n", color = "b", className = "" }) {
  // Clip ids must be unique per instance; strip characters that url() rejects.
  const uid = useId().replace(/[^a-zA-Z0-9_]/g, "");
  const tone = color === "w" ? "white" : "black",
    fill = `var(--piece-${tone}-fill)`,
    shade = `var(--piece-${tone}-shade)`,
    line = `var(--piece-${tone}-line)`;
  const { parts, lines = [], dots = [] } = PIECES[type] || PIECES.n;
  return (
    <svg
      className={`chess-piece ${className}`}
      viewBox="0 0 48 48"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {parts.map((d, i) => (
          <clipPath key={i} id={`${uid}-p${i}`}>
            <path d={d} />
          </clipPath>
        ))}
      </defs>
      {parts.map((d, i) => (
        <g key={i}>
          <g clipPath={`url(#${uid}-p${i})`}>
            <path d={d} fill={shade} />
            <path d={d} fill={fill} transform="translate(-2.8 -1.3)" />
          </g>
          <path d={d} fill="none" stroke={line} strokeWidth="1.5" />
        </g>
      ))}
      {lines.map((d, i) => (
        <path key={`l${i}`} d={d} fill="none" stroke={line} strokeWidth="1.5" />
      ))}
      {dots.map((d, i) => (
        <path key={`d${i}`} d={d} fill={line} />
      ))}
    </svg>
  );
}
