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

A table page is divided into three main areas:

1. Page toolbar
2. Table header
3. Scrollable table content

```text
┌──────────────────────────────────────────────────────────────┐
│ TITLE                                      PAGE ACTIONS      │
│ Short description                                            │
│                                                              │
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