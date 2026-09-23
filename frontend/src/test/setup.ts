import "@testing-library/jest-dom/vitest";
import { transferableAbortController } from "node:util";
import { cleanup, configure } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./msw/server.js";

// jsdom replaces AbortController with its own realm's class while fetch and
// Request stay Node's; react-router builds a Request with that controller on
// every navigation and Node refuses the foreign signal. Restore the native
// classes so both sides agree.
globalThis.AbortController = transferableAbortController()
  .constructor as typeof AbortController;
globalThis.AbortSignal = new Request("http://localhost").signal
  .constructor as typeof AbortSignal;

// A page renders after the session, the route guard, the lazy chunk and its
// list query; on a loaded CI runner that can exceed the library's default
// one-second wait, which is not a product signal.
configure({ asyncUtilTimeout: 4000 });

beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());

// jsdom has no matchMedia; components read breakpoints through it.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

// Radix primitives call these in jsdom.
if (typeof window !== "undefined") {
  window.HTMLElement.prototype.scrollIntoView ??= () => {};
  window.HTMLElement.prototype.hasPointerCapture ??= () => false;
  window.HTMLElement.prototype.releasePointerCapture ??= () => {};
  if (!("ResizeObserver" in window)) {
    class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    (window as unknown as { ResizeObserver: unknown }).ResizeObserver =
      ResizeObserverStub;
  }
}
