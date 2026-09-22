/// Points `matchMedia` at one of the review widths for a test: the
/// components read breakpoints only through `useMediaQuery`.
export function mockViewport(width: number): void {
  window.matchMedia = (query: string) => {
    const min = /min-width:\s*(\d+)px/.exec(query);
    const max = /max-width:\s*(\d+)px/.exec(query);
    const matches =
      (min ? width >= Number(min[1]) : true) &&
      (max ? width <= Number(max[1]) : true);

    return {
      matches,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    } as MediaQueryList;
  };
}
