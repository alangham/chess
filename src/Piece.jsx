// Original vector pieces. No font glyphs or external artwork are required.
export default function Piece({ type = "n", color = "b", className = "" }) {
  const fill = color === "w" ? "var(--piece-white)" : "var(--piece-black)",
    stroke = color === "w" ? "var(--piece-outline)" : "var(--piece-highlight)";
  return (
    <svg
      className={`chess-piece ${className}`}
      viewBox="0 0 48 48"
      fill={fill}
      stroke={stroke}
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {type === "p" && (
        <>
          <circle cx="24" cy="12" r="6.5" />
          <path d="M18 20h12l-2 4c0 6 2 9 7 12H13c5-3 7-6 7-12z" />
          <path d="M14 36h20l3 6H11z" />
        </>
      )}
      {type === "r" && (
        <>
          <path d="M11 7h7v6h4V7h4v6h4V7h7v13l-6 4v11H17V24l-6-4z" />
          <path d="M17 24h14M13 35h22l3 7H10z" />
          <path d="M13 19h22" />
        </>
      )}
      {type === "b" && (
        <>
          <path d="M24 4c-2 4-11 9-11 16 0 4 4 7 11 7s11-3 11-7c0-7-9-12-11-16z" />
          <path d="m25 11-6 8M19 27h10l-1 5 7 5H13l7-5zM13 37h22l3 5H10z" />
        </>
      )}
      {type === "n" && (
        <>
          <path d="m18 4 1 7-8 10-4 8 7 3 8-5-3 10h19c-2-7 0-17-7-23L25 9l-1-5-3 5z" />
          <path d="m18 20-4 6m12-9c6 5 5 12 4 16M12 37h25l2 5H9z" />
          <circle cx="22" cy="16" r="1" fill={stroke} stroke="none" />
        </>
      )}
      {type === "q" && (
        <>
          <path d="m9 13 8 7 7-10 7 10 8-7-6 20H15z" />
          <circle cx="8" cy="11" r="3" />
          <circle cx="24" cy="7" r="3" />
          <circle cx="40" cy="11" r="3" />
          <path d="M15 33h18l2 5H13zM12 38h24l2 4H10z" />
        </>
      )}
      {type === "k" && (
        <>
          <path d="M24 3v10m-5-6h10" fill="none" strokeWidth="2.8" />
          <path d="M24 17c-3-8-15-6-15 2 0 6 7 9 8 14h14c1-5 8-8 8-14 0-8-12-10-15-2z" />
          <path d="M24 18v11M17 33h14l4 5H13zM12 38h24l2 4H10z" />
        </>
      )}
    </svg>
  );
}
