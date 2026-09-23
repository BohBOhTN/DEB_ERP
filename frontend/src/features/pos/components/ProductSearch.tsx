import { forwardRef } from "react";
import { SegmentedControl } from "../../../components/ui/SegmentedControl/SegmentedControl.js";
import { TextInput } from "../../../components/ui/TextInput/TextInput.js";
import styles from "./PosComponents.module.css";

export interface ProductSearchProps {
  query: string;
  onQueryChange: (query: string) => void;
  categories: Array<{ id: string; name: string }>;
  categoryId: string;
  onCategoryChange: (categoryId: string) => void;
}

/// Search box and category chips (07 section 4.6): the box is focused on
/// mount by the page (never through `autoFocus`); chips come from the
/// categories present in the loaded products, so no extra permission is
/// needed at the till.
export const ProductSearch = forwardRef<HTMLInputElement, ProductSearchProps>(
  function ProductSearch(
    { query, onQueryChange, categories, categoryId, onCategoryChange },
    ref,
  ) {
    return (
      <div className={styles.search}>
        <TextInput
          ref={ref}
          type="search"
          aria-label="Rechercher un produit"
          placeholder="Rechercher un produit (nom, code, code-barres)"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
        {categories.length > 1 ? (
          <div className={styles.chips}>
            <SegmentedControl
              label="Catégorie"
              size="sm"
              value={categoryId || "all"}
              onValueChange={(value) =>
                onCategoryChange(value === "all" ? "" : value)
              }
              options={[
                { value: "all", label: "Toutes" },
                ...categories.map((category) => ({
                  value: category.id,
                  label: category.name,
                })),
              ]}
            />
          </div>
        ) : null}
      </div>
    );
  },
);
