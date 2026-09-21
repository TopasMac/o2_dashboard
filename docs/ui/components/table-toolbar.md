# Table Toolbar

## References

- [Table Page Pattern](../patterns/table-page.md)
- [Tables](tables.md)

## Role

The Table Toolbar is the controls area immediately above `TableLite`. It
standardizes page actions, external filters, search, and filter reset.

New or redesigned table pages should use this pattern instead of independently
arranging controls.

## Structure

The toolbar may contain two logical groups:

1. Actions
2. Filters and search

Actions appear first. Filters and search appear below actions when enough
controls exist to justify a separate row. Do not force an empty or unnecessary
second row on simple pages.

Complex page:

```text
[+ New Booking] [+ Block]                         [Export]

[Check-in] [Check-out] [Status] [Unit] [Search...] [Clear Filters]
```

Simple page:

```text
[+ New Client]                         [Search...] [Clear Filters]
```

## Actions

- The main creation or action button is the primary action.
- Normally only one action should receive the strongest visual treatment.
- Secondary actions use secondary or outlined treatment.
- Utility actions such as refresh or export may use compact secondary or icon
  controls.
- Destructive actions must not use the primary-action treatment.
- Keep action order consistent: primary operational actions first, secondary
  actions next, and utility actions last where practical.

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
- It should appear at or near the end of the filter group.
- Pages may hide or disable it when no filters are active if appropriate.
- Terminology should eventually be standardized across pages; avoid mixing
  `Clear Filters`, `Reset Filters`, and equivalent labels arbitrarily.

## Density

- Preserve vertical space because HausIn is an operational desktop application.
- Do not add large decorative headings or excessive whitespace inside the
  content card.
- If actions and filters comfortably fit on one row without reducing clarity,
  a single-row toolbar is acceptable.
- Use two rows when combining everything would make controls cramped or
  difficult to scan.

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

## Existing Application Boundary

This standard does not redesign:

- AppShell
- TopBar or global navigation
- Left sidebar
- Grey application background
- Existing white content-card outer dimensions
