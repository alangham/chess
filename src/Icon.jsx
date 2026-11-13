const PATHS = {
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5" />
    </>
  ),
  moon: <path d="M20.4 14.3A9 9 0 0 1 9.7 3.6 9 9 0 1 0 20.4 14.3Z" />,
  infinity: (
    <path d="M12 12c-2.8-4-4.1-5-6-5a5 5 0 0 0 0 10c1.9 0 3.2-1 6-5s4.1-5 6-5a5 5 0 0 1 0 10c-1.9 0-3.2-1-6-5Z" />
  ),
  speaker: (
    <>
      <path d="M11 5 6.5 9H3.5v6h3l4.5 4V5Z" />
      <path d="M15.5 9a4.2 4.2 0 0 1 0 6M18.5 6.2a8.2 8.2 0 0 1 0 11.6" />
    </>
  ),
  "speaker-off": (
    <>
      <path d="M11 5 6.5 9H3.5v6h3l4.5 4V5Z" />
      <path d="m16 9.5 5 5m0-5-5 5" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  first: <path d="M17.5 6 11.5 12l6 6M7 6v12" />,
  prev: <path d="M14.5 6 8.5 12l6 6" />,
  next: <path d="m9.5 6 6 6-6 6" />,
  last: <path d="m6.5 6 6 6-6 6M17 6v12" />,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
};

export default function Icon({ name = "arrow" }) {
  return (
    <svg
      className={`ui-icon icon-${name}`}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[name] || PATHS.arrow}
    </svg>
  );
}
