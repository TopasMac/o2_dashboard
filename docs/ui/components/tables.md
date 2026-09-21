# Tables

## References

- [Table Page Pattern](../patterns/table-page.md)
- `frontend/src/components/layout/TableLite.jsx`
- `frontend/src/components/layout/TableLite.css`
- `frontend/src/components/layout/PageScaffoldTable.jsx`

## Role

`TableLite` is the standard shared desktop data-table component for HausIn
operational pages. Existing pages should reuse it rather than introduce new
independent table implementations unless there is a genuine functional
requirement.

`DataTable` is a legacy implementation and is not the standard for new table
work.

## Table header

- Column headers remain sticky while rows scroll.
- Headers should be visually clean and relatively lightweight.
- Use clear labels with consistent alignment to their cells.
- Sorting indicators may be shown where sorting is supported.
- Do not use the column header area as the primary location for page filters.

## Filters

The target standard moves page-level filters and search out of individual
column headers. Filters belong in the Table Page filter bar defined by
[Table Page Pattern](../patterns/table-page.md).

`TableLite` may continue supporting filtering technically during migration,
but new or redesigned pages should prefer the shared external filter bar.

## Rows

- Use subtle horizontal separators rather than heavy full-cell grid borders.
- Avoid visually dominant zebra striping by default.
- Row height should be compact enough for operational scanning while allowing
  comfortable readability.
- Provide a subtle hover state.
- Primary values use normal or strong text hierarchy.
- Secondary metadata may appear below primary information using smaller,
  muted text.
- Avoid excessive bold text.

## Alignment

- Text and identifying information normally align left.
- Monetary and numeric values normally align right when appropriate.
- Actions normally align right.
- Headers follow the alignment of their corresponding values.

## Column widths

- Columns may define sensible initial widths.
- Preserve existing resizable-column capability.
- Do not compress content until important values become difficult to read.
- Horizontal scrolling is acceptable for genuinely wide datasets.

## Actions

- Repeated row actions should use consistent iconography and placement.
- Prefer compact icon actions when the meaning is familiar and unambiguous.
- Less obvious actions should include labels or tooltips.
- Destructive actions must be visually distinguishable from normal actions.

## Status

Status values should use the shared badge or status treatment once that
component standard exists. Do not create unrelated status styling
independently on each table page.

## Amounts

- Monetary formatting must be consistent.
- Currency should be shown where relevant.
- Positive, negative, income, or expense color treatments may be used when
  semantically useful, but color should not be the only indication of meaning.

## Scrolling

- Preserve `TableLite`'s internal vertical scrolling capability.
- Sticky column headers remain visible.
- Table height should adapt to the available viewport as described in
  [Table Page Pattern](../patterns/table-page.md).
- Horizontal scrolling remains available when required.

## Pagination

- Continuous vertical scrolling is the preferred experience.
- Existing previous and next pagination support may remain available for large
  or server-driven datasets.
- Do not introduce visible numbered pagination as the default table experience.

## States

- Loading, empty, and error states should be handled consistently by the
  shared component.
- Empty states should clearly explain that no records match the current data
  or filter state.

## Page-specific customization

Pages may define columns, widths, renderers, data formatting, and operational
actions. Pages should avoid overriding common table appearance through local
CSS, inline styles, or local `<style>` blocks when the styling belongs to the
shared standard. Common visual behavior should be implemented centrally in
`TableLite`.

## Migration

- Existing pages do not need to be migrated simultaneously.
- Shared changes should be introduced carefully and pages migrated and verified
  incrementally.
- Existing operational behavior must be preserved during visual migration.
