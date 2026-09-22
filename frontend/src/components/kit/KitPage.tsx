import { useMemo, useState } from "react";
import { fr } from "../../i18n/fr.js";
import { TooltipProvider } from "../ui/Tooltip/Tooltip.js";
import { Toaster } from "../ui/Toast/Toast.js";
import styles from "./KitPage.module.css";
import type { KitEntry } from "./types.js";

/// Development-only gallery (`/_kit`): every `*.example.tsx` under
/// `components/` registers itself here through `import.meta.glob`. The
/// width switcher loads the same page in an iframe at the four review
/// widths (05 section 7).
const modules = import.meta.glob<{ kit: KitEntry }>("../**/*.example.tsx", {
  eager: true,
});

export const kitEntries: KitEntry[] = Object.values(modules)
  .map((module) => module.kit)
  .sort((a, b) =>
    a.group === b.group
      ? a.name.localeCompare(b.name)
      : a.group === "ui"
        ? -1
        : 1,
  );

const widths = [360, 430, 768, 1280] as const;

export function KitPage() {
  const params = new URLSearchParams(window.location.search);
  const embedded = params.get("embed") === "1";
  const [width, setWidth] = useState<number | null>(null);
  const [filter, setFilter] = useState("");
  const entries = useMemo(
    () =>
      kitEntries.filter((entry) =>
        entry.name.toLowerCase().includes(filter.toLowerCase()),
      ),
    [filter],
  );

  if (width !== null && !embedded) {
    return (
      <div className={styles.frameHost}>
        <div className={styles.frameBar}>
          <span>{width} px</span>
          <button
            type="button"
            className={styles.frameClose}
            onClick={() => setWidth(null)}
          >
            {fr.close}
          </button>
        </div>
        <iframe
          title={`${fr.kitTitle} à ${width} px`}
          src={`${window.location.pathname}?embed=1`}
          className={styles.frame}
          style={{ width }}
        />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className={styles.root}>
        {!embedded ? (
          <header className={styles.header}>
            <div>
              <p className="eyebrow">Dar El Barka · V2</p>
              <h1>{fr.kitTitle}</h1>
            </div>
            <div className={styles.controls}>
              <input
                type="search"
                className={styles.search}
                placeholder="Filtrer les composants"
                aria-label="Filtrer les composants"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              />
              <div
                className={styles.widths}
                role="group"
                aria-label="Largeur d'aperçu"
              >
                {widths.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={styles.widthButton}
                    onClick={() => setWidth(value)}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>
          </header>
        ) : null}
        <nav className={styles.toc} aria-label="Sommaire">
          <ul>
            {entries.map((entry) => (
              <li key={entry.name}>
                <a href={`#kit-${entry.name}`}>
                  {entry.name}
                  <span className={styles.tocGroup}>{entry.group}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className={styles.entries}>
          {entries.map((entry) => (
            <section
              key={entry.name}
              id={`kit-${entry.name}`}
              className={styles.entry}
              aria-labelledby={`kit-${entry.name}-title`}
            >
              <header className={styles.entryHeader}>
                <h2 id={`kit-${entry.name}-title`}>
                  {entry.name}{" "}
                  <span className={styles.groupTag}>{entry.group}</span>
                </h2>
                <p>{entry.description}</p>
              </header>
              {entry.examples.map((example) => (
                <div key={example.title} className={styles.example}>
                  <h3>{example.title}</h3>
                  {example.description ? (
                    <p className={styles.exampleDescription}>
                      {example.description}
                    </p>
                  ) : null}
                  <div className={styles.canvas}>{example.render()}</div>
                </div>
              ))}
            </section>
          ))}
        </div>
        <Toaster />
      </div>
    </TooltipProvider>
  );
}
