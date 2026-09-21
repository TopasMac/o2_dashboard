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

## Important Backward-Compatibility Strategy

The design system is intentionally **opt-in during migration**. Do not globally
restyle existing pages merely because the new tokens and components exist.

Existing pages should retain their current appearance until they are
intentionally migrated and tested.

## What Is Not Finished

- The broader visual redesign of `TableLite` itself is **not yet complete**.
- Table row, header, separator, hover, and density treatment still need review.
- The Unit Transactions toolbar is approved, but the complete table-page
  prototype is not finished.
- Reservations, Units, Clients, Owners2 Transactions, and HK Transactions have
  not been migrated.
- Do not blindly migrate other pages until Unit Transactions is completed and
  validated.

## Recommended Next Step

**Review and refine the TableLite visual treatment on Unit Transactions only.**

Preserve:

- Existing column widths unless there is a specific visual reason to change them
- Two-line cells
- Document actions
- Amount formatting
- Sticky headers
- Internal vertical scrolling
- Column resizing
- Row highlight and focus behavior

Make shared `TableLite` visual changes opt-in where there is meaningful risk to
unmigrated pages. Visually review the page after each meaningful change rather
than implementing the remaining redesign in one large step.

## Git Checkpoint

- Branch: `feature/ui-design-system`
- Latest implementation checkpoint:
  - `03ac8d04a78ae1f0f678cd111a5f104873098dc3`
  - `feat(ui): add table toolbar prototype`

Earlier commits on this branch establish the table-page documentation,
toolbar/table standards, button/filter standards, and color foundation. The
branch has not been merged or deployed.

## Validation Status

During implementation:

- `git diff --check` passed.
- Frontend JSX parsing checks passed.
- `npm --prefix frontend run build` completed successfully with existing
  repository warnings.

No automated functional or browser tests are claimed here.

## Working Method

- Read the authoritative UI documentation and this status file before changing
  code.
- Inspect current code rather than assuming this handover is perfectly current.
- Make small, testable changes.
- Preserve unrelated changes.
- Do not redesign global application chrome.
- Do not migrate additional pages until the Unit Transactions prototype is
  completed.
