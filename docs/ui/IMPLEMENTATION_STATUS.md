# HausIn UI Design-System Implementation Status

## Purpose

The `feature/ui-design-system` branch establishes the new HausIn desktop UI
design system. It uses **Unit Transactions** as the first real
prototype/reference implementation so the shared system can be validated on one
page before other pages are migrated.

## Authoritative Documentation

The following documents define the intended UI. Legacy styles are
implementation history, not the design authority.

- `docs/ui/patterns/table-page.md`
- `docs/ui/components/tables.md`
- `docs/ui/components/table-toolbar.md`
- `docs/ui/components/buttons.md`
- `docs/ui/components/inputs-filters.md`
- `docs/ui/foundations/colors.md`

## Global Layout Boundary

The following already exist and are outside this redesign:

- AppShell/global header
- Top navigation
- Left sidebar
- Grey application background
- Outer placement and dimensions of the white content card

The new table-page design starts **inside the existing white content card**.

## Validated Table-Page Layout

```text
Page Title                                      Page Actions

Filters...

Table column headers
Table rows
```

- The title is on the left and actions are grouped on the right.
- Filters appear below the title/actions row.
- Do not add a subtitle by default.
- Desktop controls use a standard `36px` height.
- Floating labels must have enough vertical clearance and must not be clipped.
- Search controls may be wider than selects, but should use bounded widths.
- `Clear Filters` follows the filter group.

## Unit Transactions Prototype Status

`frontend/src/pages/Owners2UnitTransactions.jsx` is the first prototype.

Completed and visually validated:

- `Unit Transactions` title inside the white card
- `+ New Transaction` primary teal action
- `View Comments` secondary outlined action
- Unit autocomplete moved from the table header to the toolbar
- Type select moved from the table header to the toolbar
- Description search moved from the table header to the toolbar
- `Clear Filters` replaces `Reset Filters` in the new toolbar and is disabled
  when no filters are active
- Table filters are page-controlled rather than cleared by remounting
  `TableLite`
- `TableLite` header filter controls are hidden on this page while its filtering
  engine remains active
- Unit and Type options still derive from the complete unfiltered transaction
  dataset
- Multiple filters retain AND semantics
- MUI floating-label spacing and notch behavior were corrected
- First `TableLite` visual-treatment pass completed through the opt-in HausIn
  variant: compact typography, neutral separators, subtle teal hover, and teal
  selected-row treatment
- Table now fills the remaining white-card height without changing shared
  default sizing
- Description column reduced to `260px`; Documents header and actions are
  centered
- Document preview actions use compact MUI icon buttons with tooltip, hover,
  and keyboard-focus treatment
- Existing transaction business logic, drawers, document preview, navigation,
  deep links, highlighting, scrolling, and column resizing were preserved

## Shared Implementation Completed

- `frontend/src/theme.js`
  - Contains opt-in `theme.hausin` design tokens.
- `frontend/src/components/layout/TableToolbar.jsx`
  - Shared title/actions/filters toolbar.
  - Supports `auto`, `inline`, and `stacked` layouts.
- `frontend/src/components/layout/PageScaffold.jsx`
  - Supports opt-in `tableToolbar` behavior.
  - Existing consumers retain legacy/default behavior.
- `frontend/src/components/layout/TableLite.jsx`
  - Supports `showHeaderFilters`.
  - Defaults to `true` for backward compatibility.
  - Unit Transactions opts out while retaining controlled filtering.
  - Supports `visualVariant="hausin"` as an opt-in table presentation; legacy
    consumers retain their existing appearance.

## Important Backward-Compatibility Strategy

The design system is intentionally **opt-in during migration**. Do not globally
restyle existing pages merely because the new tokens and components exist.

Existing pages should retain their current appearance until they are
intentionally migrated and tested.

## What Is Not Finished

- The first Unit Transactions `TableLite` visual-treatment pass is complete,
  but broader table visual work is not yet complete.
- Loading, empty, error, and footer/pagination states still need design review.
- The Unit Transactions toolbar and first table-treatment pass are approved,
  but the complete table-page prototype is not finished.
- Reservations, Units, Clients, Owners2 Transactions, and HK Transactions have
  not been migrated.
- Do not blindly migrate other pages until Unit Transactions is completed and
  validated.

## Recommended Next Step

**Define and prototype a server-side filtering, sorting, and pagination
strategy before migrating other large operational tables.**

Preserve:

- Existing column widths unless there is a specific visual reason to change them
- Two-line cells
- Document actions
- Amount formatting
- Sticky headers
- Internal vertical scrolling
- Column resizing
- Row highlight and focus behavior

The intended future standard is server-side filtering and sorting with a
bounded page size, a footer such as `Showing 1-50 of 677`, and Previous/Next
navigation rather than unbounded client-side datasets or numbered pagination.
Keep the current Unit Transactions implementation unchanged until this is
designed and tested as a separate platform task.

Make shared `TableLite` changes opt-in where there is meaningful risk to
unmigrated pages. Visually review each meaningful change rather than
implementing a broad redesign in one large step.

## Git Checkpoint

- Branch: `feature/ui-design-system`
- Latest implementation checkpoint:
  - `d40c8dcc71225540349fef9232fdb5d1cc9e5ba2`
  - `feat(ui): refine Unit Transactions table treatment`

Earlier commits on this branch establish the table-page documentation,
toolbar/table standards, button/filter standards, color foundation, and
toolbar prototype. The branch has not been merged or deployed.

## Validation Status

During implementation:

- `git diff --check` passed.
- Frontend JSX parsing checks passed.
- `npm --prefix frontend run build` completed successfully with existing
  repository warnings.

The Unit Transactions toolbar and first table-treatment pass were visually
reviewed locally. No automated functional tests are claimed here.

## Working Method

- Read the authoritative UI documentation and this status file before changing
  code.
- Inspect current code rather than assuming this handover is perfectly current.
- Make small, testable changes.
- Preserve unrelated changes.
- Do not redesign global application chrome.
- Do not migrate additional pages until the Unit Transactions prototype is
  completed.
