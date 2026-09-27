# 012 · Commandes: deposits and the remainder shown in the dialogs

| Field            | Value                                                                                           |
| ---------------- | ----------------------------------------------------------------------------------------------- |
| Module           | `backend/src/modules/orders`, `frontend/src/features/orders`                                    |
| Type             | Bug                                                                                             |
| Priority         | High (seen by the client at the demo)                                                           |
| Depends on       | —                                                                                               |
| Suggested branch | `fix/orders-detail-figures`                                                                     |
| Related          | `ORD-008`, `ORD-009`, `ORD-011`, issue 005 (#45) which introduced the figures on the queue only |

## Owner's request

> "Encaisser un acompte" always shows 0 for the remainder even when a deposit exists; the deposits must show the proper date and a deposit must never exceed the total. "Terminer" must show what is left to pay taking the deposits into account.

## Findings

1. **The detail page has no figures.** Issue #45 added `advanceReceivedTnd` and `remainingDueTnd` through `withOrderFigures`, but only the queue applies it ([orders.service.ts:182](../backend/src/modules/orders/orders.service.ts#L182)). `getOrder` returns the raw record ([orders.service.ts:251](../backend/src/modules/orders/orders.service.ts#L251)), and so do the responses of `createOrder`, `changeStatus`, `recordAdvance`, `completeOrder` and `cancelOrder`, which all reload with `orderDetailInclude` and return it as is. On the detail page `order.remainingDueTnd` is therefore `undefined`; `remainingOf(order)` returns it ([orderLabels.ts](../frontend/src/features/orders/components/orderLabels.ts)), the `PaymentBox` of the deposit dialog shows "Reste à verser 0,000" and its cap refuses every amount, and the completion dialog computes the receivable from nothing ([AdvanceDialog.tsx](../frontend/src/features/orders/components/AdvanceDialog.tsx), [CompleteOrderDialog.tsx](../frontend/src/features/orders/components/CompleteOrderDialog.tsx)). The unit tests did not catch it because the mock returns the same shape for the list and the detail.
2. **Dates of deposits.** A deposit dated by day is stored at midday Tunis when the day is not today, at the current instant otherwise ([AdvanceDialog.tsx:29](../frontend/src/features/orders/components/AdvanceDialog.tsx#L29)); the list shows `formatDateTime(paidAt)`, so a back-dated deposit reads "12:00". A deposit's time only matters for today's drawer; the list should show the day, and the time only when it is today's real instant. The API keeps `paidAt` as the ledger instant.
3. **The cap.** The frontend caps by `remainingTnd` (broken by 1); the API refuses an advance above the remainder (`ORD-009`), so the server side holds. Once 1 is fixed the inline cap works again; the API's message should also name the remainder.
4. Same root cause on the queue's row actions? No: the queue rows carry the figures; the row dialogs read `remainingDueTnd` correctly. Only the detail page and every post-command refresh are wrong, which is why the bug appears after a deposit as well: the mutation's response, without figures, replaces the cached detail.

## Proposed change

### Backend

- `withOrderFigures` applied in `getOrder` and in every command's returned order (the include already loads `advances`, so `advanceReceivedTnd` is exact); one helper used by all seven places. The `ORDER_ADVANCE_EXCEEDS_REMAINING` message states the remainder.
- Route tests assert `remainingDueTnd` and `advanceReceivedTnd` on the detail and on the advance and completion responses.

### Frontend

- The deposit list shows "Acompte du 24/09/2026" when the instant is midday Tunis (synthetic) and "le 25/09/2026 à 10:12" otherwise; the completion and deposit dialogs read the figures from the detail (unchanged code once the API is right).
- The mock's detail handler returns what the API returns (figures on the detail and on command responses) so the tests would have caught this.

## Acceptance criteria

- On an order of 40,000 with a 10,000 deposit, the detail page shows `Avance 10,000` and `Reste 30,000`, "Encaisser un acompte" opens with "Reste à verser 30,000" and refuses 30,001, and "Terminer" shows 30,000 to collect with 0 leaving 30,000 on the customer's account.
- After a deposit or a completion from the detail page, the figures on screen are those of the API without a reload.
- A deposit dated yesterday shows its day, not "12:00".
