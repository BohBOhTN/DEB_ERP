import type { ReactNode } from "react";
import { cx } from "../../../lib/cx.js";
import { formatDateTime, formatRelative } from "../../../i18n/format.js";
import styles from "./Timeline.module.css";

export interface TimelineEvent {
  id: string;
  at: string | Date;
  actor?: string | null;
  title: ReactNode;
  description?: ReactNode;
  badge?: ReactNode;
  icon?: ReactNode;
  href?: string;
}

export interface TimelineProps {
  title: string;
  events: TimelineEvent[];
  /// `relative` for `Accueil` ("il y a 5 min"), `absolute` elsewhere.
  timeFormat?: "relative" | "absolute";
  className?: string;
}

/// Audit trail and recent activity (05 section 3.2).
export function Timeline({
  title,
  events,
  timeFormat = "absolute",
  className,
}: TimelineProps) {
  return (
    <ol className={cx(styles.root, className)} aria-label={title}>
      {events.map((event) => (
        <li key={event.id} className={styles.item}>
          <span className={styles.marker} aria-hidden="true">
            {event.icon}
          </span>
          <div className={styles.body}>
            <div className={styles.row}>
              <span className={styles.title}>
                {event.href ? (
                  <a href={event.href}>{event.title}</a>
                ) : (
                  event.title
                )}
              </span>
              {event.badge}
            </div>
            {event.description ? (
              <p className={styles.description}>{event.description}</p>
            ) : null}
            <p className={styles.meta}>
              <time
                dateTime={new Date(event.at).toISOString()}
                title={formatDateTime(event.at)}
              >
                {timeFormat === "relative"
                  ? formatRelative(event.at)
                  : formatDateTime(event.at)}
              </time>
              {event.actor ? <span> · {event.actor}</span> : null}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
