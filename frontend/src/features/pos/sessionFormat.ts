import type { PosSession } from "./pos.api.js";
import styles from "./pages/PosPages.module.css";

/// A cash difference in colour: a surplus in green, a shortage in red,
/// nothing for an exact count.
export function differenceClass(
  value: string | null | undefined,
): string | undefined {
  const number = Number(value ?? 0);
  return number === 0
    ? undefined
    : number > 0
      ? styles.positive
      : styles.negative;
}

/// How long the till stayed open: "11 h 30", "45 min", or still running.
export function sessionDuration(
  session: Pick<PosSession, "openedAt" | "closedAt">,
  now = new Date(),
): string {
  const end = session.closedAt ? new Date(session.closedAt) : now;
  const minutes = Math.max(
    0,
    Math.round((end.getTime() - new Date(session.openedAt).getTime()) / 60_000),
  );
  const hours = Math.floor(minutes / 60);
  const rest = String(minutes % 60).padStart(2, "0");

  return hours === 0 ? `${minutes} min` : `${hours} h ${rest}`;
}
