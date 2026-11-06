import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/noto-sans-thai/400.css";
import "@fontsource/noto-sans-thai/500.css";
import "@fontsource/noto-sans-thai/600.css";
import "@fontsource/noto-sans-thai/700.css";
import "@fontsource/mitr/400.css";
import "@fontsource/mitr/500.css";
import "@fontsource/mitr/600.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/kid.css";
import "./styles/dashboard.css";
import { App } from "./App";
import { initMotion } from "./lib/motion";
import { initSfx } from "./lib/sfx";

initMotion();
initSfx();

const root = createRoot(document.getElementById("root") as HTMLElement);
if (import.meta.env.DEV && new URLSearchParams(location.search).has("studio")) {
  // dev-only render studio: saves still images of the 3D models into public/renders/
  void import("./three/RenderStudio").then(({ RenderStudio }) => root.render(<RenderStudio />));
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
