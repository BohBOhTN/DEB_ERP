import { Search, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { cx } from "../../../lib/cx.js";
import { useDebounce } from "../../../lib/hooks/useDebounce.js";
import { useIsPhone } from "../../../lib/hooks/useBreakpoint.js";
import { fr } from "../../../i18n/fr.js";
import { Badge } from "../../ui/Badge/Badge.js";
import { Button } from "../../ui/Button/Button.js";
import { Sheet } from "../../ui/Sheet/Sheet.js";
import { TextInput } from "../../ui/TextInput/TextInput.js";
import styles from "./FilterBar.module.css";

export interface FilterBarProps {
  /// Current search value from the URL; `onSearchChange` fires debounced.
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  /// Selects and segmented chips; on phones they move into a sheet.
  filters?: ReactNode;
  /// Number of active filters, shown on the phone "Filtres" button.
  activeCount?: number;
  onReset?: () => void;
  /// Trailing slot for a primary action next to the filters.
  actions?: ReactNode;
  className?: string;
}

const searchDebounceMs = 300;

/// Search plus filters, state owned by the page (URL). Below 600 px the
/// filters collapse into a "Filtres" button that opens a bottom sheet.
export function FilterBar({
  search = "",
  onSearchChange,
  searchPlaceholder = fr.search,
  filters,
  activeCount = 0,
  onReset,
  actions,
  className,
}: FilterBarProps) {
  const isPhone = useIsPhone();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState(search);
  const debounced = useDebounce(draft, searchDebounceMs);

  useEffect(() => {
    if (debounced !== search) {
      onSearchChange?.(debounced);
    }
    // The page owns `search`; only the debounced draft triggers a change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const filtersBlock = filters ? (
    <div className={styles.filters}>{filters}</div>
  ) : null;
  const resetButton = onReset ? (
    <Button variant="link" size="sm" onClick={onReset} leftIcon={<X />}>
      {fr.reset}
    </Button>
  ) : null;

  return (
    <div className={cx(styles.root, className)} role="search">
      <div className={styles.searchRow}>
        {onSearchChange ? (
          <TextInput
            type="search"
            aria-label={fr.search}
            placeholder={searchPlaceholder}
            prefix={<Search />}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className={styles.search}
          />
        ) : null}
        {isPhone && filters ? (
          <Button
            variant="secondary"
            leftIcon={<SlidersHorizontal />}
            onClick={() => setSheetOpen(true)}
          >
            {fr.filters}
            {activeCount > 0 ? <Badge tone="info">{activeCount}</Badge> : null}
          </Button>
        ) : null}
        {actions}
      </div>
      {!isPhone ? (
        <div className={styles.desktopFilters}>
          {filtersBlock}
          {activeCount > 0 ? resetButton : null}
        </div>
      ) : null}
      {isPhone ? (
        <Sheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          side="bottom"
          title={fr.filters}
          footer={
            <>
              {resetButton}
              <Button onClick={() => setSheetOpen(false)}>{fr.apply}</Button>
            </>
          }
        >
          {filtersBlock}
        </Sheet>
      ) : null}
    </div>
  );
}
