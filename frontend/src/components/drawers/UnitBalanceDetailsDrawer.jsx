import React, { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import { MiniSummaryCard, MiniUnitsCard } from '../common/AppDrawerMiniCardsLayout';

function toNum(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function fmtMoney(v) {
  const n = toNum(v);
  if (n == null) return '';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseDate(d) {
  if (!d) return null;
  const t = Date.parse(d);
  return Number.isNaN(t) ? null : t;
}

/**
 * UnitBalanceDetailsDrawer
 *
 * Renders a per-unit balance snapshot derived from ledger rows.
 * This is purely client-side: it uses the latest row per unit
 * (by date, then id) as the current balance reference.
 */
export default function UnitBalanceDetailsDrawer({ rows = [], onSelectUnit }) {
  const perUnit = useMemo(() => {
    const map = new Map();

    for (const r of rows || []) {
      const unitId = r?.unitId ?? r?.unit_id ?? r?.unit?.id ?? r?.unit?.unitId ?? r?.unit?.unit_id;
      const unitName = r?.unitName ?? r?.unit_name ?? r?.unit?.name ?? r?.unit?.unitName ?? r?.unit?.unit_name;

      // pick the most "balance after"-like field we can find
      const bal =
        r?.balanceAfter ??
        r?.balance_after ??
        r?.balance ??
        r?.closingBalance ??
        r?.closing_balance ??
        null;

      const dateStr = r?.date ?? r?.createdAt ?? r?.created_at ?? r?.timestamp ?? null;
      const dt = parseDate(dateStr) ?? 0;
      const id = Number(r?.id ?? 0) || 0;

      // If we can't associate a unit, skip.
      if (unitId == null && !unitName) continue;
      const key = unitId != null ? String(unitId) : String(unitName);

      const prev = map.get(key);
      if (!prev) {
        map.set(key, {
          key,
          unitId,
          unitName: unitName ?? String(unitId ?? ''),
          balance: toNum(bal) ?? 0,
          lastDate: dateStr,
          _dt: dt,
          _id: id,
        });
        continue;
      }

      // keep the latest row per unit: date ASC then id ASC in backend,
      // so "latest" means greater date, or same date and greater id.
      if (dt > prev._dt || (dt === prev._dt && id > prev._id)) {
        map.set(key, {
          ...prev,
          unitId,
          unitName: unitName ?? prev.unitName,
          balance: toNum(bal) ?? 0,
          lastDate: dateStr,
          _dt: dt,
          _id: id,
        });
      }
    }

    const list = Array.from(map.values());
    const nonZeroList = list.filter((u) => (u.balance ?? 0) !== 0);

    const filtered = nonZeroList;

    // Default ordering (mode=all):
    // 1) Negative balances first (O2 owes) [RED], sorted by owed amount (ABS) desc
    // 2) Then positive balances (clients owe), sorted by balance desc
    // Tie-breaker: unit name
    filtered.sort((a, b) => {
      const aRaw = a.balance ?? 0;
      const bRaw = b.balance ?? 0;

      const aO2 = -aRaw;
      const bO2 = -bRaw;

      const aNeg = aO2 < 0; // O2 owes (red)
      const bNeg = bO2 < 0;

      // O2 owes first
      if (aNeg !== bNeg) return aNeg ? -1 : 1;

      // both O2 owes: sort by abs desc (more owed first)
      if (aNeg && bNeg) {
        const aa = Math.abs(aO2);
        const bb = Math.abs(bO2);
        if (bb !== aa) return bb - aa;
      }

      // both receivable for O2: sort by amount desc
      if (!aNeg && !bNeg) {
        if (bO2 !== aO2) return bO2 - aO2;
      }

      return String(a.unitName ?? '').localeCompare(String(b.unitName ?? ''));
    });

    return filtered;
  }, [rows]);

  const totals = useMemo(() => {
    let o2Owes = 0;
    let clientsOweO2 = 0;
    for (const u of perUnit) {
      const raw = u.balance ?? 0;
      const bO2 = -raw;
      if (bO2 < 0) o2Owes += Math.abs(bO2);
      if (bO2 > 0) clientsOweO2 += bO2;
    }
    return { o2Owes, clientsOweO2 };
  }, [perUnit]);

  const netBalanceO2 = (totals.clientsOweO2 ?? 0) - (totals.o2Owes ?? 0);
  const netColor = netBalanceO2 < 0 ? '#B91C1C' : netBalanceO2 > 0 ? '#1E6F68' : '#6b7280';

  return (
  <Box
      sx={{
        pl: 1.5,
        pr: 1,
        pt: 3,
        pb: 2,
        maxWidth: '100%',
      }}
    >
      <MiniSummaryCard
        label="Summary"
        loading={false}
        rows={[
          {
            label: 'O2 owes',
            value: <span style={{ color: '#B91C1C' }}>{fmtMoney(totals.o2Owes)}</span>,
          },
          {
            label: 'Clients owe O2',
            value: <span style={{ color: '#1E6F68' }}>{fmtMoney(totals.clientsOweO2)}</span>,
          },
          {
            label: <span style={{ fontWeight: 700 }}>Balance</span>,
            value: <span style={{ color: netColor, fontWeight: 700 }}>{fmtMoney(netBalanceO2)}</span>,
          },
        ]}
      />

      <Box sx={{ mt: 3 }} />

      <MiniUnitsCard
        label="Units"
        loading={false}
        headerRight="Balance (O2)"
        rows={perUnit.map((u) => {
          const raw = u.balance ?? 0;
          const bO2 = -raw;
          const pos = bO2 > 0;
          const neg = bO2 < 0;
          const balColor = neg ? '#B91C1C' : pos ? '#1E6F68' : '#6b7280';

          return (
            <Box
              key={u.key}
              onClick={() => {
                if (typeof onSelectUnit === 'function') onSelectUnit(u);
              }}
              sx={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) 120px',
                alignItems: 'center',
                px: 0.5,
                gap: 0.5,
                cursor: typeof onSelectUnit === 'function' ? 'pointer' : 'default',
              }}
            >
              <Typography
                variant="body2"
                noWrap
                title={u.unitName}
                sx={{
                  pr: 0.5,
                  minWidth: 0,
                  color: 'text.primary',
                }}
              >
                {u.unitName}
              </Typography>

              <Typography
                variant="body2"
                sx={{
                  textAlign: 'right',
                  color: balColor,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {fmtMoney(bO2)}
              </Typography>
            </Box>
          );
        })}
      />

      <Box sx={{ mt: 1.25, color: '#9ca3af', fontSize: 12 }}>
        Note: balances are derived from the latest ledger row per unit, displayed from the Owners2 perspective.
      </Box>
    </Box>
  );
}