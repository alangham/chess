import { useEffect, useState } from "react";
import Icon from "./Icon.jsx";

function applyTheme(theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  root.style.backgroundColor = theme === "dark" ? "#191b1e" : "#f7f7f5";
  document.querySelector('meta[name="theme-color"]').content = root.style.backgroundColor;
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState(document.documentElement.dataset.theme || "light");
  useEffect(() => {
    const preference = matchMedia("(prefers-color-scheme: dark)");
    const update = () => {
      if (document.documentElement.dataset.themePreference !== "system") return;
      const next = preference.matches ? "dark" : "light";
      applyTheme(next);
      setTheme(next);
    };
    preference.addEventListener("change", update);
    update();
    return () => preference.removeEventListener("change", update);
  }, []);
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button className="icon-button theme-toggle" type="button"
      aria-label={`Switch to ${next} mode`} title={`Switch to ${next} mode`}
      onClick={() => {
        document.documentElement.dataset.themePreference = next;
        applyTheme(next);
        setTheme(next);
        try { localStorage.setItem("quiet-knight-theme", next); } catch {}
      }}>
      <Icon name={theme === "dark" ? "sun" : "moon"} />
      <span className="theme-label">{theme === "dark" ? "Light" : "Dark"}</span>
    </button>
  );
}
