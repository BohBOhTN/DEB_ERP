# Fix #65: Commandes, deposits and the remainder shown in the dialogs

## Branches

- Source: `fix/65-orders-detail-figures`
- Target: `dev`

## Scope

Closes issue #65 ([issues/012](../issues/012-commandes-acomptes-et-reste.md)):
the order page and every order command carry the figures the deposit and
completion dialogs read, the deposit cap names the remainder, and a deposit
dated by day shows its day alone.

## Summary

- `withOrderFigures` (issue #45, queue only) now applies to `getOrder` and
  to the order returned by `createOrder`, `updateOrder`, `changeStatus`,
  `recordOrderAdvance`, `completeOrder` and `cancelOrder`. The detail
  include already loads the advances, so `advanceReceivedTnd` is exact and
  `remainingDueTnd` follows the same rule as the queue (total less the
  advance balance while open, the sale's remainder once completed, zero
  once cancelled). On the page, "Encaisser un acompte" reads the real
  remainder and its inline cap works again; "Terminer" shows the amount
  left after the deposits; after a deposit or a completion, the response
  that replaces the cached detail carries the figures too.
- `ORDER_ADVANCE_EXCEEDS_TOTAL` states the remainder in its message.
- Deposit list: a deposit dated by day is stored at midday Tunis (issue
  #45); `advanceDateLabel` shows that day alone and a real instant in full.
- The mock's command responses carry the figures like the API, so a
  missing figure on a command response fails the page tests from now on.

## Out of Scope

- The queue and its row actions: they already had the figures.

## Verification

Run locally on macOS, Node 24:

- `npm run format:check`: passed
- `npm run lint`: passed, zero warnings
- `npm run typecheck`: passed, backend and frontend
- `npm run test --workspace backend`: orders suites 33 passed, 2 skipped;
  new assertions: the deposit response and the detail carry
  `advanceReceivedTnd` 10,000 and `remainingDueTnd` 30,000 on a 40,000
  order after a 10,000 deposit (the in-memory double now hydrates the
  detail read like the commands)
- `npm run test --workspace frontend`: 221 passed (92 files); new
  `orderLabels.test.ts`: a midday-Tunis instant shows the day alone, a
  real instant shows date and time
- Browser flows unchanged; the orders page suite passes with the honest
  mock

## Database and Migration Impact

None.

## Environment Impact

None.

## Risks and Follow-Up

- A deposit genuinely taken at exactly 12:00:00 Tunis would show its day
  alone; the ledger keeps the instant.

## Merge Checklist

- [ ] CI passed
- [ ] No real `.env` files or secrets committed
- [ ] Scope matches issue #65
- [ ] Target branch is `dev`
