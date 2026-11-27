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
- Pending migration — Reservations full view, Units, Clients, Owners2 Transactions, HK Transactions, and other comparable table pages.
- Service Jobs now opts into the shared stacked TableToolbar, HausIn table styling, and fixed 25-row client pagination. Month, Unit, and Status are top filters with Clear Filters; Unit options derive from all jobs, including historical units. Unit, Description, and Provider column filters are removed. Add Service sits in the title/actions row. Month/unit/status changes reset pagination. Filter labels appear above the boxes, matching Unit Transactions. Forms and operational actions retain their existing behavior.
- Service Providers retains its existing presentation; compatibility was checked during the pilot.
- Service Jobs displays scheduled dates newest first, with higher job IDs first for equal dates. This order also applies after filtering and saving; the existing table presentation is retained.
- General form layouts, typography beyond the documented table controls, and other new patterns require design and approval.
- Server-side filtering, sorting, and pagination remain future work. The current pilot uses client-side pagination. Plan backend changes separately when dataset size or performance requires them.
- Review loading and error treatments during each page migration. The pilot's empty and final-page states were verified.

Preserve column behavior, two-line cells, document actions, amount formatting, sticky headers, internal scrolling, resizing, highlights, and operational permissions when adapting another page. Record each completed migration here.

## Release and Recovery Points

- Production release — `0d87b65`, PR #106.
- Previous production release and rollback point — `745c827`.
- Original recovery branch — `feature/ui-design-system` at `5ed9023`.
- The continuation branch `codex/ui-design-system-pagination` was squash-merged and cleaned up. Start subsequent stages from current `main` on a fresh purpose-specific branch.

## Booking Date Validation

New/edit booking forms retain their current layout. Checkout calendars use check-in plus one day as the minimum. These forms opt into visible date-field validation messages with room below the control; other shared date-picker consumers retain their existing helper-text presentation. This is a focused validation correction, not a general form-layout standard or table-page migration.

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

## HK cancellation controls

HK Reconciliation and HK Cleanings retain their current table layouts. Cancelled is the last status option in reconciliation row dropdowns and both reconciliation filters, and remains last in the HK Cleanings header filter. Cancellation takes precedence over the retained report status in both pages and uses the HausIn semantic danger color (`#D9534F`) as soft red text.

Reconciliation cancellation opens a dialog reading “Confirm Cancel {unit_name} on {dd-mm-yyyy}?” with a teal Confirm button and red Cancel text button. Either button closes the dialog; only Confirm saves. Cancelled rows remain visible and can be reopened to Pending or explicitly Reported. This is a focused workflow change, not a table-page migration or a new general form standard.

## Booking cancellation confirmation

The shared booking edit form retains its current layout. Selecting Cancelled sets Payout and Cleaning Fee to zero; Payout remains editable and Cleaning Fee is disabled at zero. Save opens the existing shared confirmation dialog with “Confirm Cancellation?” and Confirm/Cancel actions. Confirm submits the displayed values through the existing save handler, which closes the editor on success. Cancel, Escape, or backdrop dismissal retains the editor and its edits without saving. Existing cancelled bookings retain their saved payout override. The backend cleaning-fee cancellation rule remains unchanged. This is a focused workflow change, not a new general form standard.

## Bookings basic table layout

`/bookings?view=basic` adopts the Unit Transactions table-page layout with the shared stacked TableToolbar, HausIn TableLite styling, full-height internal scrolling, sticky headers, and fixed 25-row pagination. The header contains Bookings and the sole creation action + New Booking. The refresh-shaped full-view toggle beside New Booking is removed from the basic view. + New Block is removed from this view. Filters are Check-in month, Status, Unit, and Guest, with labels above the boxes and Clear Filters after them. Table-header filters are hidden. Status matches exactly; Unit and Guest use case-insensitive substring matching and combine with AND. Unit options come from the complete fetched window before local filtering. The Status toolbar dropdown always lists Ongoing, Upcoming, Block / Hold, Past / Expired, Cancelled after All statuses, including options with no current matches. Dropdown options and the selected value share the table status text colors, including Calendar amber and grey for Hold/Block.

Check-in month defaults to the current month and requests its inclusive first/last check-in dates. Current-month requests additionally opt into ongoing stays from earlier check-in months, including live Holds/Blocks; historical month selections retain strict check-in bounds. The opt-in uses the shared Cancun arrival/departure boundaries and excludes Cancelled/Expired rows from the extra ongoing branch. Clearing it restores the existing backend default booking window. Focus links still include and open the requested booking outside that window. Existing status-priority/date sorting, two-line cells, booking edit/create drawers, payment actions, and source/city row actions remain. Filters reset pagination; dataset changes clamp it. The full view retains its existing controls and table presentation. Narrow toolbars retain horizontal scrolling, with a minimum usable Guest field width.

Validation: all three new Bookings layout tests passed, including combined filters, pagination, exact leap-month request bounds, a focus link to page three, drawer actions, and full-view compatibility. The full frontend suite passed 116 of 117 tests; the unchanged Service Jobs scheduling test hit its existing five-second timeout. All five Service Jobs tests passed when rerun alone. The frontend production build passed with existing lint warnings. Local visual checks covered 59 selected-month bookings, the header/action layout, hidden header filters, pagination, narrow-toolbar horizontal scrolling, Guest empty results, and Clear Filters.

### Booking row order

Rows load in Ongoing, Upcoming, Past, Cancelled, Expired order; unknown statuses follow. Ongoing and Upcoming groups sort earliest check-in first. Holds/Blocks (including Owners2 Active rows) join those groups by their stored stay dates using the Cancun 15:00 arrival and 11:00 departure cutoffs, without changing stored statuses. Finished Holds/Blocks join Past; explicit Cancelled/Expired statuses retain their own groups regardless of type. Past/Cancelled/Expired retain newest-checkout-first ordering, with missing dates last. Sorting happens before filtering and 25-row pagination.

Sorting validation: all 121 frontend tests and 75 backend/controller tests passed. Focused sorting/layout checks passed after lint cleanup. New coverage includes the October ongoing → November Block → November ongoing example, future Holds, terminal status precedence, Cancun arrival/departure cutoffs, date aliases, missing dates, and opt-in API query/unit/focus constraints. Targeted ESLint reports no errors and only existing page warnings. Local visual verification confirmed an October 25 ongoing stay leads the current November table.

### Hold and Block display statuses

The Bookings table derives the display label from `guestType`/`guest_type` while retaining the raw API status for edit/save and lifecycle operations. Active Holds render Hold in Calendar amber (`holdAmber`, `#FBBF24`); active Blocks render Block in Calendar grey (`blockGrey`, `#9AA3A7`). These match the existing Bookings Timeline bar colors. Existing Owners2 block reasons such as Maintenance also use Block. Cancelled and Expired take precedence; blocks past their checkout boundary render Past using the existing Cancun cutoff. Hold expiry continues to use the saved Expired status from the existing lifecycle. Both toolbar and full-view status filters use the same display labels as cells. No stored statuses or expiry jobs are changed.

Display-status validation: all nine focused Bookings layout/status/order tests passed, including the amber/grey cells, matching Hold filtering, and Expired/Cancelled/Past precedence. Local inspection confirmed the saved test Hold and Block show their type labels. The full frontend run passed 121 of 123 tests, with failures in unchanged Service Jobs allocation and Service Providers creation tests. A focused rerun of those suites plus the Bookings suites passed all 22 tests. Targeted ESLint passed with existing page warnings only; whitespace checks passed. Calendar-matching color values were verified against `BookingsTimeline.css`.

The Status toolbar uses combined “Block / Hold” and “Past / Expired” options. Past / Expired matches either displayed Past or Expired. It matches either displayed Block or displayed Hold, then combines with Unit and Guest filters using AND. Past and Expired soft rows use Past / Expired; Cancelled retains its own filter. The combined label stays on one line and uses Calendar grey for Block and Calendar amber for Hold, including when selected. Changing this option resets pagination.

Final branch verification (2026-11-26): all 124 frontend tests passed across 28 suites; all 77 backend service and focused booking controller tests passed (299 assertions). Whitespace checks passed. The basic toolbar contains only + New Booking; combined status options preserve their individual text colors and match either status while combining with other filters.
