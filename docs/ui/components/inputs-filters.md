# Inputs and Filters

## References

- [Table Toolbar](table-toolbar.md)
- [Buttons](buttons.md)
- `frontend/src/components/layout/TableLite.jsx`
- `frontend/src/components/layout/components/YearMonthPicker.jsx`
- `frontend/src/theme.js`

## General

- New or redesigned desktop table filters should use MUI controls or shared
  components built from MUI primitives.
- Controls appearing together should look like one coherent system.
- Target standard desktop control height: `36px`.
- Compact controls may use `32px` where justified.
- Standard font size: `13px`.
- Standard border radius: `6px`.
- Use consistent border, background, typography, focus, and disabled treatments
  across control types.

## Supported control types

- Search and text input
- Select and dropdown
- Autocomplete
- Numeric input
- Month selector using the existing `YearMonthPicker`
- Clearable controls

Multi-select is not currently required by the table standard and should only be
introduced when a real use case requires it.

## Search

- Use a recognizable leading search icon.
- Use a meaningful placeholder such as `Search guest...`, `Search clients...`,
  or `Search transactions...`.
- Search may be wider than normal filters.
- Use sensible bounded widths on desktop; a search field should not
  automatically consume all remaining toolbar width.
- Avoid using a bare table-column underline as the primary search UI on
  redesigned pages.

## Select

- Use a bordered control consistent with other toolbar inputs.
- Clearly show the selected value.
- Use a consistent dropdown indicator.
- Keep widths appropriate to the expected content rather than making all
  filters equal width.

## Autocomplete

- Visually match normal select and text controls.
- Preserve type-ahead and keyboard selection behavior.
- Preserve clear behavior.
- Use autocomplete when the option set is sufficiently large that a normal
  select becomes inefficient.

## Numeric filters

- Visually match text inputs.
- Use appropriate numeric input semantics and input mode.
- The current table system only requires simple numeric matching; ranges and
  comparison operators should not be introduced until required by a real
  workflow.

## Month selector

- Continue using the existing shared `YearMonthPicker` technically.
- Restyle it to visually match the new input system when implementation begins.
- Preserve typed month entry, previous and next navigation, menu selection,
  clear behavior, jump dialog, and min/max bounds.
- Do not replace it merely for visual consistency if doing so would lose
  existing functionality.

## Labels

- Use visible labels above controls when context is not obvious, especially
  paired controls such as `Check-in month` and `Check-out month`.
- Floating labels are acceptable and useful when a filter's meaning would
  otherwise become unclear after a value is selected.
- Simple controls may rely on a clear selected value or placeholder when this
  saves useful vertical space without creating ambiguity.
- Do not use placeholder text as the only accessible label when an accessible
  name is otherwise required.
- Toolbar layout must leave sufficient vertical clearance for MUI floating
  labels in default, focused, and selected states. Labels must never be clipped
  by the row or container above them.
- Outlined controls must preserve MUI's clean `fieldset`/`legend` notch around
  a floating label in normal, focused, and selected states. The field border
  must not visibly run through or behind the label.

## Clear behavior

- Individual controls may expose a compact clear affordance when useful.
- Toolbar-level `Clear Filters` or `Reset Filters` follows the button standard
  and appears immediately after, or at the end of, the filter group.
- `Clear Filters` may be disabled when no filters are active.
- Standardize terminology rather than arbitrarily mixing `Clear Filters` and
  `Reset Filters`.

## States

- Define consistent default, hover, focus-visible, active or open, disabled,
  and error states.
- Focus-visible must be clearly identifiable.
- Error state should include more than color alone when user correction is
  required.
- Disabled values must remain readable.

## Spacing

- Controls in the same toolbar use consistent vertical alignment.
- Use approximately `8-12px` between related controls.
- Larger separation may distinguish logical groups.
- Provide enough separation above outlined controls for their floating labels
  without adding excessive whitespace.
- Avoid excessive whitespace because HausIn is an operational desktop
  interface.

## Widths

- Do not force every filter to the same width.
- Select width should reflect expected content.
- Search controls may be wider than selects, but should use bounded widths
  appropriate to the page rather than consuming all available desktop space.
- Avoid excessively wide controls that reduce table-toolbar efficiency.

The Unit Transactions prototype validates these example desktop proportions:

- Unit autocomplete: `190-220px`
- Type select: `150-180px`
- Description/search: `320-380px`

Treat these values as examples of relative proportions, not universal fixed
widths.

## Accessibility and behavior to preserve

- Keyboard operation for text, select, and autocomplete controls.
- Accessible labels for controls and icon-only actions.
- Autocomplete keyboard selection and clear behavior.
- `YearMonthPicker` typed entry, Enter and blur commit, invalid-value recovery,
  navigation, and clear behavior.
- Filter option lists derived from unfiltered source rows where currently
  applicable.
- Current AND semantics when multiple table filters are active unless a page
  explicitly defines different business logic.

## Table toolbar

Page-level filters belong in the external toolbar on redesigned pages rather
than inside `TableLite` column headers. See [Table Toolbar](table-toolbar.md).
Inline `TableLite` header filters may remain during incremental migration.

## Do

- Keep controls compact and aligned.
- Use consistent 36px sizing.
- Use descriptive labels and placeholders.
- Choose autocomplete for genuinely large option sets.
- Preserve keyboard and accessibility behavior.

## Do not

- Recreate the current underline-only column-filter appearance as the new
  standard.
- Mix unrelated control heights or styles in one toolbar.
- Make all controls the same width regardless of content.
- Introduce new custom native controls when MUI or shared controls satisfy the
  requirement.
- Sacrifice existing `YearMonthPicker` functionality solely for visual
  redesign.

## Migration

- Existing `TableLite` inline filters may remain while pages are migrated.
- External filter controls should reuse existing page/filter state and business
  logic where practical rather than rewriting filtering behavior unnecessarily.
- Migrate page by page and verify equivalent filtering before removing inline
  header filters.
