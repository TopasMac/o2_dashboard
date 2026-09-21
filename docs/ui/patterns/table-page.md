# Table Page Pattern

## Purpose

This pattern defines the standard desktop layout for HausIn pages whose primary content is a data table.

Examples include:

- Reservations
- Units
- Clients
- Transactions
- Housekeeping transactions
- Service payments
- Employees
- Service providers

The goal is to provide a consistent layout across operational pages while maximizing the amount of useful information visible on screen.

---

## Standard Layout

A table page is divided into four main areas inside the existing white content
card:

1. Page title and actions
2. Filters, when present
3. Table header
4. Scrollable table content

```text
┌──────────────────────────────────────────────────────────────┐
│ TITLE                                      PAGE ACTIONS      │
│ FILTERS / SEARCH / CLEAR FILTERS                             │
├──────────────────────────────────────────────────────────────┤
│ TABLE COLUMN HEADERS                                         │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│                   SCROLLABLE TABLE                           │
│                                                              │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│ RESULTS / TABLE INFORMATION                                  │
└──────────────────────────────────────────────────────────────┘
```

The page title sits on the left and page-level actions are grouped on the
right of the same top row. Do not treat the global TopBar or navigation title
as sufficient page identity inside the content card.

Do not add a subtitle or description by default. Add one only when a page
genuinely needs explanatory context that the title and controls cannot provide.

For simple pages, a compact toolbar is acceptable when it preserves this
hierarchy. Do not force all controls onto one row merely to make the toolbar
more compact.

## Existing Application Boundary

This pattern begins inside the existing white content card. It does not
redesign the AppShell, global TopBar or navigation, left sidebar, grey
application background, or the outer white-card geometry.

## Prototype and Migration Status

`frontend/src/pages/Owners2UnitTransactions.jsx` is the first reference
implementation of this desktop table-page pattern. Its title/actions/filters
toolbar has been visually validated, but the broader `TableLite` visual
treatment is still being developed.

Do not migrate other table pages blindly. Migrate incrementally only after the
prototype is complete and the page's existing behavior has been verified.