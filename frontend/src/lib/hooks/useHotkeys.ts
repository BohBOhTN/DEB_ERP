import { useEffect } from "react";

export interface Hotkey {
  /// `KeyboardEvent.key` value: "/", "F2", "F9", "Escape", "Enter".
  key: string;
  handler: (event: KeyboardEvent) => void;
  /// Fire even when a text field has focus (default: only for function keys).
  inInputs?: boolean;
}

/// Desktop keyboard shortcuts for the POS (07 section 4.6). Plain keys are
/// ignored while typing in a field so "/" in a note does not steal focus;
/// function keys always fire. Nothing fires while a dialog is open.
export function useHotkeys(hotkeys: Hotkey[], enabled = true): void {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const typing = Boolean(
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable),
      );

      for (const hotkey of hotkeys) {
        if (event.key !== hotkey.key) continue;
        const functionKey = /^F\d+$/.test(hotkey.key);
        if (typing && !functionKey && !hotkey.inInputs) continue;
        event.preventDefault();
        hotkey.handler(event);
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hotkeys, enabled]);
}
