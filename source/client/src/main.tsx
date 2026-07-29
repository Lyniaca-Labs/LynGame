import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

import { initTheme } from "./lib/looks/theme";
import { initSharpness } from "./lib/looks/sharpness";
import { initFont } from "./lib/looks/font";
import { initDensity } from "./lib/looks/density";
import { initDepth } from "./lib/looks/depth";
import { initBorder } from "./lib/looks/border";

initBorder();
initDepth();
initDensity();
initFont();
initTheme();
initSharpness();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
