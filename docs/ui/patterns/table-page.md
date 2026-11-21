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
│ TITLE   PRIMARY ACTION                                      │
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

The page title sits on the left. When a page has one primary action, place it
next to the title. When a page has secondary or utility actions, group those
on the right of the same top row. Do not treat the global TopBar or navigation
title as sufficient page identity inside the content card.

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

`frontend/src/pages/Owners2UnitTransactions.jsx` is the deployed reference as of release #106 (`0d87b65`). The toolbar, opt-in table styling, and 25-row pagination were visually verified locally and smoke-tested in production by the owner.

Migrate comparable pages incrementally from current `main`, preserving each page's behavior and testing its filters, actions, drawers, scrolling, and responsive layout. Record converted pages in `IMPLEMENTATION_STATUS.md`.
