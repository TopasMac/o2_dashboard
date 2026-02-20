import React, { useEffect, useMemo, useState } from 'react';
import TableLite from '../components/layout/TableLite';
import AppDrawer from '../components/common/AppDrawer';
import UnitBalanceNewUnitLedgerForm from '../components/forms/UnitBalancePage/UnitBalanceNewUnitLedgerForm';
import EditUnitLedgerForm from '../components/forms/EditUnitLedgerForm';
import UnitBalanceDetailsDrawer from '../components/drawers/UnitBalanceDetailsDrawer';
import api from '../api';

import { HiOutlineDocumentText } from 'react-icons/hi';
import PreviewOverlay from '../components/layouts/PreviewOverlay';
import DocumentPreview from '../components/common/DocumentPreview';
import PageScaffold from '../components/layout/PageScaffold';
import TablePageHeader from '../components/layout/TablePageHeader';

const toYmd = (s) => (s ? String(s).slice(0, 10) : '');
const ddmmyy = (ymd) => {
  if (!ymd || ymd.length < 10) return '';
  const [y, m, d] = ymd.slice(0, 10).split('-');
  return `${d}-${m}-${y}`;
};

const unitFromIri = (u) => {
  if (!u) return '';
  if (typeof u === 'string') {
    const m = u.match(/\/units\/(\d+)/);
    return m ? `Unit #${m[1]}` : u;
  }
  if (u['@id'] && typeof u['@id'] === 'string') {
    const m = u['@id'].match(/\/units\/(\d+)/);
    return m ? `Unit #${m[1]}` : u['@id'];
  }
  if (typeof u.id !== 'undefined') return `Unit #${u.id}`;
  return '';
};


const extractId = (res) => {
  if (!res) return null;
  try {
    if (typeof res === 'number') return res;
    if (res && typeof res === 'object') {
      if (res.id) return res.id;
      const atId = res['@id'];
      if (typeof atId === 'string') {
        const m = atId.match(/\/(\d+)$/);
        if (m) return Number(m[1]) || m[1];
      }
    }
  } catch (_) {}
  return null;
};

// Helper to compute the backend origin from the axios api instance
const backendOrigin = (() => {
  try {
    const base = api?.defaults?.baseURL || '';
    if (base) return new URL(base, window.location.href).origin;
  } catch (_) {}
  try {
    return new URL('/', window.location.href).origin;
  } catch (_) { return ''; }
})();

// Helper to absolutize URLs against backend origin
const absolutize = (href) => {
  if (!href) return '';
  try {
    // If href is relative (starts with '/'), resolve against backend origin
    const u = new URL(href, backendOrigin);
    return u.href;
  } catch (_) {
    return href;
  }
};

export default function UnitBalance() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);         // ledger rows
  const [error, setError] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedLedgerId, setSelectedLedgerId] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewTitle, setPreviewTitle] = useState('Document Preview');

  useEffect(() => {
    const handler = () => {
      // trigger refetch by bumping refreshKey
      setRefreshKey((k) => k + 1);
    };
    window.addEventListener('unit-ledger-refresh', handler);
    window.addEventListener('report-deleted', handler);
    return () => {
      window.removeEventListener('unit-ledger-refresh', handler);
      window.removeEventListener('report-deleted', handler);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        // fetch ledger entries ordered by date desc
        const q = new URLSearchParams();
        q.set('order[date]', 'desc');
        // Fetch all rows so client-side filter can see every unit (e.g., Menesse_224)
        q.set('pagination', 'false');
        q.set('itemsPerPage', '1000');

        const ledRes = await api.get('/api/unit_balance_ledgers', {
          params: Object.fromEntries(q.entries()),
        });
        const ledJson = ledRes.data;
        const items =
          Array.isArray(ledJson['member']) ? ledJson['member'] :
          Array.isArray(ledJson['hydra:member']) ? ledJson['hydra:member'] :
          Array.isArray(ledJson) ? ledJson : [];

        // Build base rows
        const rowsBase = items.map((it) => {
          const unitLabel = it.unitName || (it.unit && it.unit.unitName) || unitFromIri(it.unit) || '';
          // Prefer API dateDisplay (business date) if provided; else use date; never use txnDate in Date column
          const apiDisp = toYmd(it.dateDisplay);
          const d = apiDisp || toYmd(it.date);
          const ca = toYmd(it.createdAt);
          const docs = Array.isArray(it.documents) ? it.documents : [];
          return {
            unitLabel,
            unitName: unitLabel,
            id: it.id,
            unitDisplay: (
              <span
                role="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSelectedLedgerId(it.id); setDrawerOpen(true); }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#F57C4D'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = ''; }}
                style={{ cursor: 'pointer' }}
              >
                {unitLabel}
              </span>
            ),
            date: d,                      // used for sorting/filtering (YYYY-MM-DD)
            dateDisplay: ddmmyy(d),       // render as DD-MM-YYYY
            createdAt: ca,
            createdAtDisplay: ddmmyy(ca),
            type: it.entryType,
            amount: Number(it.amount ?? 0),
            balanceAfter: Number(it.balanceAfter ?? 0),
            paymentMethod: it.paymentMethod || '',
            reference: it.reference || '',
            note: it.note || '',
            createdBy: it.createdBy || '',
            documents: docs,
            docUrl: '',
            docTitle: '',
          };
        });

        // Batch-lookup unit documents by ledgerId to avoid N+1 requests
        let mapped = rowsBase;
        try {
          const ledgerIds = rowsBase.map(r => r.id).filter(Boolean);
          if (ledgerIds.length > 0) {
            const resp = await api.post('/api/unit-documents/lookup', { ledgerIds });
            // Support common container shapes
            const container = resp?.data ?? {};
            let lookup = (container && typeof container === 'object' && container.data) ? container.data : container;
            if (Array.isArray(container?.docs)) lookup = container.docs;
            if (Array.isArray(container?.documents)) lookup = container.documents;

            // Normalize lookup into a map: ledgerId -> [docs]
            const asArray = (v) => Array.isArray(v) ? v : (v ? [v] : []);
            const mapByKey = new Map();
            if (Array.isArray(lookup)) {
              // array of docs → group by ledgerId
              for (const d of lookup) {
                const lid = typeof d?.ledgerId !== 'undefined' ? String(d.ledgerId) : undefined;
                if (!lid) continue;
                if (!mapByKey.has(lid)) mapByKey.set(lid, []);
                mapByKey.get(lid).push(d);
              }
            } else if (lookup && typeof lookup === 'object') {
              // keyed object → values may be a doc or array of docs
              for (const k of Object.keys(lookup)) {
                mapByKey.set(String(k), asArray(lookup[k]));
              }
            }

            const pickLatest = (val) => {
              const arr = asArray(val);
              if (!arr.length) return null;
              // sort by uploadedAt desc if present
              const sorted = arr.slice().sort((a, b) => {
                const ax = a?.uploadedAt ? new Date(a.uploadedAt).getTime() : 0;
                const bx = b?.uploadedAt ? new Date(b.uploadedAt).getTime() : 0;
                return bx - ax;
              });
              return sorted[0] || null;
            };

            mapped = rowsBase.map(r => {
              const key = String(r.id);
              let hit = pickLatest(mapByKey.get(key));

              // Fallback: if not found by key, search through all docs by matching ledgerId
              if (!hit && mapByKey.size) {
                for (const [k, list] of mapByKey.entries()) {
                  for (const d of asArray(list)) {
                    if (String(d?.ledgerId) === key) { hit = d; break; }
                  }
                  if (hit) break;
                }
              }

              const url = hit?.publicUrl || hit?.s3Url;
              if (url) {
                const href = absolutize(url);
                const title = hit?.label || 'Document';
                return { ...r, docUrl: href, docTitle: title };
              }
              return r;
            });
          }
        } catch (_) {
          // fallback: leave mapped as rowsBase with empty doc fields
          mapped = rowsBase;
        }
        mapped = mapped.sort((a, b) => {
          const ax = a.date || '';
          const bx = b.date || '';
          if (ax > bx) return -1;
          if (ax < bx) return 1;
          return 0;
        });
        if (!cancelled) {
          setRows(mapped);
        }
      } catch (e) {
        if (!cancelled) setError(e.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [refreshKey]);

  const paymentsSummary = useMemo(() => {
    // Build latest balanceAfter per unit
    const latestByUnit = new Map();
    // rows are already sorted desc by date; first occurrence per unit is latest
    for (const r of rows) {
      const key = r.unitName || r.unitDisplay || r.id;
      if (!latestByUnit.has(key)) {
        latestByUnit.set(key, Number(r.balanceAfter || 0));
      }
    }
    let sumPos = 0; // positive balances (we owe clients)
    let sumNegAbs = 0; // absolute of negative balances (clients owe us)
    latestByUnit.forEach((bal) => {
      const v = Number(bal || 0);
      if (v > 0) sumPos += v;
      else if (v < 0) sumNegAbs += Math.abs(v);
    });
    const o2ToClients = -sumPos;      // render as negative
    const clientsToO2 = sumNegAbs;    // render as positive
    const balance = o2ToClients + clientsToO2;
    const fmt = (n) => (Number.isFinite(n) ? n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00');
    return { sumPos, sumNegAbs, o2ToClients, clientsToO2, balance, fmt };
  }, [rows]);

  const unitFilterOptions = useMemo(() => {
    const entries = new Map();
    rows.forEach((r) => {
      const label = r.unitLabel || r.unitName || '';
      if (!label) return;
      if (!entries.has(label)) entries.set(label, label);
    });
    return Array.from(entries.entries()).map(([value, label]) => ({ value, label }));
  }, [rows]);

  const typeFilterOptions = useMemo(() => {
    const values = Array.from(new Set(rows.map((r) => r.type).filter(Boolean))).sort((a, b) =>
      String(a).localeCompare(String(b))
    );
    return values.map((value) => ({ value, label: value }));
  }, [rows]);

  const columns = useMemo(() => ([
    {
      header: 'Unit',
      accessor: 'unitName',
      cell: (row) => row.unitDisplay,
      filter: {
        type: 'autocomplete',
        inline: true,
        placeholder: 'Unit',
        options: unitFilterOptions,
        valueAccessor: (row) => row.unitLabel || row.unitName || '',
        getOptionLabel: (option) => {
          if (!option) return '';
          if (typeof option === 'string') return option;
          return option.label ?? option.value ?? '';
        },
      },
      width: 220,
      minWidth: 220,
    },
    {
      header: 'Date',
      accessor: 'date',
      cell: (row) => row.dateDisplay,
      filterType: 'monthYear',
      inlineFilter: true,
      width: 150,
      minWidth: 150,
    },
    {
      header: 'Type',
      accessor: 'type',
      filter: {
        type: 'select',
        inline: true,
        placeholder: 'Type',
        options: typeFilterOptions,
      },
      width: 150,
      minWidth: 150,
    },
    {
      header: 'Amount',
      accessor: 'amount',
      align: 'right',
      format: 'money',
      type: 'currency',
      width: 130,
      minWidth: 130,
      cellStyle: { maxWidth: 130 },
    },
    {
      header: 'Balance',
      accessor: 'balanceAfter',
      align: 'right',
      format: 'money',
      type: 'currency',
      width: 130,
      minWidth: 130,
      cellStyle: { maxWidth: 130 },
    },
    {
      header: 'Method',
      accessor: 'paymentMethod',
      width: 110,
      minWidth: 110,
    },
    {
      header: 'File',
      accessor: 'docUrl',
      width: 110,
      minWidth: 110,
      cell: (row) => {
        const href = typeof row?.docUrl === 'string' ? row.docUrl : '';
        if (!href) return '';
        const title = row?.docTitle || 'Document';
        return (
          <button
            type="button"
            title="Preview document"
            style={{
              lineHeight: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              textDecoration: 'none',
              border: 'none',
              background: 'transparent',
              padding: 0,
              margin: 0,
              cursor: 'pointer'
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setPreviewTitle(title);
              setPreviewUrl(href);
              setPreviewOpen(true);
            }}
          >
            <HiOutlineDocumentText size={18} />
          </button>
        );
      },
    },
    {
      header: 'Reference',
      accessor: 'reference',
      minWidth: 180,
    },
    {
      header: 'Notes',
      accessor: 'note',
      minWidth: 220,
    },
    // Removed "Created By" column
  ]), [setPreviewUrl, setPreviewTitle, setPreviewOpen, unitFilterOptions, typeFilterOptions]);

  const netBalanceO2 = Number(paymentsSummary.balance || 0);
  const netBalanceColor = netBalanceO2 < 0 ? '#B91C1C' : netBalanceO2 > 0 ? '#1E6F68' : '#6b7280';
// Payments Balance box JSX to reuse in actions
  const paymentsBalanceBox = (
    <div
      style={{
        position: 'relative',
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        padding: '12px 30px',
        background: '#fff',
        maxWidth: '700px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: 24
      }}
    >
      {/* Notched label on the top border */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 12,
          transform: 'translateY(-50%)',
          background: '#fff',
          padding: '0 8px',
          fontSize: 12,
          fontWeight: 700,
          color: '#374151',
          lineHeight: 1,
        }}
      >
        Payments Balance
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 24, flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: '#374151', fontSize: 13, fontWeight: 700 }}>Balance:</span>
          <span style={{ fontWeight: 700, color: netBalanceColor, fontVariantNumeric: 'tabular-nums' }}>
            {paymentsSummary.fmt(netBalanceO2)}
          </span>
        </div>
        <div style={{ width: 2, alignSelf: 'stretch', background: '#e5e7eb', margin: '2px 0' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: '#374151', fontSize: 13 }}>To Pay:</span>
          <span style={{ fontWeight: 400, color: '#B91C1C', fontVariantNumeric: 'tabular-nums' }}>
            {paymentsSummary.fmt(Math.abs(paymentsSummary.o2ToClients))}
          </span>
        </div>
        <div style={{ width: 2, alignSelf: 'stretch', background: '#e5e7eb', margin: '2px 0' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: '#374151', fontSize: 13 }}>To Collect:</span>
          <span style={{ fontWeight: 400, color: '#1E6F68', fontVariantNumeric: 'tabular-nums' }}>
            {paymentsSummary.fmt(paymentsSummary.clientsToO2)}
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setDetailsOpen(true)}
        style={{
          padding: '6px 10px',
          borderRadius: 8,
          border: '1px solid #e5e7eb',
          background: '#fff',
          color: '#374151',
          fontWeight: 600,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        Details
      </button>
    </div>
  );

  const stickyHeaderContent = (
    <TablePageHeader
      summary={(
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button
            type="button"
            onClick={() => { setSelectedLedgerId(null); setDrawerOpen(true); }}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid #e5e7eb',
              background: '#F57C4D',
              color: '#fff',
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Add +
          </button>

          {paymentsBalanceBox}
        </div>
      )}
      actions={null}
    />
  );

  return (
    <PageScaffold
      title="Unit Balance — All Units"
      layout="table"
      withCard
      headerPlacement="inside"
      stickyHeader={stickyHeaderContent}
    >
      <div style={{ paddingBottom: 16 }}>
        <TableLite
          rows={rows}
          columns={columns}
          loading={loading}
          emptyMessage={error ? `Error: ${error}` : 'No ledger entries yet.'}
          enableFilters
          optionsSourceRows={rows}
          defaultStringTransform={null}
        />

        <AppDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="New Unit Balance Ledger Entry">
          {selectedLedgerId ? (
            <EditUnitLedgerForm
              caller="unit-balance"
              ledgerId={selectedLedgerId}
              onCancel={() => {
                setDrawerOpen(false);
                setSelectedLedgerId(null);
              }}
              onSuccess={(result) => {
                setDrawerOpen(false);
                setSelectedLedgerId(null);
                try { window.dispatchEvent(new Event('unit-ledger-refresh')); } catch {}
                try {
                  const id = extractId(result) ?? selectedLedgerId;
                  if (id) window.dispatchEvent(new CustomEvent('datatable:highlight', { detail: { id } }));
                } catch {}
              }}
            />
          ) : (
            <UnitBalanceNewUnitLedgerForm
              caller="unit-balance"
              onCancel={() => {
                setDrawerOpen(false);
                setSelectedLedgerId(null);
              }}
              onSuccess={(result) => {
                setDrawerOpen(false);
                setSelectedLedgerId(null);
                try { window.dispatchEvent(new Event('unit-ledger-refresh')); } catch {}
                try {
                  const id = extractId(result);
                  if (id) window.dispatchEvent(new CustomEvent('datatable:highlight', { detail: { id } }));
                } catch {}
              }}
            />
          )}
        </AppDrawer>

        <AppDrawer
          open={detailsOpen}
          onClose={() => setDetailsOpen(false)}
          title="Payments Balance — Details"
          width={420}
          showActions={false}
        >
          <div style={{ padding: 12 }}>
            <UnitBalanceDetailsDrawer
              rows={rows}
              onSelectUnit={(u) => {
                // optional: when we later add a unit filter, we can set it here
                // for now we just close the drawer to keep UX snappy
                try {
                  if (u?.unitId) {
                    window.dispatchEvent(new CustomEvent('datatable:highlight', { detail: { unitId: u.unitId } }));
                  }
                } catch (_) {}
                setDetailsOpen(false);
              }}
            />
          </div>
        </AppDrawer>

        <PreviewOverlay
          open={previewOpen}
          onClose={() => { setPreviewOpen(false); setPreviewUrl(''); setPreviewTitle('Document Preview'); }}
          title={previewTitle}
        >
          <DocumentPreview url={previewUrl} />
        </PreviewOverlay>
      </div>
    </PageScaffold>
  );
}
