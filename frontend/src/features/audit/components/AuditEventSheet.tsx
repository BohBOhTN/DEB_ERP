import { Copy } from "lucide-react";
import { Link } from "react-router-dom";
import { KeyValueList } from "../../../components/patterns/KeyValueList/KeyValueList.js";
import { Button } from "../../../components/ui/Button/Button.js";
import { Sheet } from "../../../components/ui/Sheet/Sheet.js";
import { useToast } from "../../../components/ui/Toast/useToast.js";
import { cx } from "../../../lib/cx.js";
import { formatDateTime } from "../../../i18n/format.js";
import type { AuditEvent } from "../audit.api.js";
import { auditTargetHref } from "./auditLinks.js";
import styles from "./AuditEventSheet.module.css";

export interface AuditEventSheetProps {
  event: AuditEvent | null;
  onClose: () => void;
}

function flatten(value: unknown, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(
      value as Record<string, unknown>,
    )) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (child && typeof child === "object" && !Array.isArray(child)) {
        for (const [subKey, subValue] of flatten(child, path))
          out.set(subKey, subValue);
      } else {
        out.set(
          path,
          child === null || child === undefined
            ? "—"
            : Array.isArray(child)
              ? child.map(String).join(", ")
              : String(child),
        );
      }
    }
  } else if (value !== null && value !== undefined) {
    out.set(prefix || "valeur", String(value));
  }
  return out;
}

/// The story of one event (07 section 4.11): before and after side by side
/// with the changed keys highlighted, and the correlation id to copy.
export function AuditEventSheet({ event, onClose }: AuditEventSheetProps) {
  const toast = useToast();
  const before = flatten(event?.before);
  const after = flatten(event?.after);
  const keys = [...new Set([...before.keys(), ...after.keys()])];
  const href = event ? auditTargetHref(event.entity, event.targetId) : null;

  return (
    <Sheet
      open={event !== null}
      onOpenChange={(open) => !open && onClose()}
      title={event?.actionLabelFr ?? "Événement"}
      description={
        event
          ? `${event.entityLabelFr} · ${formatDateTime(event.createdAt)} · ${event.actor?.displayName ?? "Système"}`
          : undefined
      }
      side="right"
    >
      {event ? (
        <div className={styles.body}>
          <KeyValueList
            items={[
              {
                label: "Cible",
                value: href ? (
                  <Link to={href}>{event.entityLabelFr}</Link>
                ) : (
                  event.entityLabelFr
                ),
              },
              { label: "Raison", value: event.reason },
              {
                label: "Identifiant de corrélation",
                value: event.correlationId ? (
                  <span className={styles.correlation}>
                    <code>{event.correlationId}</code>
                    <Button
                      variant="ghost"
                      size="sm"
                      leftIcon={<Copy />}
                      onClick={() => {
                        void navigator.clipboard?.writeText(
                          event.correlationId ?? "",
                        );
                        toast.info("Identifiant copié");
                      }}
                    >
                      Copier
                    </Button>
                  </span>
                ) : null,
              },
            ]}
          />
          {keys.length > 0 ? (
            <div className={styles.scroller}>
              <table className={styles.diff} aria-label="Avant et après">
                <thead>
                  <tr>
                    <th scope="col">Champ</th>
                    <th scope="col">Avant</th>
                    <th scope="col">Après</th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map((key) => {
                    const changed = before.get(key) !== after.get(key);
                    return (
                      <tr key={key} className={cx(changed && styles.changed)}>
                        <th scope="row">{key}</th>
                        <td>{before.get(key) ?? "—"}</td>
                        <td>{after.get(key) ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={styles.muted}>
              Aucune valeur avant ou après n'a été enregistrée pour cet
              événement.
            </p>
          )}
        </div>
      ) : null}
    </Sheet>
  );
}
