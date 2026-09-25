import { CircleDot, Store } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "../../../lib/cx.js";
import { formatMoney, formatTime } from "../../../i18n/format.js";
import { fr } from "../../../i18n/fr.js";
import styles from "./SessionBanner.module.css";

export interface OpenSessionSummary {
  openedAt: string | Date;
  cashierName: string;
  terminalName?: string;
  openingCashTnd?: string;
}

export interface SessionBannerProps {
  session: OpenSessionSummary | null;
  action?: ReactNode;
  className?: string;
}

/// POS session status: who opened the till and when, or the call to open it.
export function SessionBanner({
  session,
  action,
  className,
}: SessionBannerProps) {
  return (
    <div
      className={cx(
        styles.root,
        session ? styles.open : styles.closed,
        className,
      )}
      role="status"
    >
      <span className={styles.icon} aria-hidden="true">
        {session ? <CircleDot /> : <Store />}
      </span>
      <div className={styles.text}>
        {session ? (
          <>
            <strong>{fr.openSession}</strong>
            <span>
              depuis {formatTime(session.openedAt)} par {session.cashierName}
              {session.terminalName ? ` · ${session.terminalName}` : ""}
              {session.openingCashTnd
                ? ` · fonds ${formatMoney(session.openingCashTnd)}`
                : ""}
            </span>
          </>
        ) : (
          <>
            <strong>{fr.noOpenSession}</strong>
            <span>Ouvrez la caisse pour enregistrer des ventes.</span>
          </>
        )}
      </div>
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
