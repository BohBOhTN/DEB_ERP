import * as Popover from "@radix-ui/react-popover";
import { Command } from "cmdk";
import { Check, ChevronDown, Plus, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cx } from "../../../lib/cx.js";
import { useDebounce } from "../../../lib/hooks/useDebounce.js";
import { fr } from "../../../i18n/fr.js";
import { useFormField } from "../FormField/FormField.js";
import { Spinner } from "../Spinner/Spinner.js";
import styles from "./Combobox.module.css";

export interface ComboboxOption {
  value: string;
  label: string;
  description?: string;
}

export interface ComboboxProps<
  TOption extends ComboboxOption = ComboboxOption,
> {
  /// Loads options for a query; called after a 250 ms debounce and once on
  /// open with an empty query.
  loadOptions: (query: string) => Promise<TOption[]>;
  value: TOption | null;
  onChange: (option: TOption | null) => void;
  renderOption?: (option: TOption) => ReactNode;
  placeholder?: string;
  emptyText?: string;
  /// When set, a "Créer « query »" item appears at the end of the list.
  createLabel?: string;
  onCreate?: (query: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  clearable?: boolean;
  id?: string;
  "aria-label"?: string;
  className?: string;
}

/// Async searchable select (05 section 3.1): Radix Popover for placement and
/// focus, cmdk for the keyboard-navigable list. Options come from the server
/// with `q`, so the list never holds more than one page.
export function Combobox<TOption extends ComboboxOption = ComboboxOption>({
  loadOptions,
  value,
  onChange,
  renderOption,
  placeholder = fr.search,
  emptyText = fr.noResults,
  createLabel,
  onCreate,
  disabled,
  invalid,
  clearable = true,
  id,
  className,
  ...rest
}: ComboboxProps<TOption>) {
  const field = useFormField();
  const isInvalid = invalid ?? field?.invalid ?? false;
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // The last completed load, keyed by its query: "loading" is derived from
  // whether it matches the debounced query, so the effect never sets state
  // synchronously.
  const [result, setResult] = useState<{
    query: string;
    options: TOption[];
  } | null>(null);
  const debouncedQuery = useDebounce(query, 250);
  const requestId = useRef(0);
  const options = result?.options ?? [];
  const loading = open && result?.query !== debouncedQuery;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const current = ++requestId.current;
    loadOptions(debouncedQuery)
      .then((loaded) => {
        if (current === requestId.current) {
          setResult({ query: debouncedQuery, options: loaded });
        }
      })
      .catch(() => {
        if (current === requestId.current) {
          setResult({ query: debouncedQuery, options: [] });
        }
      });
  }, [open, debouncedQuery, loadOptions]);

  const select = (option: TOption | null) => {
    onChange(option);
    setOpen(false);
    setQuery("");
    triggerRef.current?.focus();
  };

  const trimmedQuery = query.trim();
  const canCreate =
    Boolean(createLabel && onCreate && trimmedQuery) &&
    !options.some(
      (option) => option.label.toLowerCase() === trimmedQuery.toLowerCase(),
    );

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <div className={cx(styles.root, className)}>
        <Popover.Trigger asChild>
          <button
            ref={triggerRef}
            type="button"
            role="combobox"
            id={id ?? field?.id}
            aria-expanded={open}
            aria-controls={listId}
            aria-haspopup="listbox"
            aria-invalid={isInvalid || undefined}
            aria-required={field?.required || undefined}
            aria-describedby={field?.describedBy}
            aria-label={rest["aria-label"]}
            disabled={disabled}
            className={cx(
              styles.trigger,
              isInvalid && styles.invalid,
              !value && styles.placeholder,
            )}
          >
            <span className={styles.value}>
              {value ? value.label : placeholder}
            </span>
            <ChevronDown className={styles.chevron} aria-hidden="true" />
          </button>
        </Popover.Trigger>
        {clearable && value && !disabled ? (
          <button
            type="button"
            className={styles.clear}
            aria-label={fr.clear}
            onClick={() => onChange(null)}
          >
            <X />
          </button>
        ) : null}
      </div>
      <Popover.Portal>
        <Popover.Content
          className={styles.content}
          align="start"
          sideOffset={4}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            searchRef.current?.focus();
          }}
        >
          <Command
            shouldFilter={false}
            label={rest["aria-label"] ?? placeholder}
            className={styles.command}
          >
            <div className={styles.searchRow}>
              <Command.Input
                ref={searchRef}
                value={query}
                onValueChange={setQuery}
                placeholder={placeholder}
                className={styles.search}
              />
              {loading ? <Spinner size={16} label={fr.loading} /> : null}
            </div>
            <Command.List id={listId} className={styles.list}>
              {!loading && options.length === 0 && !canCreate ? (
                <Command.Empty className={styles.empty}>
                  {emptyText}
                </Command.Empty>
              ) : null}
              {options.map((option) => (
                <Command.Item
                  key={option.value}
                  value={option.value}
                  onSelect={() => select(option)}
                  className={styles.item}
                >
                  <span className={styles.itemBody}>
                    {renderOption ? (
                      renderOption(option)
                    ) : (
                      <>
                        <span>{option.label}</span>
                        {option.description ? (
                          <span className={styles.itemDescription}>
                            {option.description}
                          </span>
                        ) : null}
                      </>
                    )}
                  </span>
                  {value?.value === option.value ? (
                    <Check className={styles.check} aria-hidden="true" />
                  ) : null}
                </Command.Item>
              ))}
              {canCreate ? (
                <Command.Item
                  value={`__create__${trimmedQuery}`}
                  onSelect={() => {
                    onCreate?.(trimmedQuery);
                    setOpen(false);
                  }}
                  className={cx(styles.item, styles.create)}
                >
                  <Plus aria-hidden="true" />
                  <span>
                    {createLabel} « {trimmedQuery} »
                  </span>
                </Command.Item>
              ) : null}
            </Command.List>
          </Command>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
