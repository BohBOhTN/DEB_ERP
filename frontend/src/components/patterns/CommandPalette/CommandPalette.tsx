import { Command } from "cmdk";
import { Search } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Dialog } from "../../ui/Dialog/Dialog.js";
import { Kbd } from "../../ui/Kbd/Kbd.js";
import styles from "./CommandPalette.module.css";

export interface PaletteItem {
  id: string;
  label: string;
  /// "Clients", "Produits", "Actions"...; items are grouped by it.
  group: string;
  description?: string;
  icon?: ReactNode;
  keywords?: string[];
  onSelect: () => void;
}

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /// Always available: navigation and actions, filtered by cmdk.
  items: PaletteItem[];
  /// Server search for a typed query of two characters or more (recent
  /// customers, products, suppliers through their `q` endpoints).
  search?: (query: string) => Promise<PaletteItem[]>;
  placeholder?: string;
}

/// `Ctrl+K` / `⌘K` on desktop (UI-22): one box to jump to a screen, start
/// an action or open a customer, product or supplier. Hidden on phones by
/// its trigger; the dialog itself works at any width.
export function CommandPalette({
  open,
  onOpenChange,
  items,
  search,
  placeholder = "Aller à, créer, rechercher…",
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  // The last server answer with the query it answers; "searching" and the
  // visible results derive from it, so no state is set inside an effect.
  const [resolved, setResolved] = useState<{
    query: string;
    items: PaletteItem[];
  }>({ query: "", items: [] });
  const trimmed = query.trim();
  const searchable = Boolean(search) && trimmed.length >= 2;
  const results =
    searchable && resolved.query === trimmed ? resolved.items : [];
  const searching = searchable && resolved.query !== trimmed;

  useEffect(() => {
    if (!search || trimmed.length < 2) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      search(trimmed)
        .then((items) => {
          if (!cancelled) setResolved({ query: trimmed, items });
        })
        .catch(() => {
          if (!cancelled) setResolved({ query: trimmed, items: [] });
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [trimmed, search]);

  const close = (next: boolean) => {
    if (!next) {
      setQuery("");
      setResolved({ query: "", items: [] });
    }
    onOpenChange(next);
  };

  const groups = new Map<string, PaletteItem[]>();
  for (const item of [...items, ...results]) {
    groups.set(item.group, [...(groups.get(item.group) ?? []), item]);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title="Palette de commandes"
      size="md"
      className={styles.dialog}
    >
      <Command
        label="Palette de commandes"
        className={styles.command}
        shouldFilter
        filter={(value, searchValue, keywords) => {
          const haystack =
            `${value} ${(keywords ?? []).join(" ")}`.toLowerCase();
          return searchValue
            .toLowerCase()
            .split(/\s+/)
            .every((word) => haystack.includes(word))
            ? 1
            : 0;
        }}
      >
        <div className={styles.searchRow}>
          <Search className={styles.searchIcon} aria-hidden="true" />
          <Command.Input
            value={query}
            onValueChange={setQuery}
            placeholder={placeholder}
            className={styles.input}
            aria-label="Rechercher une page, une action ou une fiche"
          />
          <Kbd>Échap</Kbd>
        </div>
        <Command.List className={styles.list}>
          <Command.Empty className={styles.empty}>
            {searching ? "Recherche…" : "Aucun résultat."}
          </Command.Empty>
          {[...groups].map(([group, entries]) => (
            <Command.Group key={group} heading={group} className={styles.group}>
              {entries.map((item) => (
                <Command.Item
                  key={item.id}
                  value={`${item.group} ${item.label} ${item.description ?? ""}`}
                  keywords={item.keywords}
                  // Server results are already filtered by the query; keep
                  // them visible whatever cmdk thinks of their label.
                  forceMount={results.includes(item) || undefined}
                  onSelect={() => {
                    close(false);
                    item.onSelect();
                  }}
                  className={styles.item}
                >
                  {item.icon ? (
                    <span className={styles.itemIcon} aria-hidden="true">
                      {item.icon}
                    </span>
                  ) : null}
                  <span className={styles.itemBody}>
                    <span>{item.label}</span>
                    {item.description ? (
                      <span className={styles.itemDescription}>
                        {item.description}
                      </span>
                    ) : null}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          ))}
        </Command.List>
      </Command>
    </Dialog>
  );
}

/// The desktop trigger shown in the top bar; the shortcut hint tells the
/// user the palette exists.
export function CommandPaletteTrigger({ onClick }: { onClick: () => void }) {
  const mac =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad/.test(navigator.platform);
  return (
    <button
      type="button"
      className={styles.trigger}
      onClick={onClick}
      aria-label="Ouvrir la palette de commandes"
      aria-keyshortcuts={mac ? "Meta+K" : "Control+K"}
    >
      <Search aria-hidden="true" />
      <span className={styles.triggerLabel}>Rechercher</span>
      <Kbd>{mac ? "⌘K" : "Ctrl K"}</Kbd>
    </button>
  );
}

/// `Ctrl+K` / `⌘K` anywhere in the app, including inside text fields.
export function usePaletteShortcut(onOpen: () => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpen();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onOpen, enabled]);
}
