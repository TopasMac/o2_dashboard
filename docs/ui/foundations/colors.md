# Colors

## References

- [Buttons](../components/buttons.md)
- [Inputs and Filters](../components/inputs-filters.md)
- [Tables](../components/tables.md)

## Brand

| Token | Value |
| --- | --- |
| Primary Teal | `#1E6F68` |

Teal is the primary HausIn interactive and brand color.

## Surfaces

| Token | Value |
| --- | --- |
| Content/Card | `#FFFFFF` |

White is the primary content surface. Preserve the existing application grey
background; it is not redefined by this initial foundation.

## Text

| Token | Value |
| --- | --- |
| Primary | `#1F2937` |
| Secondary | `#6B7280` |
| Muted | `#9CA3AF` |

Neutral greys provide hierarchy, borders, secondary text, and subtle UI
separation.

## Borders

| Token | Value |
| --- | --- |
| Standard | `#E5E7EB` |
| Subtle | `#F1F3F5` |

## Semantic

| Token | Value |
| --- | --- |
| Success | `#2E7D5B` |
| Danger | `#D9534F` |
| Warning / Accent Coral | `#F57C4D` |

- Coral is an accent or warning color, not the generic secondary-action color.
- Red is reserved for destructive or error meaning.
- Green is reserved for success or positive semantic meaning.
- Semantic colors should communicate meaning consistently across modules.
- Color must not be the only method used to communicate important status or
  meaning.

## Usage rules

- Do not introduce arbitrary page-specific colors.
- Hover, focus, selected, and subtle-background variants may use derived shades
  of these tokens.
- Exact derived values should be finalized during implementation and visual
  testing rather than invented independently per page.
