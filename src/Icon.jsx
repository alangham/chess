export default function Icon({ name = "arrow" }) {
  return (
    <svg
      className={`ui-icon icon-${name}`}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {name === "infinity" ? (
        <path d="M12 12c-2.8-4-4.1-5-6-5a5 5 0 0 0 0 10c1.9 0 3.2-1 6-5s4.1-5 6-5a5 5 0 0 1 0 10c-1.9 0-3.2-1-6-5Z" />
      ) : (
        <path d="M4 12h16m-6-6 6 6-6 6" />
      )}
    </svg>
  );
}
