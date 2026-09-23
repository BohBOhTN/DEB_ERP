import type { ComponentType } from "react";
import type { CurrentUser } from "../auth/authApi";
import "../../styles/global.css";
import styles from "./LegacyScreen.module.css";
import { useSessionUser } from "./useSessionUser.js";

export interface LegacyScreenProps {
  /// A V1 `*Management` component; it receives the session user as before.
  screen: ComponentType<{ user: CurrentUser }>;
}

/// Mounts a V1 screen inside the new shell (ADR-V2-003 step 2). The V1
/// stylesheet is imported here and scoped to `.legacy-screen` by the build
/// (see `vite.config.ts`), so it cannot restyle the shell around it.
export function LegacyScreen({ screen: Screen }: LegacyScreenProps) {
  const user = useSessionUser();

  return (
    <div className={`legacy-screen ${styles.root}`}>
      <Screen user={user} />
    </div>
  );
}
