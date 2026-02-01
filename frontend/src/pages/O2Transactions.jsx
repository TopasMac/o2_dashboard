import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import TableLite from '../components/layout/TableLite';
import api from '../api';
import EditO2TransactionForm from '../components/forms/EditO2TransactionForm';
import NewO2TransactionForm from '../components/forms/NewO2TransactionForm';
import AppDrawer from '../components/common/AppDrawer';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import PageScaffold from '../components/layout/PageScaffold';
import YearMonthPicker from '../components/layout/components/YearMonthPicker';
import { Button, Stack, Typography } from '@mui/material';

// Helpers to avoid timezone shifts — treat API dates as plain dates
const toYmd = (s) => {
  if (!s) return '';
  const str = typeof s === 'string' ? s : String(s);
  // Take only the first 10 chars (YYYY-MM-DD), ignoring any time / timezone
  return str.length >= 10 ? str.slice(0, 10) : str;
};

const toDdMmYy = (s) => {
  const ymd = toYmd(s);
  if (!ymd.includes('-')) return '';
  const [y, m, d] = ymd.split('-');
  return `${d}-${m}-${y}`;
};

// Helper to get current YYYY-MM
const getCurrentYm = () => {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  return `${now.getFullYear()}-${mm}`;
};


export default function O2Transactions() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [isCreating, setIsCreating] = useState(false);

  const [docPreviewOpen, setDocPreviewOpen] = useState(false);
  const [docPreviewUrl, setDocPreviewUrl] = useState('');
  const [docPreviewTitle, setDocPreviewTitle] = useState('');

  const [isAdmin, setIsAdmin] = useState(false);

  const [resetNonce, setResetNonce] = useState(0);

  const [yearMonthFilter, setYearMonthFilter] = useState('');

  const location = useLocation();
  const [focusHandled, setFocusHandled] = useState(false);

  const openDrawer = (id) => { setIsCreating(false); setSelectedId(id); setDrawerOpen(true); };
  const openNewDrawer = () => { setIsCreating(true); setSelectedId(null); setDrawerOpen(true); };
  const closeDrawer = () => { setDrawerOpen(false); setSelectedId(null); setIsCreating(false); };

  const extractId = (res) => {
    if (!res) return selectedId;
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
    return selectedId;
  };

  const closeAndRefresh = async (highlightId) => {
    closeDrawer();
    try {
      await fetchTransactions();
    } catch (_) {}
    if (highlightId) {
      try {
        window.dispatchEvent(new CustomEvent('datatable:highlight', { detail: { id: highlightId } }));
      } catch (_) {}
    }
  };


  const filteredRows = useMemo(() => {
    if (!rows || rows.length === 0) return rows;

    // If a specific month is selected, filter strictly by it
    if (yearMonthFilter) {
      return rows.filter((r) => r.yearMonth === yearMonthFilter);
    }

    // Default: current month + all previous months (exclude future)
    const currentYm = getCurrentYm();
    return rows.filter((r) => r.yearMonth && r.yearMonth <= currentYm);
  }, [rows, yearMonthFilter]);

  // Define columns (no `id` column)
  const columns = useMemo(() => [
    {
      header: 'Code',
      accessor: 'transactionCode',
      render: (value, row) => ({
        top: toDdMmYy(row.date),
        bottom: (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              try {
                openDrawer(row.id);
              } catch (_) {}
            }}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              margin: 0,
              cursor: 'pointer',
              color: '#1e6f68',
              textDecoration: 'none',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'orange')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#1e6f68')}
          >
            {value}
          </button>
        ),
      }),
    },
    {
      header: 'Cost Centre',
      accessor: 'costCentre',
      render: (value) => {
        if (value === 'Owners2_Playa') return 'Playa';
        if (value === 'Owners2_Tulum') return 'Tulum';
        if (value === 'Owners2') return 'General';
        return value;
      },
    },
    {
      header: 'Category',
      accessor: 'categoryName',
      filterable: true,
      filterType: 'select',
      width: '200px',
      minWidth: '200px',
    },
    {
      header: 'Type',
      accessor: 'type',
      filterable: true,
      filterType: 'select',
      width: '140px',
      minWidth: '140px',
      filterOptions: [
        { label: 'All', value: '' },
        { label: 'Ingreso', value: 'Ingreso' },
        { label: 'Gasto', value: 'Gasto' },
      ],
    },
    { header: 'Description', accessor: 'description' },
    {
      header: 'Amount',
      accessor: 'amount',
      format: 'money',
      isMoney: true,
    },
    { header: 'Comments', accessor: 'comments' },
    {
      header: 'File',
      accessor: 'documentUrl',
      render: (value, row) =>
        value ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              try {
                setDocPreviewUrl(value);
                setDocPreviewTitle(`Document`);
                setDocPreviewOpen(true);
              } catch (_) {}
            }}
            title="Open document"
            aria-label="Open document"
            style={{
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <InsertDriveFileOutlinedIcon fontSize="small" sx={{ color: '#1e6f68' }} />
          </button>
        ) : '',
    },
  ], []);

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      const res = await api.get('/api/o2transactions');
      const data = res.data;
      const listRaw = (data.member || data['hydra:member'] || [])
        .map((item) => {
          const amountNum = item.amount ? Number(item.amount) : 0;
          const documentUrl = item.documentUrl || item.document_url || '';
          const hasDocument = !!documentUrl;
          const dateYmd = toYmd(item.date);
          const yearMonth = dateYmd ? dateYmd.slice(0, 7) : '';
          return {
            id: item.id ?? item.__id ?? null,
            transactionCode: item.transactionCode || item.transaction_code || '',
            date: dateYmd,
            yearMonth,
            costCentre: item.costCentre || item.cost_centre || '',
            city: item.city || '',
            categoryName: item.categoryName || item.category_name || '',
            type: item.type || '',
            description: item.description || '',
            amount: amountNum,
            amountDisplay: amountNum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            documentUrl,
            comments: item.comments || '',
            private: item?.private === true || item?.private === 1 || item?.private === 'true',
          };
        });

      // Sort by date descending
      const list = listRaw.sort((a, b) => b.date.localeCompare(a.date));

      let filteredList = list;
      if (!isAdmin) {
        filteredList = list.filter(item => !item.private);
      }
      setRows(filteredList);
    } catch (e) {
      console.error('Error loading O2 transactions', e);
      setError('Error loading O2 transactions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    function computeIsAdmin() {
      try {
        const rolesRaw = localStorage.getItem('roles');
        const roles = rolesRaw ? JSON.parse(rolesRaw) : [];
        setIsAdmin(Array.isArray(roles) && roles.includes('ROLE_ADMIN'));
      } catch (e) {
        setIsAdmin(false);
      }
    }
    computeIsAdmin();

    // Also recompute when tab becomes visible again (user may log in/out elsewhere)
    const onVisibility = () => computeIsAdmin();
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    // Reset focus highlight handling when the URL search changes
    setFocusHandled(false);
  }, [location.search]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!mounted) return;
      await fetchTransactions();
    })();
    return () => { mounted = false; };
  }, [isAdmin]);

useEffect(() => {
  const search = location.search || '';
  if (!search) return;

  const params = new URLSearchParams(search);
  const focusId = params.get('focusId');
  if (!focusId) return;

  // Only attempt highlight once data is loaded and we haven't handled this focus yet
  if (loading) return;
  if (!rows || rows.length === 0) return;
  if (focusHandled) return;

  try {
    const id = Number(focusId) || focusId;
    window.dispatchEvent(new CustomEvent('datatable:highlight', { detail: { id } }));
  } catch (e) {
    console.error('Error dispatching datatable:highlight for focusId', e);
  }
  setFocusHandled(true);

  // After using focusId once, remove it from the URL so refreshes don't re-highlight
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('focusId');
    window.history.replaceState({}, '', url.toString());
  } catch (e) {
    // If URL API is not available, fail silently
  }
}, [location.search, loading, rows, focusHandled]);

  const handleResetFilters = async () => {
    setYearMonthFilter('');
    try {
      setResetNonce((n) => n + 1);
    } catch (_) {}
    try {
      window.dispatchEvent(new CustomEvent('datatable:reset-filters'));
      window.dispatchEvent(new CustomEvent('datatable:clear-search'));
      window.dispatchEvent(new CustomEvent('datatable:refresh'));
    } catch (_) {}
    try {
      await fetchTransactions();
    } catch (_) {}
  };

  const stickyHeader = (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ flexWrap: 'wrap', alignItems: { sm: 'center' } }}>
      <Button variant="contained" onClick={openNewDrawer}>
        + New Transaction
      </Button>
      <YearMonthPicker
        value={yearMonthFilter}
        onChange={(ym) => setYearMonthFilter(ym || '')}
        label="Month"
        sx={{ minWidth: 160 }}
      />
    </Stack>
  );

  return (
    <PageScaffold
      title="Owners2 Transactions"
      sectionKey="transactions"
      currentPath="/o2-transactions"
      layout="table"
      stickyHeader={stickyHeader}
    >
      <Stack spacing={1.5} sx={{ flex: 1, minHeight: 0 }}>
        {error && (
          <Typography variant="body2" color="error">
            {error}
          </Typography>
        )}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, minHeight: 0 }}>
            <TableLite
              key={resetNonce}
              columns={columns}
              rows={filteredRows}
              loading={loading}
              error={error}
              dense
              enableFilters
              optionsSourceRows={filteredRows}
              onRowClick={(row) => openDrawer(row.id)}
            />
          </div>
          {!loading && filteredRows.length === 0 && (
            <Typography variant="body2" sx={{ mt: 1.5 }}>
              No transactions found.
            </Typography>
          )}
        </div>
      </Stack>
      <AppDrawer anchor="right" open={drawerOpen} onClose={closeDrawer} title={isCreating ? 'New O2 Transaction' : 'Edit O2 Transaction'}>
        <div style={{ width: 'min(720px, 100vw)', maxWidth: '100%', minWidth: 0, overflowX: 'hidden' }}>
          {isCreating ? (
            <NewO2TransactionForm
              onCancel={closeDrawer}
              onSaved={(result) => { const id = extractId(result); closeAndRefresh(id); }}
            />
          ) : (
            selectedId && (
              <EditO2TransactionForm
                id={selectedId}
                onCancel={closeDrawer}
                onDeleted={() => { closeAndRefresh(); }}
                onSaved={(result) => { const id = extractId(result); closeAndRefresh(id); }}
              />
            )
          )}
        </div>
      </AppDrawer>
      <AppDrawer
        anchor="right"
        open={docPreviewOpen}
        onClose={() => { setDocPreviewOpen(false); setDocPreviewUrl(''); }}
        title={docPreviewTitle || 'Document'}
        size="document"
      >
        <div style={{ width: 'min(720px, 100vw)', maxWidth: '100%', minWidth: 0, overflowX: 'hidden' }}>
          {docPreviewUrl ? (
            <iframe
              src={docPreviewUrl}
              title="Document preview"
              style={{ width: '100%', height: 'calc(100vh - 140px)', border: 'none' }}
            />
          ) : (
            <div style={{ padding: 12 }}>No document to preview.</div>
          )}
        </div>
      </AppDrawer>
    </PageScaffold>
  );
}
