import { Lock, Store } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../../../components/patterns/PageHeader/PageHeader.js";
import { PermissionGate } from "../../../components/patterns/PermissionGate/PermissionGate.js";
import { SessionBanner } from "../../../components/patterns/SessionBanner/SessionBanner.js";
import { Button } from "../../../components/ui/Button/Button.js";
import { Card, CardHeader } from "../../../components/ui/Card/Card.js";
import { EmptyState } from "../../../components/ui/EmptyState/EmptyState.js";
import { ErrorState } from "../../../components/ui/ErrorState/ErrorState.js";
import { Sheet } from "../../../components/ui/Sheet/Sheet.js";
import { Skeleton } from "../../../components/ui/Skeleton/Skeleton.js";
import { useToast } from "../../../components/ui/Toast/useToast.js";
import { describeError } from "../../../i18n/errors.js";
import { formatMoney } from "../../../i18n/format.js";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog/ConfirmDialog.js";
import { useConfirm } from "../../../lib/hooks/useConfirm.js";
import { useDebounce } from "../../../lib/hooks/useDebounce.js";
import { useIsPhone } from "../../../lib/hooks/useBreakpoint.js";
import { useHotkeys } from "../../../lib/hooks/useHotkeys.js";
import { useQuery } from "@tanstack/react-query";
import { tier } from "../../../lib/query/cachePolicy.js";
import {
  useSessionContext,
  useSessionPermissions,
} from "../../../app/sessionContext.js";
import { cartCount, cartTotal, useCartStore } from "../cart.store.js";
import { listPosProducts, type PosProduct } from "../pos.api.js";
import { posKeys, useCurrentSession } from "../pos.queries.js";
import { CartPanel } from "../components/CartPanel.js";
import { CheckoutPanel, checkoutBlocker } from "../components/CheckoutPanel.js";
import { CloseSessionDialog } from "../components/CloseSessionDialog.js";
import { OpenSessionDialog } from "../components/OpenSessionDialog.js";
import { ProductGrid } from "../components/ProductGrid.js";
import { ProductSearch } from "../components/ProductSearch.js";
import { SaleConfirmDialog } from "../components/SaleConfirmDialog.js";
import styles from "./PosPages.module.css";

/// `/caisse` (UI-15): session-aware. No session: the call to open it. Open:
/// products, cart and checkout as three panels on desktop, a full-screen
/// list with a sticky total bar and a cart sheet on phones (V1 UI guide
/// section 8). Every posting goes through the confirmation dialog.
export function CaissePage() {
  const permissions = useSessionPermissions();
  const { user } = useSessionContext();
  const navigate = useNavigate();
  const toast = useToast();
  const phone = useIsPhone();
  const session = useCurrentSession();
  const cart = useCartStore();
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [opening, setOpening] = useState(false);
  const [closing, setClosing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const customerRef = useRef<HTMLButtonElement>(null);
  const clearConfirm = useConfirm();
  const debounced = useDebounce(query, 250);
  const products = useQuery({
    queryKey: posKeys.products(debounced),
    queryFn: () =>
      listPosProducts({ page: 1, pageSize: 60, q: debounced || undefined }),
    enabled: Boolean(session.data),
    placeholderData: (previous) => previous,
    // The grid changes with the catalogue only: a minute (06 section 3.5).
    ...tier("list"),
    staleTime: 60_000,
  });
  const allProducts = useMemo(
    () => products.data?.items ?? [],
    [products.data],
  );
  const categories = useMemo(() => {
    const seen = new Map<string, string>();
    allProducts.forEach((product) =>
      seen.set(product.category.id, product.category.name),
    );
    return [...seen].map(([id, name]) => ({ id, name }));
  }, [allProducts]);
  const visible = categoryId
    ? allProducts.filter((product) => product.category.id === categoryId)
    : allProducts;
  const quantities = useMemo(
    () => new Map(cart.lines.map((line) => [line.productId, line.quantity])),
    [cart.lines],
  );
  const total = cartTotal(cart.lines).toFixed(3);
  const blocker = checkoutBlocker(cart, total, permissions);

  useEffect(() => {
    if (session.data && !phone) searchRef.current?.focus();
  }, [session.data, phone]);

  const add = (product: PosProduct) =>
    cart.add({
      productId: product.id,
      name: product.name,
      unitSymbol: product.baseUnit.symbol,
      unitPriceTnd: product.salePriceTnd,
      isStockable: product.isStockable,
      categoryName: product.category.name,
    });

  // Empties the cart after a confirmation when several lines would be lost;
  // shared by the button and the Escape shortcut.
  const requestClear = async () => {
    if (cart.lines.length > 1) {
      const { confirmed } = await clearConfirm.confirm({
        title: "Vider le panier ?",
        impact: `Les ${cartCount(cart.lines)} articles du panier seront retirés. Aucune vente n'est enregistrée.`,
        confirmLabel: "Vider le panier",
        tone: "danger",
      });
      if (!confirmed) return;
    }
    cart.clear();
  };

  const hotkeys = useMemo(
    () => [
      { key: "/", handler: () => searchRef.current?.focus() },
      {
        // Enter adds the first match only from the search field; on a
        // focused tile or button it keeps its native click (issue #43).
        key: "Enter",
        handler: () => visible[0] && add(visible[0]),
        inInputs: true,
        when: (event: KeyboardEvent) => event.target === searchRef.current,
      },
      {
        key: "F2",
        handler: () =>
          (
            document.querySelector(
              '[role="combobox"][aria-label="Client"]',
            ) as HTMLElement | null
          )?.focus(),
      },
      { key: "F9", handler: () => !blocker && setConfirming(true) },
      { key: "Escape", handler: () => void requestClear() },
    ],
    [visible, blocker, cart.lines.length],
  );
  useHotkeys(hotkeys, Boolean(session.data) && !phone);

  if (session.isError) {
    const copy = describeError(session.error);
    return (
      <ErrorState
        title={copy.title}
        description={copy.description}
        onRetry={() => void session.refetch()}
      />
    );
  }

  if (session.isPending) {
    return <Skeleton variant="table" rows={6} />;
  }

  const open = session.data;
  const banner = open
    ? {
        openedAt: open.openedAt,
        cashierName:
          open.openedBy?.displayName ??
          (open.openedByUserId === user.id ? user.displayName : "—"),
        terminalName: open.terminal.name,
        openingCashTnd: open.openingCashTnd,
      }
    : null;

  const checkout = (
    <CheckoutPanel
      ref={customerRef}
      permissions={permissions}
      showShortcuts={!phone}
      onCheckout={() => {
        setSheetOpen(false);
        setConfirming(true);
      }}
    />
  );

  return (
    <>
      <PageHeader
        eyebrow="Ventes"
        title="Caisse"
        actions={
          open ? (
            <PermissionGate
              permissions={permissions}
              permission="pos.close_session"
            >
              <Button
                variant="secondary"
                leftIcon={<Lock />}
                onClick={() => setClosing(true)}
              >
                Clôturer
              </Button>
            </PermissionGate>
          ) : null
        }
      />
      <SessionBanner session={banner} />
      {!open ? (
        <Card>
          <EmptyState
            icon={<Store />}
            title="Aucune session ouverte"
            description="Ouvrez la caisse avec le fonds de caisse compté pour commencer à vendre."
            action={
              <PermissionGate
                permissions={permissions}
                permission="pos.open_session"
                fallback={
                  <p className={styles.muted}>
                    Demandez à une personne autorisée d'ouvrir la caisse.
                  </p>
                }
              >
                <Button onClick={() => setOpening(true)}>
                  Ouvrir la caisse
                </Button>
              </PermissionGate>
            }
          />
        </Card>
      ) : phone ? (
        <>
          <ProductSearch
            ref={searchRef}
            query={query}
            onQueryChange={setQuery}
            categories={categories}
            categoryId={categoryId}
            onCategoryChange={setCategoryId}
          />
          {products.isPending ? (
            <Skeleton variant="table" rows={4} />
          ) : (
            <ProductGrid
              products={visible}
              quantities={quantities}
              onAdd={add}
              onIncrement={cart.increment}
            />
          )}
          <div className={styles.stickyBar} role="status" aria-label="Panier">
            <div>
              <strong className="tabular-nums">{formatMoney(total)}</strong>
              <div>
                {cartCount(cart.lines)} article
                {cartCount(cart.lines) > 1 ? "s" : ""}
              </div>
            </div>
            <Button
              onClick={() => setSheetOpen(true)}
              disabled={cart.lines.length === 0}
            >
              Voir le panier
            </Button>
          </div>
          <Sheet
            open={sheetOpen}
            onOpenChange={setSheetOpen}
            side="bottom"
            title={`Panier · ${formatMoney(total)}`}
            description="Le total reste visible ; « Encaisser » est en bas."
          >
            <div className={styles.sheetBody}>
              <CartPanel onClearRequest={() => void requestClear()} />
              {checkout}
            </div>
          </Sheet>
        </>
      ) : (
        <div className={styles.panels}>
          <Card className={styles.panel}>
            <CardHeader as="h2" title="Produits" />
            <ProductSearch
              ref={searchRef}
              query={query}
              onQueryChange={setQuery}
              categories={categories}
              categoryId={categoryId}
              onCategoryChange={setCategoryId}
            />
            {products.isPending ? (
              <Skeleton variant="table" rows={4} />
            ) : (
              <ProductGrid
                products={visible}
                quantities={quantities}
                onAdd={add}
                onIncrement={cart.increment}
              />
            )}
          </Card>
          <Card className={styles.panel}>
            <CardHeader as="h2" title="Panier" />
            <CartPanel onClearRequest={() => void requestClear()} />
          </Card>
          <Card className={styles.panel}>
            <CardHeader as="h2" title="Encaissement" />
            {checkout}
          </Card>
        </div>
      )}
      <OpenSessionDialog open={opening} onOpenChange={setOpening} />
      {open ? (
        <CloseSessionDialog
          open={closing}
          session={open}
          onClosed={(closed) => {
            toast.success(
              "Caisse clôturée",
              `Écart ${formatMoney(closed.cashDifferenceTnd ?? "0")}.`,
            );
            setClosing(false);
            cart.clear();
            navigate(`/caisse/sessions/${closed.id}`);
          }}
          onCancel={() => setClosing(false)}
        />
      ) : null}
      <ConfirmDialog {...clearConfirm.dialog} />
      <SaleConfirmDialog
        open={confirming}
        onSold={(sale) => {
          // The cashier stays on the till for the next customer (issue #43);
          // the receipt is one tap away on the toast.
          toast.toast({
            kind: "success",
            title: "Vente enregistrée",
            description: `${sale.reference} · ${formatMoney(sale.totalTnd)}${Number(sale.remainingDueTnd) > 0 ? ` · reste ${formatMoney(sale.remainingDueTnd)}` : ""}.`,
            action: {
              label: "Voir",
              onClick: () => navigate(`/caisse/ventes/${sale.id}`),
            },
          });
          setConfirming(false);
          setSheetOpen(false);
          cart.clear();
          if (!phone) searchRef.current?.focus();
        }}
        onOrdered={(orderId, reference) => {
          toast.success("Commande enregistrée", reference);
          setConfirming(false);
          cart.clear();
          navigate(`/commandes/${orderId}`);
        }}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}
