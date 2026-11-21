# HausIn UI Design-System Implementation Status

## Purpose

Release #106 (`0d87b65`) deployed the HausIn desktop table foundations and Unit Transactions reference page on 2026-11-21 (America/Cancun). Other table pages can adopt the approved patterns in focused, independently verified PRs from current `main`.

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
- `+ New Transaction` primary teal action adjacent to the page title
- Unit autocomplete moved from the table header to the toolbar
- Type control moved from the table header to the toolbar; it searches category text using case-insensitive substring matching, as approved by the owner
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
- Existing transaction business logic, drawers, document preview,
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

- `frontend/src/components/layout/TablePaginationFooter.jsx`
  - Shared results count, page indicator, and Previous/Next controls outside vertical scrolling.
- `frontend/src/components/layout/useClientTablePagination.js`
  - Fixed 25-row paging for the pilot after filtering, with filter resets and dataset clamping.

## Important Backward-Compatibility Strategy

The design system is intentionally **opt-in during migration**. Do not globally
restyle existing pages merely because the new tokens and components exist.

Existing pages should retain their current appearance until they are
intentionally migrated and tested.

## Approved Pilot Behavior

- Fixed 25-row client-side pages retain newest-first ordering after filtering.
- The footer remains outside vertical scrolling. Page changes reset scrolling; filters reset the page; dataset changes clamp it.
- Unit and category substring searches persist through blur and page navigation. Filters combine with AND semantics.
- The Type label searches category text. This behavior is approved.
- The View Comments shortcut was intentionally removed because the owner does not use that workflow. The report-comments page and its data remain.

## Rollout Status and Remaining Work

- Converted and deployed — Unit Transactions.
- Pending migration — Reservations, Units, Clients, Owners2 Transactions, HK Transactions, and other comparable table pages.
- Service Jobs and Service Providers retain their existing presentation; compatibility was checked during the pilot.
- General form layouts, typography beyond the documented table controls, and other new patterns require design and approval.
- Server-side filtering, sorting, and pagination remain future work. The current pilot uses client-side pagination. Plan backend changes separately when dataset size or performance requires them.
- Review loading and error treatments during each page migration. The pilot's empty and final-page states were verified.

Preserve column behavior, two-line cells, document actions, amount formatting, sticky headers, internal scrolling, resizing, highlights, and operational permissions when adapting another page. Record each completed migration here.

## Release and Recovery Points

- Production release — `0d87b65`, PR #106.
- Previous production release and rollback point — `745c827`.
- Original recovery branch — `feature/ui-design-system` at `5ed9023`.
- The continuation branch `codex/ui-design-system-pagination` was squash-merged and cleaned up. Start subsequent stages from current `main` on a fresh purpose-specific branch.

## Validation Status

The feature chat reported the following against the integrated release candidate with standard test timeouts.

- Backend — 64 passed, 2 guarded integration tests skipped.
- Frontend — 87 passed, 1 Service Jobs allocation test failed intermittently. All 3 Service Jobs tests passed when rerun alone. The full-suite failure remains a verification limitation.
- Production build and whitespace checks passed; the build emitted warnings.
- Local visual checks covered 729 transactions, final/empty pages, filters, pagination, sticky headers, scrolling, responsive footer, and transaction drawers. Shared Service Jobs and Service Providers consumers were checked.
- The owner confirmed production smoke tests passed after deployment. Production HEAD was `0d87b65`, the tree was clean, Nginx was active, and migrations showed 242 executed, 242 available, and 0 new.
- Mobile publishing was not required by the owner.

## Working Method

Read these standards before UI work, inspect the current implementation, and reuse shared components. Work in small stages from current `main`, preserving unrelated behavior. Verify each migrated page locally, run the relevant regression checks, and complete release smoke tests. Update this status file with approved decisions and converted pages so work can continue across chats and releases.
