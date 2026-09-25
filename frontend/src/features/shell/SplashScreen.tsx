import { Skeleton } from "../../components/ui/Skeleton/Skeleton.js";
import { fr } from "../../i18n/fr.js";
import styles from "./SplashScreen.module.css";

/// Full-page brand splash while `GET /auth/me` runs (06 section 3.1).
export function SplashScreen() {
  return (
    <div
      className={styles.root}
      role="status"
      aria-live="polite"
      aria-label={fr.loading}
    >
      <img
        src="/assets/dar-el-barka-logo-192.webp"
        alt=""
        width={72}
        height={72}
        className={styles.logo}
      />
      <p className={styles.name}>{fr.appName}</p>
      <div className={styles.lines}>
        <Skeleton width={180} />
        <Skeleton width={120} />
      </div>
    </div>
  );
}
