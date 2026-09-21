# Buttons

## References

- [Table Toolbar](table-toolbar.md)
- `frontend/src/theme.js`
- `frontend/src/components/layouts/Buttons.css` (legacy)

## General

Use MUI `Button` and `IconButton` as the standard implementation for new or
redesigned desktop UI. The long-term target is for HausIn button styling to be
centralized through the MUI theme.

Legacy `.btn-*` classes may remain during migration but should not be used as
the basis for new UI. Normally use only one visually dominant primary action
per page or toolbar group.

## Primary

- Use a filled HausIn teal background.
- Use white text and icons.
- Use primary treatment for the main action, such as `+ New Transaction`,
  `+ New Booking`, or `+ New Client`.
- Do not use multiple primary buttons merely because several actions are
  available.

## Secondary

- Use a white or transparent background.
- Use HausIn teal text and border.
- Use secondary treatment for secondary operational actions such as
  `View Comments` and `+ Block`.
- Hover should provide a subtle teal treatment without competing with the
  primary action.

## Utility

- Use a neutral, low-emphasis treatment.
- Use utility controls for Export, Refresh, settings, navigation, and similar
  actions.
- A utility action may be a labeled button or icon-only button when its meaning
  is clear.

## Destructive

- Use a red semantic treatment.
- Reserve destructive treatment for destructive or difficult-to-reverse actions
  such as Delete.
- Never use red merely to create visual variety.

## Text action

- Do not use a filled background or prominent border.
- Use text actions for low-emphasis actions when appropriate.
- Text actions must remain clearly interactive.

## Icon buttons

- Use compact square controls.
- Use icon buttons for familiar actions such as back, forward, refresh, and
  settings.
- Provide a tooltip or accessibility label where the icon meaning may not be
  obvious.

## Sizing

- Standard desktop button height: `36px`.
- Compact or small controls: `32px` where appropriate.
- Standard font size: `13px`.
- Standard font weight: `500`.
- Standard border radius: `6px`.
- Standard horizontal padding: approximately `14-16px`.
- Compact buttons may use approximately `10-12px`.
- Controls appearing together should use consistent heights.

## Colors

- Primary HausIn teal: `#1E6F68`.
- Coral `#F57C4D` is an accent or warning color and must not be used as the
  generic secondary button color.
- Destructive actions use the shared semantic red token once finalized.
- Neutral utility controls use the shared neutral palette once finalized.
- Do not introduce arbitrary page-specific button colors.

## States

- Define distinct default, hover, focus-visible, and disabled states.
- Hover should increase affordance without dramatic visual movement.
- Focus-visible must have a clearly visible accessible focus indicator.
- Disabled controls must be visibly disabled while remaining readable.
- Do not rely only on color to communicate destructive or disabled meaning.

## Labels and icons

- Keep labels concise and action-oriented.
- Use consistent terminology across the application.
- Creation actions may use a leading plus icon.
- Icons should support the label rather than decorate buttons unnecessarily.
- Avoid very long button labels.

## Table toolbar usage

In a table toolbar, order controls logically:

1. Primary operational action
2. Secondary operational actions
3. Utility actions

Filter-reset controls are secondary or utility actions, never primary. See
[Table Toolbar](table-toolbar.md) for toolbar composition.

## Do

- Use one clear primary action.
- Keep labels short and descriptive.
- Use consistent sizing and spacing.
- Reserve destructive styling for destructive actions.
- Keep button order predictable.

## Do not

- Use multiple primary buttons simply to emphasize several actions.
- Use coral or orange as a generic secondary action color.
- Create custom button colors or styles independently on individual pages.
- Use destructive styling for normal actions.
- Mix legacy native button styling and new MUI styling within newly redesigned
  interfaces.

## Migration

- Existing MUI buttons can be migrated through centralized theme changes plus
  targeted page verification.
- Legacy `.btn-*` consumers should be migrated incrementally.
- Do not remove `Buttons.css` until its remaining consumers have been
  identified and migrated.
- Existing operational behavior must be preserved while visual styling changes.
