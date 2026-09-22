import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../../styles/tokens.css";
import "../../styles/reset.css";
import "../../styles/base.css";
import { KitPage } from "./KitPage.js";

/// Mounted by `main.tsx` on `/_kit` in development builds only; the
/// dynamic import behind `import.meta.env.DEV` keeps it out of production.
export function mountKit(root: HTMLElement): void {
  document.title = "Galerie des composants · Dar El Barka";
  createRoot(root).render(
    <StrictMode>
      <KitPage />
    </StrictMode>,
  );
}
