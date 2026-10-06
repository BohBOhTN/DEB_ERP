import { Plus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "../../../components/ui/Button/Button.js";
import { IconButton } from "../../../components/ui/IconButton/IconButton.js";
import { MoneyInput } from "../../../components/ui/MoneyInput/MoneyInput.js";
import { Select } from "../../../components/ui/Select/Select.js";
import { TextInput } from "../../../components/ui/TextInput/TextInput.js";
import { categoryLabel, type ExpenseCategory } from "../expenses.api.js";
import styles from "./ExpenseLineEditor.module.css";

/// One of the other goods bought on a shopping trip (issue 018).
export interface ExpenseEditorLine {
  key: string;
  categoryId: string | null;
  description: string;
  amountTnd: string;
}

export interface ExpenseLineEditorProps {
  lines: ExpenseEditorLine[];
  onChange: (lines: ExpenseEditorLine[]) => void;
  /// The active categories, in tree order with their path.
  categories: ExpenseCategory[];
  /// Keyed `expenses.N.field`, the way the form and the server name them.
  errors?: Record<string, string | undefined>;
  disabled?: boolean;
  /// Extra content under the lines (a subtotal).
  footer?: ReactNode;
}

let keySequence = 0;

export function newExpenseLine(): ExpenseEditorLine {
  keySequence += 1;
  return {
    key: `expense-line-${keySequence}`,
    categoryId: null,
    description: "",
    amountTnd: "",
  };
}

/// Category, label and amount per line: the plastic bags and napkins of a
/// trip, paid on the spot, that neither enter stock nor the supplier's
/// account. The category picker prints the path of a sub-category.
export function ExpenseLineEditor({
  lines,
  onChange,
  categories,
  errors = {},
  disabled = false,
  footer,
}: ExpenseLineEditorProps) {
  const update = (key: string, patch: Partial<ExpenseEditorLine>) =>
    onChange(
      lines.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  const remove = (key: string) =>
    onChange(lines.filter((line) => line.key !== key));
  const options = categories.map((category) => ({
    value: category.id,
    label: categoryLabel(category),
  }));

  return (
    <div className={styles.root}>
      {lines.length > 0 ? (
        <div className={styles.header} aria-hidden="true">
          <span>Catégorie</span>
          <span>Libellé</span>
          <span className={styles.right}>Montant</span>
          <span />
        </div>
      ) : null}
      {lines.length === 0 ? (
        <p className={styles.empty}>
          Aucun autre achat. Ajoutez-en un si le ticket en comporte.
        </p>
      ) : null}
      <ul className={styles.lines}>
        {lines.map((line, index) => {
          const errorFor = (field: string) =>
            errors[`expenses.${index}.${field}`];
          const position = index + 1;

          return (
            <li key={line.key} className={styles.line}>
              <div className={styles.cell}>
                <span className={styles.mobileLabel} aria-hidden="true">
                  Catégorie
                </span>
                <Select
                  aria-label={`Catégorie ${position}`}
                  placeholder="Choisir une catégorie"
                  value={line.categoryId}
                  onValueChange={(value) =>
                    update(line.key, { categoryId: value })
                  }
                  options={options}
                  invalid={Boolean(errorFor("categoryId"))}
                  disabled={disabled}
                />
                {errorFor("categoryId") ? (
                  <p className={styles.error}>{errorFor("categoryId")}</p>
                ) : null}
              </div>
              <div className={styles.cell}>
                <span className={styles.mobileLabel} aria-hidden="true">
                  Libellé
                </span>
                <TextInput
                  aria-label={`Libellé ${position}`}
                  placeholder="Sachets plastiques"
                  value={line.description}
                  onChange={(event) =>
                    update(line.key, { description: event.target.value })
                  }
                  invalid={Boolean(errorFor("description"))}
                  disabled={disabled}
                />
                {errorFor("description") ? (
                  <p className={styles.error}>{errorFor("description")}</p>
                ) : null}
              </div>
              <div className={styles.cell}>
                <span className={styles.mobileLabel} aria-hidden="true">
                  Montant
                </span>
                <MoneyInput
                  aria-label={`Montant ${position}`}
                  value={line.amountTnd}
                  onChange={(value) => update(line.key, { amountTnd: value })}
                  invalid={Boolean(errorFor("amountTnd"))}
                  disabled={disabled}
                />
                {errorFor("amountTnd") ? (
                  <p className={styles.error}>{errorFor("amountTnd")}</p>
                ) : null}
              </div>
              <div className={styles.remove}>
                <IconButton
                  label={`Retirer la dépense ${position}`}
                  icon={<Trash2 />}
                  size="sm"
                  onClick={() => remove(line.key)}
                  disabled={disabled}
                />
              </div>
            </li>
          );
        })}
      </ul>
      {errors.expenses ? (
        <p className={styles.error}>{errors.expenses}</p>
      ) : null}
      <div className={styles.footer}>
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<Plus />}
          onClick={() => onChange([...lines, newExpenseLine()])}
          disabled={disabled}
        >
          Ajouter une dépense
        </Button>
        {footer}
      </div>
    </div>
  );
}
