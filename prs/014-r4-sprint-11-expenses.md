# R4 Sprint 11 Expenses

## Branches

- Source: `feature/r4-sprint-11-expenses`
- Target: `dev`

## Scope

Implements Release R4, Sprint 11: dynamic expense categories and expense records
with a draft, post, and cancel lifecycle, plus category and date totals.

The module is deliberately narrow. An expense records that money left the
business for a category. It has no stock effect, no party-balance effect, and no
link to the POS drawer. Treasury accounts and payroll stay out, per `EXP-009`
and `EXP-010`.

## Summary

- Added the expense schema:
  - `expense_categories`;
  - `expenses`;
  - `expense_reference_seq` for the `DEP-` document reference;
  - expense status and payment method enums.
- Added dynamic expense categories with rename, activate, and deactivate, and
  optimistic versioning. Categories are never deleted, so history keeps its
  category.
- Seeded the nine category examples from the source of truth, but only when the
  table is still empty, so the business can rename or deactivate them freely.
- Added the expense lifecycle: create as draft or post straight away, edit while
  draft, post, and cancel with a mandatory reason.
- Added category and date totals that read posted expenses only.
- Added the French expense workspace with a status filter, an inline cancel
  reason, a totals panel, and category management.
- Added 23 tests covering the lifecycle, the totals gate, and the permission
  surface.

## Out of Scope

- Treasury accounts, balances, and transfers remain deferred per `EXP-009`.
- Payroll calculation remains deferred per `EXP-010`; salary is an expense
  category like any other.
- Expenses are not allocated to product cost. Cost simulation is Sprint 12 and
  has no operational effect.
- Expenses do not affect POS expected closing cash. The source-of-truth cash
  formula does not include them, and treasury is deferred.
- Non-cash methods remain out of UI scope; cash is the only active method per
  `OD-014`.

## Verification

- `npm run prisma:validate`: passed.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run test`: passed; backend 171 tests and frontend 3 tests, up from 151.
- `npm run build`: passed.
- `npm run format:check`: passed.

## Database and Migration Impact

Adds migration:

- `backend/prisma/migrations/20260922120000_add_expenses/migration.sql`

The migration is purely additive. It creates two tables, one sequence, and two
enums, and touches no existing table or column.

Database check constraints enforce the rules directly:

- `EXP-006` — the amount is greater than zero;
- `EXP-007` — a posted expense carries its posting time and actor;
- `EXP-008` — a cancelled expense carries its reason, time, and actor, and an
  expense that is not cancelled carries none of them.

Apply to shared remote development only after review using:

```bash
npm run prisma:migrate:deploy --workspace backend
```

Do not use `prisma migrate dev`, `db push`, or reset commands against shared
remote development.

## Environment Impact

No new or changed environment variables.

## API and Permission Surface

- `GET /api/expense-categories` — requires `expenses.view`.
- `POST /api/expense-categories` — requires `expense_categories.manage`.
- `PATCH /api/expense-categories/:categoryId` — requires
  `expense_categories.manage`; optimistic versioning.
- `GET /api/expenses` — requires `expenses.view`; filters by category, status,
  and date range.
- `GET /api/expense-totals` — requires `expenses.view`; posted expenses only.
- `POST /api/expenses` — requires `expenses.create`.
- `PATCH /api/expenses/:expenseId` — requires `expenses.create`; drafts only.
- `POST /api/expenses/:expenseId/post` — requires `expenses.create`.
- `POST /api/expenses/:expenseId/cancel` — requires `expenses.cancel`.

No permission key was added; all four already existed in the baseline namespace.

Reading the category list requires `expenses.view` rather than
`expense_categories.manage`, because recording an expense means picking a
category and a recorder is not necessarily a category manager.

## Requirement Coverage

| Requirement | Coverage                                                                                                 |
| ----------- | -------------------------------------------------------------------------------------------------------- |
| `EXP-001`   | Categories are stored records, created and renamed at runtime.                                           |
| `EXP-002`   | Create, rename, activate, and deactivate are implemented.                                                |
| `EXP-003`   | A category is deactivated, never deleted; the foreign key restricts deletion.                            |
| `EXP-004`   | Authorized users record expenses.                                                                        |
| `EXP-005`   | An expense stores category, date, amount, description, optional reference, method, and responsible user. |
| `EXP-006`   | A non-positive amount is rejected in the service and by a check constraint.                              |
| `EXP-007`   | A posted expense is never edited or hard-deleted; only cancellation changes it.                          |
| `EXP-008`   | Cancellation requires a reason, and writes an audit event with the actor.                                |
| `EXP-009`   | No treasury accounts, balances, or transfers are introduced.                                             |
| `EXP-010`   | No payroll; salary is only a category name.                                                              |

## Acceptance Evidence

- `AS-017` expense cancellation:
  `backend/src/modules/expenses/expenses.service.test.ts`, "keeps a cancelled
  expense in history and out of the totals" posts a 120.500 TND expense,
  cancels it with a reason, then asserts the row is still listed, the reason
  and actor are stored, and the totals fall back to zero with an empty category
  breakdown.
- Release gate, cancelled expenses excluded from active totals: the same test
  plus "posts a draft expense and counts it in the totals", which proves a
  draft does not count until it is posted.
- Immutability of posted records: "rejects editing a posted expense" and
  "rejects posting an expense twice".
- Schema and lifecycle constraints:
  - `backend/prisma/schema.prisma`
  - `backend/prisma/migrations/20260922120000_add_expenses/migration.sql`
- Expense service and routes:
  - `backend/src/modules/expenses/expenses.service.ts`
  - `backend/src/modules/expenses/expenses.routes.ts`
  - `backend/src/modules/expenses/expenses.routes.test.ts`
- French expense UI:
  - `frontend/src/features/expenses/ExpenseManagement.tsx`
  - `frontend/src/features/expenses/expensesApi.ts`
  - `frontend/src/features/shell/ProtectedShell.tsx`
  - `frontend/src/styles/global.css`

## Decisions Taken

Three points the source of truth left to implementation.

1. **A draft can be cancelled, not deleted.** `EXP-007` only says posted
   expenses are cancelled rather than hard-deleted. Allowing a draft to be
   cancelled too keeps one disposal path and one audit trail, and no delete
   route exists at all.
2. **Posting uses `expenses.create`.** The baseline permission namespace has
   `expenses.view`, `expenses.create`, and `expenses.cancel` but no post key, so
   recording and posting share one authority while cancelling stays separate.
3. **The responsible user defaults to the actor.** `EXP-005` requires the field.
   The API accepts an explicit `responsibleUserId` but the form does not offer a
   picker, so in practice it records who entered the expense.

## Risks and Follow-Up

- Manual responsive review is still outstanding at 360 px, 430 px, 768 px, and
  desktop widths.
- The category seed writes `system` as the creating user id rather than a real
  user, matching how other bootstrap data is seeded. It is a marker, not a
  foreign key, and no audit event claims a human did it.
- Totals are computed in the service by loading the matching expenses rather
  than aggregating in SQL. That is fine at the expected volume but should move
  to a grouped query if the expense history grows large.
- The expense list is paginated server-side but the workspace shows only the
  first page; a date-range picker and paging are worth adding once the
  responsive review is done.

## Merge Checklist

- [ ] CI passed
- [ ] No real `.env` files or secrets committed
- [ ] Scope matches the sprint
- [ ] Target branch is `dev`
