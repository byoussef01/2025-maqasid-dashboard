# Maqasid Finance Dashboard

Next.js finance dashboard for importing the 2025 workbook into SQLite and generating dashboard and report totals from normalized transactions.

## Development

Install dependencies and start the app:

```bash
npm install
npm run dev
```

The SQLite database lives at `data/finance.sqlite` by default.

If you need to recreate the local database schema, run:

```bash
npm run db:init
```

## Import And Reporting Flow

1. `lib/import/workbook.ts` parses known account sheets plus the `Categories` sheet from the workbook.
2. Imported rows are stored in SQLite tables and exposed through the `normalized_transactions` view in `lib/db/schema.ts`.
3. Dashboard and report totals are derived from that normalized view through `lib/reports/classification.ts` and `lib/db/queries.ts`.

## Summary Workbook Logic

The authoritative debugging reference for workbook totals is `Summary - Summary (3).csv`.

The provided `Summary (2).xlsx` did not expose parseable formulas, so the CSV export is the source of truth for the Summary sheet logic.

Key formulas from the Summary sheet:

- `F33 = Credit Card Payment`
- `G33 = R106`
- `F34 = Internal Transfer`
- `G34 = R108 + R116`
- `G39 = SUM(G24:G38)`

That means the workbook does not simply ignore `Credit Card Payment` or `Internal Transfer`. They are included in the operating-expense section, but the underlying category math is sign-aware.

## Normalization Rule Used By The App

The app now mirrors the workbook by using signed `net_cents` in the normalization layer instead of `ABS(net_cents)` per transaction.

Current rules:

- Revenue rows contribute signed `net_cents` when the account is not a credit card.
- Expenditure rows contribute `-net_cents` to expenditure totals.
- `normalized_net_cents` keeps the signed `net_cents` contribution for revenue and expenditure rows.

This matters for transfer-like categories. For example, `Internal Transfer` (`NE-22`) contains both positive and negative transactions in the current dataset. Summing absolute values overstated expense totals dramatically, while the signed rollup matches the workbook-style category net.

Examples from the current data:

- `NE-20 / Credit Card Payment`: absolute total and workbook-style expense total are both `77,402,570` cents.
- `NE-22 / Internal Transfer`: absolute total is `800,778,844` cents, but the signed workbook-style net is `6,185,628` cents.
- `NE-22.1 / Cash internal transfers`: workbook-style signed handling also preserves offsetting flow instead of inflating totals.

## Important Files

- `lib/import/workbook.ts`: workbook parsing and category seeding.
- `lib/db/schema.ts`: database schema plus the `normalized_transactions` view.
- `lib/reports/classification.ts`: reporting helpers and summary rollups.
- `lib/db/queries.ts`: dashboard-level summary queries.
- `Summary - Summary (3).csv`: formula reference used to align app totals with the workbook.

## Notes For Future Changes

- If report totals drift from the workbook again, compare the relevant Summary CSV formulas against `normalized_transactions` first.
- Add any future whitelist or override layer on top of the workbook-derived category defaults, not in place of them.
- Treat transfer and payment categories carefully: the workbook behavior is category-net based, not absolute-value based.
