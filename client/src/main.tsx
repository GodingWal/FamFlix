import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Apply saved theme before React renders to avoid flash
const stored = localStorage.getItem("famflix_theme");
const theme = stored === "light" || stored === "dark" ? stored : null;
if (theme === "dark" || (!theme && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
  document.documentElement.classList.add("dark");
}

createRoot(document.getElementById("root")!).render(<App />);
