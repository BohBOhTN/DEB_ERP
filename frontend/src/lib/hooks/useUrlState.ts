import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

type Primitive = string | number | boolean | undefined;

/// List state lives in the URL (06 section 3.3): `?page=2&q=farine&sort=name:asc`.
/// `set` merges a patch, drops keys equal to their default or empty, and
/// replaces the history entry so typing in a search box does not pollute
/// the back button.
export function useUrlState<TState extends Record<string, Primitive>>(
  defaults: TState,
): [TState, (patch: Partial<TState>, options?: { replace?: boolean }) => void] {
  const [searchParams, setSearchParams] = useSearchParams();

  const state = useMemo(() => {
    const next = { ...defaults };

    for (const key of Object.keys(defaults) as Array<keyof TState>) {
      const raw = searchParams.get(String(key));

      if (raw === null) {
        continue;
      }

      const fallback = defaults[key];

      if (typeof fallback === "number") {
        const parsed = Number(raw);
        next[key] = (
          Number.isFinite(parsed) ? parsed : fallback
        ) as TState[keyof TState];
      } else if (typeof fallback === "boolean") {
        next[key] = (raw === "true") as TState[keyof TState];
      } else {
        next[key] = raw as TState[keyof TState];
      }
    }

    return next;
  }, [defaults, searchParams]);

  const set = useCallback(
    (
      patch: Partial<TState>,
      options: { replace?: boolean } = { replace: true },
    ) => {
      const params = new URLSearchParams(searchParams);

      for (const [key, value] of Object.entries(patch)) {
        const fallback = defaults[key as keyof TState];

        if (value === undefined || value === "" || value === fallback) {
          params.delete(key);
        } else {
          params.set(key, String(value));
        }
      }

      setSearchParams(params, { replace: options.replace ?? true });
    },
    [defaults, searchParams, setSearchParams],
  );

  return [state, set];
}
