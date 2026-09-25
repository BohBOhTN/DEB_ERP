import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "../../../lib/cx.js";
import styles from "./Card.module.css";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /// `muted` for secondary surfaces, `inverse` for the featured navy tile.
  tone?: "default" | "muted" | "inverse";
  padding?: "none" | "default";
}

export function Card({
  tone = "default",
  padding = "default",
  className,
  ...rest
}: CardProps) {
  return (
    <div
      className={cx(
        styles.root,
        styles[tone],
        padding === "none" && styles.noPadding,
        className,
      )}
      {...rest}
    />
  );
}

export interface CardHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /// Heading level for the title; `h2` on a page, `h3` inside a section.
  as?: "h2" | "h3" | "h4";
  className?: string;
}

export function CardHeader({
  title,
  description,
  actions,
  as: Heading = "h2",
  className,
}: CardHeaderProps) {
  return (
    <div className={cx(styles.header, className)}>
      <div className={styles.headerText}>
        <Heading className={styles.title}>{title}</Heading>
        {description ? (
          <p className={styles.description}>{description}</p>
        ) : null}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  );
}

export function CardBody({
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx(styles.body, className)} {...rest} />;
}

export function CardFooter({
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx(styles.footer, className)} {...rest} />;
}
