import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./style.css";
import { registerSW } from "virtual:pwa-register";
registerSW({
  onOfflineReady() {
    window.dispatchEvent(new Event("offline-ready"));
  },
});
createRoot(document.getElementById("root")).render(<App />);
