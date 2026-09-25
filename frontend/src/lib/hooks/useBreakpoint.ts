import { useMediaQuery } from "./useMediaQuery.js";

/// The V1 responsive contract (05 section 2.4), mirrored from `tokens.css`.
export const breakpoints = {
  tablet: 600,
  desktop: 900,
  wide: 1280,
} as const;

export type Breakpoint = "phone" | "tablet" | "desktop" | "wide";

export function useBreakpoint(): Breakpoint {
  const tablet = useMediaQuery(`(min-width: ${breakpoints.tablet}px)`);
  const desktop = useMediaQuery(`(min-width: ${breakpoints.desktop}px)`);
  const wide = useMediaQuery(`(min-width: ${breakpoints.wide}px)`);

  if (wide) {
    return "wide";
  }

  if (desktop) {
    return "desktop";
  }

  return tablet ? "tablet" : "phone";
}

export function useIsPhone(): boolean {
  return !useMediaQuery(`(min-width: ${breakpoints.tablet}px)`);
}

export function useIsDesktop(): boolean {
  return useMediaQuery(`(min-width: ${breakpoints.desktop}px)`);
}
