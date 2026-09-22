import { AlertTriangle, ShieldOff, WifiOff } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "../../../lib/cx.js";
import { fr } from "../../../i18n/fr.js";
import { Button } from "../Button/Button.js";
import styles from "./ErrorState.module.css";

export interface ErrorStateProps {
  title: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  /// Shown in small muted text so support can find the request in the logs.
  correlationId?: string | null;
  /// `denied` swaps the icon and adds the link to `Accueil` (state 5);
  /// `network` for connection failures.
  variant?: "error" | "denied" | "network";
  homeHref?: string;
  action?: ReactNode;
  className?: string;
}

export function ErrorState({
  title,
  description,
  onRetry,
  retryLabel = fr.retry,
  correlationId,
  variant = "error",
  homeHref = "/",
  action,
  className,
}: ErrorStateProps) {
  const Icon =
    variant === "denied"
      ? ShieldOff
      : variant === "network"
        ? WifiOff
        : AlertTriangle;

  return (
    <div className={cx(styles.root, styles[variant], className)} role="alert">
      <div className={styles.icon} aria-hidden="true">
        <Icon />
      </div>
      <p className={styles.title}>{title}</p>
      {description ? <p className={styles.description}>{description}</p> : null}
      <div className={styles.actions}>
        {onRetry ? (
          <Button variant="secondary" onClick={onRetry}>
            {retryLabel}
          </Button>
        ) : null}
        {variant === "denied" ? (
          <a className={styles.homeLink} href={homeHref}>
            {fr.goHome}
          </a>
        ) : null}
        {action}
      </div>
      {correlationId ? (
        <p className={styles.correlation}>
          {fr.correlationId} : <code>{correlationId}</code>
        </p>
      ) : null}
    </div>
  );
}
