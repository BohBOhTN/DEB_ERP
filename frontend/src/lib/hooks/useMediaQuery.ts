import { useSyncExternalStore } from "react";

/// Subscribes to a media query; false during server rendering and in
/// environments without `matchMedia` (jsdom), unless a test stubs it.
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === "undefined" || !window.matchMedia) {
        return () => {};
      }

      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);

      return () => media.removeEventListener("change", onChange);
    },
    () =>
      typeof window !== "undefined" && window.matchMedia
        ? window.matchMedia(query).matches
        : false,
    () => false,
  );
}
