import { SegmentedControl } from "../../../components/ui/SegmentedControl/SegmentedControl.js";
import { formatDateLong } from "../../../i18n/format.js";
import { fr } from "../../../i18n/fr.js";
import type { HomePeriod } from "../homePeriod.js";
import styles from "./GreetingBand.module.css";

export interface GreetingBandProps {
  displayName: string;
  date: Date;
  period: HomePeriod;
  onPeriodChange: (period: HomePeriod) => void;
}

/// Display serif greeting, the date in words and a thin gold rule: one of
/// the three places where ornament is allowed (05 section 1).
export function GreetingBand({
  displayName,
  date,
  period,
  onPeriodChange,
}: GreetingBandProps) {
  const firstName = displayName.trim().split(/\s+/)[0] ?? displayName;

  return (
    <header className={styles.root}>
      <div>
        <h1 className={styles.greeting}>Bonjour, {firstName}</h1>
        <p className={styles.date}>{capitalize(formatDateLong(date))}</p>
        <div className={styles.rule} aria-hidden="true" />
      </div>
      <SegmentedControl
        label="Période"
        value={period}
        onValueChange={onPeriodChange}
        options={[
          { value: "today", label: fr.today },
          { value: "yesterday", label: fr.yesterday },
        ]}
      />
    </header>
  );
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
