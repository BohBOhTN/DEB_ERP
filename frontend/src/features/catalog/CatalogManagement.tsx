import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import type { ApiError, CurrentUser } from "../auth/authApi";
import {
  createCategory,
  createProduct,
  createRawMaterial,
  createUnit,
  getCategories,
  getProducts,
  getRawMaterials,
  getUnits,
  setProductActivation,
  setRawMaterialActivation,
  updateCategory,
  updateUnit,
  type Category,
  type Product,
  type RawMaterial,
  type Unit,
} from "./catalogApi";

interface CatalogManagementProps {
  user: CurrentUser;
}

type LoadState =
  | { status: "loading" }
  | {
      status: "loaded";
      units: Unit[];
      categories: Category[];
      products: Product[];
      rawMaterials: RawMaterial[];
    }
  | { status: "error"; message: string };

type CatalogTab = "products" | "rawMaterials" | "categories" | "units";

export function CatalogManagement({ user }: CatalogManagementProps) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [activeTab, setActiveTab] = useState<CatalogTab>("products");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [categoryForm, setCategoryForm] = useState({
    name: "",
    description: "",
  });
  const [unitForm, setUnitForm] = useState({
    code: "",
    name: "",
    symbol: "",
    precision: "3",
  });
  const [rawMaterialForm, setRawMaterialForm] = useState({
    code: "",
    name: "",
    category: "",
    baseUnitId: "",
    notes: "",
  });
  const [productForm, setProductForm] = useState({
    code: "",
    barcode: "",
    name: "",
    categoryId: "",
    baseUnitId: "",
    salePriceTnd: "",
    isStockable: true,
    notes: "",
  });

  const permissions = useMemo(
    () => new Set(user.effectivePermissions),
    [user.effectivePermissions],
  );
  const canViewCatalog =
    permissions.has("products.view") ||
    permissions.has("raw_materials.view") ||
    permissions.has("categories.view") ||
    permissions.has("units.view");
  const canCreateProducts = permissions.has("products.create");
  const canActivateProducts = permissions.has("products.activate");
  const canCreateRawMaterials = permissions.has("raw_materials.create");
  const canActivateRawMaterials = permissions.has("raw_materials.activate");
  const canManageCategories = permissions.has("categories.manage");
  const canManageUnits = permissions.has("units.manage");
  const visibleTabs = useMemo(
    () => catalogTabs.filter((tab) => permissions.has(tab.view)),
    [permissions],
  );

  useEffect(() => {
    if (!canViewCatalog) {
      setState({
        status: "error",
        message: "Vous n'avez pas acces au catalogue.",
      });
      return;
    }
    if (!visibleTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(visibleTabs[0]?.id ?? "products");
    }

    let isMounted = true;
    refreshCatalog()
      .then((workspace) => {
        if (!isMounted) {
          return;
        }
        setState(workspace);
      })
      .catch((error: ApiError) => {
        if (isMounted) {
          setState({
            status: "error",
            message:
              error.error?.message ?? "Impossible de charger le catalogue.",
          });
        }
      });

    return () => {
      isMounted = false;
    };
  }, [activeTab, canViewCatalog, visibleTabs]);

  async function refreshCatalog(): Promise<LoadState> {
    const [units, categories, products, rawMaterials] = await Promise.all([
      permissions.has("units.view")
        ? getUnits()
        : Promise.resolve(emptyPage<Unit>()),
      permissions.has("categories.view")
        ? getCategories()
        : Promise.resolve(emptyPage<Category>()),
      permissions.has("products.view")
        ? getProducts()
        : Promise.resolve(emptyPage<Product>()),
      permissions.has("raw_materials.view")
        ? getRawMaterials()
        : Promise.resolve(emptyPage<RawMaterial>()),
    ]);

    return {
      status: "loaded",
      units: units.items,
      categories: categories.items,
      products: products.items,
      rawMaterials: rawMaterials.items,
    };
  }

  async function reload() {
    setState(await refreshCatalog());
  }

  async function handleCreateCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submit(async () => {
      await createCategory(categoryForm);
      setCategoryForm({ name: "", description: "" });
      setNotice("Categorie creee.");
    });
  }

  async function handleCreateUnit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submit(async () => {
      await createUnit({
        ...unitForm,
        precision: Number(unitForm.precision),
      });
      setUnitForm({ code: "", name: "", symbol: "", precision: "3" });
      setNotice("Unite creee.");
    });
  }

  async function handleCreateRawMaterial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submit(async () => {
      await createRawMaterial(rawMaterialForm);
      setRawMaterialForm({
        code: "",
        name: "",
        category: "",
        baseUnitId: "",
        notes: "",
      });
      setNotice("Matiere premiere creee.");
    });
  }

  async function handleCreateProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submit(async () => {
      await createProduct(productForm);
      setProductForm({
        code: "",
        barcode: "",
        name: "",
        categoryId: "",
        baseUnitId: "",
        salePriceTnd: "",
        isStockable: true,
        notes: "",
      });
      setNotice("Produit cree.");
    });
  }

  async function submit(action: () => Promise<void>) {
    setIsSubmitting(true);
    setNotice("");

    try {
      await action();
      await reload();
    } catch (error) {
      setNotice(readMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (state.status === "loading") {
    return <p aria-live="polite">Chargement du catalogue...</p>;
  }

  if (state.status === "error") {
    return <p role="alert">{state.message}</p>;
  }

  return (
    <section className="catalog-workspace" aria-labelledby="catalog-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Donnees de base</p>
          <h2 id="catalog-title">Catalogue</h2>
        </div>
        <p className="permission-count">
          {state.products.length} produits actifs ou historiques
        </p>
      </div>

      <nav className="tab-row" aria-label="Catalogue">
        {visibleTabs.map((tab) => (
          <button
            aria-pressed={activeTab === tab.id}
            className="module-button"
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {notice ? <p role="status">{notice}</p> : null}

      {activeTab === "products" ? (
        <section className="catalog-grid" aria-labelledby="products-title">
          {canCreateProducts ? (
            <form className="panel inline-form" onSubmit={handleCreateProduct}>
              <h3 id="products-title">Nouveau produit</h3>
              <input
                aria-label="Nom du produit"
                onChange={(event) =>
                  setProductForm({ ...productForm, name: event.target.value })
                }
                placeholder="Nom"
                required
                value={productForm.name}
              />
              <input
                aria-label="Code produit"
                onChange={(event) =>
                  setProductForm({ ...productForm, code: event.target.value })
                }
                placeholder="Code"
                value={productForm.code}
              />
              <input
                aria-label="Code-barres"
                onChange={(event) =>
                  setProductForm({
                    ...productForm,
                    barcode: event.target.value,
                  })
                }
                placeholder="Code-barres"
                value={productForm.barcode}
              />
              <select
                aria-label="Categorie du produit"
                onChange={(event) =>
                  setProductForm({
                    ...productForm,
                    categoryId: event.target.value,
                  })
                }
                required
                value={productForm.categoryId}
              >
                <option value="">Categorie</option>
                {state.categories
                  .filter((category) => category.isActive)
                  .map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
              </select>
              <select
                aria-label="Unite de vente"
                onChange={(event) =>
                  setProductForm({
                    ...productForm,
                    baseUnitId: event.target.value,
                  })
                }
                required
                value={productForm.baseUnitId}
              >
                <option value="">Unite</option>
                {state.units
                  .filter((unit) => unit.isActive)
                  .map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name}
                    </option>
                  ))}
              </select>
              <input
                aria-label="Prix de vente TND"
                inputMode="decimal"
                onChange={(event) =>
                  setProductForm({
                    ...productForm,
                    salePriceTnd: event.target.value,
                  })
                }
                placeholder="Prix TND"
                required
                value={productForm.salePriceTnd}
              />
              <label className="check-row">
                <input
                  checked={productForm.isStockable}
                  onChange={(event) =>
                    setProductForm({
                      ...productForm,
                      isStockable: event.target.checked,
                    })
                  }
                  type="checkbox"
                />
                <span>Suivi en stock</span>
              </label>
              <button disabled={isSubmitting} type="submit">
                Creer le produit
              </button>
            </form>
          ) : null}
          <CatalogList
            items={state.products}
            renderItem={(product) => (
              <>
                <span>{product.name}</span>
                <small>
                  {product.salePriceTnd} TND · {product.category.name}
                </small>
              </>
            )}
            toggleLabel={(product) =>
              product.isActive ? "Desactiver" : "Activer"
            }
            canToggle={canActivateProducts}
            onToggle={(product) =>
              submit(async () => {
                await setProductActivation(product);
                setNotice(
                  product.isActive ? "Produit desactive." : "Produit active.",
                );
              })
            }
          />
        </section>
      ) : null}

      {activeTab === "rawMaterials" ? (
        <section className="catalog-grid" aria-labelledby="materials-title">
          {canCreateRawMaterials ? (
            <form
              className="panel inline-form"
              onSubmit={handleCreateRawMaterial}
            >
              <h3 id="materials-title">Nouvelle matiere premiere</h3>
              <input
                aria-label="Nom de la matiere premiere"
                onChange={(event) =>
                  setRawMaterialForm({
                    ...rawMaterialForm,
                    name: event.target.value,
                  })
                }
                placeholder="Nom"
                required
                value={rawMaterialForm.name}
              />
              <input
                aria-label="Code matiere premiere"
                onChange={(event) =>
                  setRawMaterialForm({
                    ...rawMaterialForm,
                    code: event.target.value,
                  })
                }
                placeholder="Code"
                value={rawMaterialForm.code}
              />
              <input
                aria-label="Famille"
                onChange={(event) =>
                  setRawMaterialForm({
                    ...rawMaterialForm,
                    category: event.target.value,
                  })
                }
                placeholder="Famille"
                value={rawMaterialForm.category}
              />
              <select
                aria-label="Unite de base"
                onChange={(event) =>
                  setRawMaterialForm({
                    ...rawMaterialForm,
                    baseUnitId: event.target.value,
                  })
                }
                required
                value={rawMaterialForm.baseUnitId}
              >
                <option value="">Unite de base</option>
                {state.units
                  .filter((unit) => unit.isActive)
                  .map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name}
                    </option>
                  ))}
              </select>
              <button disabled={isSubmitting} type="submit">
                Creer la matiere
              </button>
            </form>
          ) : null}
          <CatalogList
            items={state.rawMaterials}
            renderItem={(material) => (
              <>
                <span>{material.name}</span>
                <small>{material.baseUnit.name}</small>
              </>
            )}
            toggleLabel={(material) =>
              material.isActive ? "Desactiver" : "Activer"
            }
            canToggle={canActivateRawMaterials}
            onToggle={(material) =>
              submit(async () => {
                await setRawMaterialActivation(material);
                setNotice(
                  material.isActive
                    ? "Matiere desactivee."
                    : "Matiere activee.",
                );
              })
            }
          />
        </section>
      ) : null}

      {activeTab === "categories" ? (
        <section className="catalog-grid" aria-labelledby="categories-title">
          {canManageCategories ? (
            <form className="panel inline-form" onSubmit={handleCreateCategory}>
              <h3 id="categories-title">Nouvelle categorie</h3>
              <input
                aria-label="Nom de la categorie"
                onChange={(event) =>
                  setCategoryForm({ ...categoryForm, name: event.target.value })
                }
                placeholder="Nom"
                required
                value={categoryForm.name}
              />
              <input
                aria-label="Description de la categorie"
                onChange={(event) =>
                  setCategoryForm({
                    ...categoryForm,
                    description: event.target.value,
                  })
                }
                placeholder="Description"
                value={categoryForm.description}
              />
              <button disabled={isSubmitting} type="submit">
                Creer la categorie
              </button>
            </form>
          ) : null}
          <CatalogList
            items={state.categories}
            renderItem={(category) => (
              <>
                <span>{category.name}</span>
                <small>{category.description ?? "Sans description"}</small>
              </>
            )}
            toggleLabel={(category) =>
              category.isActive ? "Desactiver" : "Activer"
            }
            canToggle={canManageCategories}
            onToggle={(category) =>
              submit(async () => {
                await updateCategory(category.id, {
                  isActive: !category.isActive,
                });
                setNotice(
                  category.isActive
                    ? "Categorie desactivee."
                    : "Categorie activee.",
                );
              })
            }
          />
        </section>
      ) : null}

      {activeTab === "units" ? (
        <section className="catalog-grid" aria-labelledby="units-title">
          {canManageUnits ? (
            <form className="panel inline-form" onSubmit={handleCreateUnit}>
              <h3 id="units-title">Nouvelle unite</h3>
              <input
                aria-label="Code unite"
                onChange={(event) =>
                  setUnitForm({ ...unitForm, code: event.target.value })
                }
                placeholder="Code"
                required
                value={unitForm.code}
              />
              <input
                aria-label="Nom unite"
                onChange={(event) =>
                  setUnitForm({ ...unitForm, name: event.target.value })
                }
                placeholder="Nom"
                required
                value={unitForm.name}
              />
              <input
                aria-label="Symbole unite"
                onChange={(event) =>
                  setUnitForm({ ...unitForm, symbol: event.target.value })
                }
                placeholder="Symbole"
                required
                value={unitForm.symbol}
              />
              <input
                aria-label="Precision"
                min="0"
                max="6"
                onChange={(event) =>
                  setUnitForm({ ...unitForm, precision: event.target.value })
                }
                type="number"
                value={unitForm.precision}
              />
              <button disabled={isSubmitting} type="submit">
                Creer l'unite
              </button>
            </form>
          ) : null}
          <CatalogList
            items={state.units}
            renderItem={(unit) => (
              <>
                <span>{unit.name}</span>
                <small>
                  {unit.symbol} · precision {unit.precision}
                </small>
              </>
            )}
            toggleLabel={(unit) => (unit.isActive ? "Desactiver" : "Activer")}
            canToggle={canManageUnits}
            onToggle={(unit) =>
              submit(async () => {
                await updateUnit(unit.id, { isActive: !unit.isActive });
                setNotice(
                  unit.isActive ? "Unite desactivee." : "Unite activee.",
                );
              })
            }
          />
        </section>
      ) : null}
    </section>
  );
}

function CatalogList<TItem extends { id: string; isActive: boolean }>(props: {
  items: TItem[];
  renderItem: (item: TItem) => ReactNode;
  toggleLabel: (item: TItem) => string;
  canToggle: boolean;
  onToggle: (item: TItem) => void;
}) {
  if (props.items.length === 0) {
    return (
      <section className="panel">
        <p className="summary">Aucune fiche trouvee.</p>
      </section>
    );
  }

  return (
    <section className="panel item-list" aria-label="Resultats">
      {props.items.map((item) => (
        <div className="catalog-row" key={item.id}>
          <div>{props.renderItem(item)}</div>
          <div className="button-row">
            <span className={item.isActive ? "status-active" : "status-muted"}>
              {item.isActive ? "Actif" : "Inactif"}
            </span>
            {props.canToggle ? (
              <button
                className="secondary-button"
                onClick={() => props.onToggle(item)}
                type="button"
              >
                {props.toggleLabel(item)}
              </button>
            ) : null}
          </div>
        </div>
      ))}
    </section>
  );
}

const catalogTabs: Array<{ id: CatalogTab; label: string; view: string }> = [
  { id: "products", label: "Produits", view: "products.view" },
  {
    id: "rawMaterials",
    label: "Matieres premieres",
    view: "raw_materials.view",
  },
  { id: "categories", label: "Categories", view: "categories.view" },
  { id: "units", label: "Unites", view: "units.view" },
];

function emptyPage<TItem>() {
  return {
    items: [] as TItem[],
    page: 1,
    pageSize: 25,
    total: 0,
    pageCount: 0,
  };
}

function readMessage(error: unknown): string {
  const apiError = error as ApiError;
  return (
    apiError.error?.message ?? "Une erreur est survenue. Veuillez reessayer."
  );
}
