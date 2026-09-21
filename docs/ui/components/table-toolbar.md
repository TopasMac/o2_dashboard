# Table Toolbar

## References

- [Table Page Pattern](../patterns/table-page.md)
- [Tables](tables.md)

## Role

The Table Toolbar is the controls area immediately above `TableLite`. It
standardizes page identity, page actions, external filters, search, and filter
reset.

New or redesigned table pages should use this pattern instead of independently
arranging controls.

## Structure

The standard toolbar has two logical rows:

1. Title and page actions
2. Filters and search, when present

The title appears on the left. Page-level actions are grouped and right-aligned
on the same row. Filters and search appear below that row. Do not force an
empty filters row when a page has no filters.

Complex page:

```text
Bookings                                  [+ New Booking] [Export]

[Check-in] [Check-out] [Status] [Unit] [Search...] [Clear Filters]
```

Simple page:

```text
Clients                                            [+ New Client]

[Search clients...] [Clear Filters]
```

For simple pages, a compact one-row arrangement is acceptable only when it
retains a clear title/actions/filters hierarchy. Do not sacrifice that
hierarchy merely to force all controls onto one row.

## Component API

`TableToolbar` accepts these page-owned slots:

```jsx
<TableToolbar
  title="Page title"
  actions={...}
  filters={...}
  layout="stacked"
/>
```

- `title` provides the content-card page identity.
- `actions` contains page-level operational actions.
- `filters` contains page-level filters, search, and filter-reset controls.
- `layout` expresses the intended density: `stacked` keeps filters on their
  own row, `inline` keeps logical groups on one row when that is appropriate,
  and `auto` selects a compact wrapping arrangement.

The page owns each slot's business logic and control types; the toolbar owns
their logical grouping, order, and layout.

## Actions

- The main creation or action button is the primary action.
- Normally only one action should receive the strongest visual treatment.
- Secondary actions use secondary or outlined treatment.
- Utility actions such as refresh or export may use compact secondary or icon
  controls.
- Destructive actions must not use the primary-action treatment.
- Keep action order consistent: primary operational actions first, secondary
  actions next, and utility actions last where practical.
- Keep actions in the title/actions row. Do not put page-level actions in the
  filters row.

## Filters

- Page-level filters belong in the toolbar rather than inside `TableLite`
  column headers on redesigned pages.
- Related filters should be grouped together.
- Date and month selectors are filters and belong in this area.
- Filter controls should use consistent heights and spacing.
- Filters should not consume more width than necessary.
- Prefer meaningful labels or placeholders rather than relying only on icons.

## Search

- Search belongs with the filter controls.
- Use a recognizable search icon and useful placeholder.
- Search may be wider than normal filter controls.
- Search behavior remains page- and domain-specific; this standard defines only
  its placement and presentation.

## Clear Filters

- Clear or Reset Filters is a secondary utility action, never the primary
  button.
- It should appear immediately after, or at the end of, the filter group.
- Pages may hide or disable it when no filters are active if appropriate.
- Terminology should eventually be standardized across pages; avoid mixing
  `Clear Filters`, `Reset Filters`, and equivalent labels arbitrarily.

## Density

- Preserve vertical space because HausIn is an operational desktop application.
- Do not add large decorative headings or excessive whitespace inside the
  content card.
- Use the title/actions row plus a filters row when filters are present unless
  a simpler layout remains clearly structured.
- Do not combine rows when doing so would make controls cramped or difficult
  to scan.

## Sticky behavior

- The complete toolbar remains visible while the table body scrolls.
- `TableLite` column headers remain sticky immediately below it.
- The toolbar itself must not become part of the vertically scrolling table
  body.

## Overflow

- Desktop controls should use the available content-card width efficiently.
- Avoid wrapping individual logical control groups unpredictably.
- If the viewport becomes too narrow for the desktop arrangement, responsive
  behavior should be handled deliberately rather than allowing uncontrolled
  wrapping.

## Page ownership

- Individual pages remain responsible for defining the actions and filters they
  require and for their business logic and state.
- The shared toolbar is responsible for consistent layout and presentation.
- Pages should not duplicate toolbar spacing or layout CSS locally once the
  shared implementation exists.

## Migration

- Existing inline `TableLite` header filters may remain temporarily during
  migration.
- Pages should be migrated incrementally to external toolbar filters.
- Do not remove existing filtering behavior until equivalent external controls
  are verified.
- Preserve operational behavior during visual migration.
- `frontend/src/pages/Owners2UnitTransactions.jsx` is the first visually
  validated reference implementation. Its broader `TableLite` visual treatment
  is still in progress, so do not migrate other pages blindly.

## Existing Application Boundary

This standard does not redesign:

- AppShell
- TopBar or global navigation
- Left sidebar
- Grey application background
- Existing white content-card outer dimensions
