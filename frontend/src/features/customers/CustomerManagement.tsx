import { type FormEvent, useEffect, useMemo, useState } from "react";
import type { CurrentUser } from "../auth/authApi";
import {
  createCustomer,
  createCustomerPayment,
  getCustomerBalances,
  getCustomerPayments,
  getCustomers,
  getCustomerStatement,
  updateCustomer,
  type Customer,
  type CustomerBalance,
  type CustomerPayment,
  type CustomerStatement,
} from "./customersApi";

interface CustomerManagementProps {
  user: CurrentUser;
}

export function CustomerManagement({ user }: CustomerManagementProps) {
  const permissions = useMemo(
    () => new Set(user.effectivePermissions),
    [user.effectivePermissions],
  );
  const canViewCustomers = permissions.has("customers.view");
  const canCreateCustomers = permissions.has("customers.create");
  const canUpdateCustomers = permissions.has("customers.update");
  const canViewBalances = permissions.has("customer_balances.view");
  const canViewPayments = permissions.has("customer_payments.view");
  const canCreatePayments = permissions.has("customer_payments.create");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [balances, setBalances] = useState<CustomerBalance[]>([]);
  const [payments, setPayments] = useState<CustomerPayment[]>([]);
  const [statement, setStatement] = useState<CustomerStatement | null>(null);
  const [customerForm, setCustomerForm] = useState({
    name: "",
    phone: "",
    address: "",
    taxIdentifier: "",
    notes: "",
  });
  const [paymentForm, setPaymentForm] = useState({
    customerId: "",
    paidAt: new Date().toISOString().slice(0, 10),
    amountTnd: "",
    reference: "",
    notes: "",
    saleId: "",
    collectedAtPos: false,
  });
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    void refresh();
  }, [canViewCustomers, canViewBalances, canViewPayments, canCreatePayments]);

  async function refresh() {
    setError("");
    const [customerPage, balancePage, paymentPage] = await Promise.all([
      canViewCustomers || canCreatePayments
        ? getCustomers()
        : Promise.resolve(emptyPage<Customer>()),
      canViewBalances
        ? getCustomerBalances()
        : Promise.resolve(emptyPage<CustomerBalance>()),
      canViewPayments
        ? getCustomerPayments()
        : Promise.resolve(emptyPage<CustomerPayment>()),
    ]);
    setCustomers(customerPage.items);
    setBalances(balancePage.items);
    setPayments(paymentPage.items);
  }

  async function handleCreateCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");
    setStatus("");

    try {
      await createCustomer(customerForm);
      setCustomerForm({
        name: "",
        phone: "",
        address: "",
        taxIdentifier: "",
        notes: "",
      });
      setStatus("Client cree.");
      await refresh();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCreatePayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");
    setStatus("");

    try {
      await createCustomerPayment({
        customerId: paymentForm.customerId,
        paidAt: paymentForm.paidAt,
        amountTnd: paymentForm.amountTnd,
        reference: paymentForm.reference,
        notes: paymentForm.notes,
        collectedAtPos: paymentForm.collectedAtPos,
        allocations: paymentForm.saleId
          ? [{ saleId: paymentForm.saleId, amountTnd: paymentForm.amountTnd }]
          : [],
      });
      setPaymentForm({
        customerId: paymentForm.customerId,
        paidAt: new Date().toISOString().slice(0, 10),
        amountTnd: "",
        reference: "",
        notes: "",
        saleId: "",
        collectedAtPos: false,
      });
      setStatus("Paiement enregistre.");
      await refresh();
      if (paymentForm.customerId) {
        setStatement(await getCustomerStatement(paymentForm.customerId));
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function selectStatement(customerId: string) {
    setError("");
    try {
      setStatement(await getCustomerStatement(customerId));
      setPaymentForm((current) => ({ ...current, customerId }));
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  return (
    <section className="customers-workspace" aria-labelledby="customers-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Clients</p>
          <h2 id="customers-title">Clients et paiements</h2>
        </div>
        <span className="permission-count">{customers.length}</span>
      </div>

      {error ? <p role="alert">{error}</p> : null}
      {status ? <p className="status-active">{status}</p> : null}

      <div className="customers-grid">
        <div className="panel">
          <div className="panel-heading">
            <h3>Fiches client</h3>
            <span>{customers.length}</span>
          </div>

          {canCreateCustomers ? (
            <form className="inline-form" onSubmit={handleCreateCustomer}>
              <label className="field">
                Nom
                <input
                  onChange={(event) =>
                    setCustomerForm({
                      ...customerForm,
                      name: event.target.value,
                    })
                  }
                  required
                  value={customerForm.name}
                />
              </label>
              <label className="field">
                Telephone
                <input
                  onChange={(event) =>
                    setCustomerForm({
                      ...customerForm,
                      phone: event.target.value,
                    })
                  }
                  value={customerForm.phone}
                />
              </label>
              <label className="field">
                Adresse
                <input
                  onChange={(event) =>
                    setCustomerForm({
                      ...customerForm,
                      address: event.target.value,
                    })
                  }
                  value={customerForm.address}
                />
              </label>
              <label className="field">
                Identifiant fiscal
                <input
                  onChange={(event) =>
                    setCustomerForm({
                      ...customerForm,
                      taxIdentifier: event.target.value,
                    })
                  }
                  value={customerForm.taxIdentifier}
                />
              </label>
              <label className="field">
                Notes
                <textarea
                  onChange={(event) =>
                    setCustomerForm({
                      ...customerForm,
                      notes: event.target.value,
                    })
                  }
                  rows={3}
                  value={customerForm.notes}
                />
              </label>
              <button disabled={isSubmitting} type="submit">
                Creer
              </button>
            </form>
          ) : null}

          <div className="item-list">
            {customers.map((customer) => (
              <div className="customer-row" key={customer.id}>
                <button
                  className="list-button"
                  onClick={() => void selectStatement(customer.id)}
                  type="button"
                >
                  <span>
                    <strong>{customer.name}</strong>
                    <small>{customer.phone ?? "Sans telephone"}</small>
                  </span>
                </button>
                {canUpdateCustomers ? (
                  <button
                    className="secondary-button"
                    onClick={async (event) => {
                      event.stopPropagation();
                      await updateCustomer(customer, {
                        isActive: !customer.isActive,
                      });
                      await refresh();
                    }}
                    type="button"
                  >
                    {customer.isActive ? "Actif" : "Inactif"}
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <h3>Soldes</h3>
            <span>{balances.length}</span>
          </div>
          <div className="item-list">
            {balances.map((balance) => (
              <button
                className="list-button"
                key={balance.customer.id}
                onClick={() => void selectStatement(balance.customer.id)}
                type="button"
              >
                <span>
                  <strong>{balance.customer.name}</strong>
                  <small>{balance.openSaleCount} ventes ouvertes</small>
                </span>
                <strong>{formatTnd(balance.balanceTnd)}</strong>
              </button>
            ))}
          </div>
          <StatementPanel statement={statement} />
        </div>

        <div className="panel">
          <div className="panel-heading">
            <h3>Paiements</h3>
            <span>{payments.length}</span>
          </div>

          {canCreatePayments ? (
            <form className="inline-form" onSubmit={handleCreatePayment}>
              <label className="checkbox-field">
                <input
                  checked={paymentForm.collectedAtPos}
                  onChange={(event) =>
                    setPaymentForm({
                      ...paymentForm,
                      collectedAtPos: event.target.checked,
                    })
                  }
                  type="checkbox"
                />
                Encaisse a la caisse
              </label>
              <p className="status-muted">
                Cochez uniquement si l'argent passe par le tiroir-caisse. Le
                montant entre alors dans le fonds de caisse attendu a la
                cloture.
              </p>
              <label className="field">
                Client
                <select
                  onChange={(event) =>
                    setPaymentForm({
                      ...paymentForm,
                      customerId: event.target.value,
                    })
                  }
                  required
                  value={paymentForm.customerId}
                >
                  <option value="">Choisir</option>
                  {customers
                    .filter((customer) => customer.isActive)
                    .map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="field">
                Date
                <input
                  onChange={(event) =>
                    setPaymentForm({
                      ...paymentForm,
                      paidAt: event.target.value,
                    })
                  }
                  required
                  type="date"
                  value={paymentForm.paidAt}
                />
              </label>
              <label className="field">
                Montant
                <input
                  inputMode="decimal"
                  min="0.001"
                  onChange={(event) =>
                    setPaymentForm({
                      ...paymentForm,
                      amountTnd: event.target.value,
                    })
                  }
                  required
                  step="0.001"
                  type="number"
                  value={paymentForm.amountTnd}
                />
              </label>
              <label className="field">
                Vente a allouer
                <select
                  onChange={(event) =>
                    setPaymentForm({
                      ...paymentForm,
                      saleId: event.target.value,
                    })
                  }
                  value={paymentForm.saleId}
                >
                  <option value="">Non alloue</option>
                  {statement?.sales
                    .filter((sale) => Number(sale.balanceTnd) > 0)
                    .map((sale) => (
                      <option key={sale.id} value={sale.id}>
                        {formatDate(sale.soldAt)} - {formatTnd(sale.balanceTnd)}
                      </option>
                    ))}
                </select>
              </label>
              <button disabled={isSubmitting} type="submit">
                Enregistrer
              </button>
            </form>
          ) : null}

          <div className="item-list">
            {payments.map((payment) => (
              <div className="metric-row" key={payment.id}>
                <span>{payment.customer?.name ?? payment.customerId}</span>
                <strong>{formatTnd(payment.amountTnd)}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function StatementPanel({
  statement,
}: {
  statement: CustomerStatement | null;
}) {
  if (!statement) {
    return <p className="status-muted">Selectionnez un client.</p>;
  }

  return (
    <div className="assignment-panel">
      <div className="metric-row">
        <span>Solde</span>
        <strong>{formatTnd(statement.balanceTnd)}</strong>
      </div>
      {statement.sales.map((sale) => (
        <div className="metric-row" key={sale.id}>
          <span>{formatDate(sale.soldAt)}</span>
          <strong>{formatTnd(sale.balanceTnd)}</strong>
        </div>
      ))}
    </div>
  );
}

function formatTnd(value: string): string {
  return new Intl.NumberFormat("fr-TN", {
    style: "currency",
    currency: "TND",
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(Number(value));
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("fr-TN", {
    dateStyle: "short",
    timeZone: "Africa/Tunis",
  }).format(new Date(value));
}

function emptyPage<TItem>() {
  return {
    items: [] as TItem[],
    page: 1,
    pageSize: 25,
    total: 0,
    pageCount: 0,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Operation impossible.";
}
