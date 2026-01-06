import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
// import DataTable from '../components/layouts/DataTable';
import api from '../api';
import { Button } from '@mui/material';
import AppDrawer from '../components/common/AppDrawer';
import HKTransactionEditFormRHF from '../components/forms/HKTransactionEditFormRHF';
import HKTransactionNewFormRHF from '../components/forms/HKTransactionNewFormRHF';
import MarkUpCalculatorFormRHF from '../components/forms/MarkUpCalculatorFormRHF';
// import '../components/layouts/Buttons.css';
import { Calculate } from '@mui/icons-material';
import * as XLSX from 'xlsx';
import AppShell from '../components/layout/AppShell';
import TableLite from '../components/layout/TableLite';
import PageScaffold from '../components/layout/PageScaffold';

const formatUnitLabel = (value = '') => {
  if (value === 'Housekeepers_Playa') return 'HK Playa';
  if (value === 'Housekeepers_Tulum') return 'HK Tulum';
  if (value === 'Housekeepers_General') return 'HK General';
  return value;
};

const HKTransactions = () => {
  const [transactions, setTransactions] = useState([]);
  const [allTransactions, setAllTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [filterKey, setFilterKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [markupOpen, setMarkupOpen] = useState(false);
  const [formOptions, setFormOptions] = useState({ units: [], categories: [] });
  const [visibleRows, setVisibleRows] = useState([]);
  const [unitFilter, setUnitFilter] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [costCentreFilter, setCostCentreFilter] = useState('');

  const location = useLocation();

  const today = new Date();
  const defYear = String(today.getFullYear());
  const defMonthNum = String(today.getMonth() + 1).padStart(2, '0'); // mm
  const currentMonthYM = `${defYear}-${defMonthNum}`;
  const prevMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const prevMonthYM = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;
  const [selMonth, setSelMonth] = useState(defMonthNum);
  const [selYear, setSelYear] = useState(defYear);
  // Unified month-year selector (value format: YYYY-MM or 'all').
  // Start with no explicit month filter; we'll show current + previous month by default
  const [selYM, setSelYM] = useState('');
  const [initialMonthRange, setInitialMonthRange] = useState(true);

  // Build a list of Month YYYY labels for a useful range
  const buildMonthOptions = (past = 24, future = 12) => {
    const opts = [];
    const now = new Date();
    // Start at the first day of the current month
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    // Go back `past` months
    start.setMonth(start.getMonth() - past);
    const total = past + future + 1;
    for (let i = 0; i < total; i++) {
      const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const value = `${y}-${m}`;
      const label = d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
      opts.push({ value, label });
    }
    return opts;
  };
  const monthOptions = buildMonthOptions();

  const fmtMoney = (n) => {
    const val = Number(n || 0);
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
  };

  const clearAllFilters = () => {
    setTransactions(allTransactions);
    setSelYM('all');
    setInitialMonthRange(false);
    setUnitFilter('');
    setCityFilter('');
    setCategoryFilter('');
    setCostCentreFilter('');
    setFilterKey((k) => k + 1); // force DataTable remount to clear header filters
  };

  const normalizeUrl = (u) => {
    if (!u) return '';
    return u.startsWith('/') ? `${window.location.origin}${u}` : u;
  };

  const fetchData = () => {
    api.get('/api/hk-transactions')
      .then(response => {
        const formattedData = response.data.map(tx => {
          // Use attachments from API (cloned/reused documents)
          const docs = Array.isArray(tx.attachments) ? tx.attachments : [];
          const documentLinks = docs
            .filter((d) => d && d.url)
            .map((d) => {
              const urlRaw = d.url || '';
              return {
                url: normalizeUrl(urlRaw),
                fileName: d.fileName || 'document',
              };
            });
          const paidNum = (tx.paid === null || tx.paid === undefined || tx.paid === '')
            ? null
            : Number(String(tx.paid).replace(/[^0-9.\-]/g, ''));
          const chargedNum = (tx.charged === null || tx.charged === undefined || tx.charged === '')
            ? null
            : Number(String(tx.charged).replace(/[^0-9.\-]/g, ''));
          const cityRaw = tx.city || '';
          const cityLabel = cityRaw === 'General' ? 'General' : cityRaw;
          return {
            ...tx,
            date: tx.date ? tx.date.split('T')[0] : '',
            unitName: (tx.unitLabel || tx.unit?.unitName || '') === 'Housekeepers'
              ? `Housekeepers_${tx.city === 'Playa del Carmen'
                  ? 'Playa'
                  : tx.city === 'Tulum'
                    ? 'Tulum'
                    : 'General'}`
              : (tx.unitLabel || tx.unit?.unitName || ''),
            city: cityRaw,
            cityLabel,
            unitStatus: (tx.unitStatus ?? tx.unit?.status ?? ''),
            categoryName: tx.category?.name || '',
            paid: paidNum,
            charged: chargedNum,
            confirmationCode: (tx.confirmationCode || tx.confirmation_code || ''),
            documentLinks,
          };
        });
        const sortedData = formattedData.sort((a, b) => {
          const da = new Date(a.date || 0);
          const db = new Date(b.date || 0);
          return db - da; // latest first
        });
        setAllTransactions(sortedData);
        setTransactions(sortedData);
        setLoading(false);
      })
      .catch((error) => {
        console.error('Error loading HK Transactions:', error);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const focusParam = params.get('focusId');
    if (!focusParam) return;

    const id = Number(focusParam) || focusParam;
    window.dispatchEvent(
      new CustomEvent('datatable:highlight', {
        detail: { id },
      }),
    );

    // Clean the focusId from the URL so the highlight is one-shot
    const url = new URL(window.location.href);
    url.searchParams.delete('focusId');
    window.history.replaceState({}, '', url.toString());
  }, [location.search]);

  // Keep track of rows currently visible based on header filters for exports, etc.
  useEffect(() => {
    const filtered = transactions.filter((tx) => {
      let matchesMonth = true;
      if (initialMonthRange && !selYM) {
        const d = tx.date || '';
        matchesMonth = d.startsWith(currentMonthYM) || d.startsWith(prevMonthYM);
      } else if (!selYM || selYM === 'all') {
        matchesMonth = true;
      } else {
        matchesMonth = tx.date ? tx.date.startsWith(selYM) : false;
      }
      const matchesUnit = unitFilter ? String(tx.unitName || '') === String(unitFilter) : true;
      const matchesCity = cityFilter ? String(tx.cityLabel || '') === String(cityFilter) : true;
      const matchesCategory = categoryFilter ? String(tx.categoryName || '') === String(categoryFilter) : true;
      const matchesCostCentre = costCentreFilter ? String(tx.costCentre || '') === String(costCentreFilter) : true;
      return matchesMonth && matchesUnit && matchesCity && matchesCategory && matchesCostCentre;
    });
    setVisibleRows(filtered);
  }, [transactions, selYM, unitFilter, cityFilter, categoryFilter, costCentreFilter, initialMonthRange, currentMonthYM, prevMonthYM]);

  const unitFilterOptions = useMemo(() => {
    const base = Array.isArray(allTransactions) ? allTransactions : [];
    const values = Array.from(
      new Set(
        base
          .map((tx) => tx.unitName)
          .filter((name) => !!name)
      )
    ).sort((a, b) => String(a).localeCompare(String(b)));
    return values.map((value) => ({
      value,
      label: formatUnitLabel(value),
    }));
  }, [allTransactions]);

  const cityFilterOptions = useMemo(() => {
    const base = Array.isArray(allTransactions) ? allTransactions : [];
    const values = Array.from(
      new Set(
        base
          .map((tx) => tx.cityLabel)
          .filter((name) => !!name)
      )
    ).sort((a, b) => String(a).localeCompare(String(b)));
    return values.map((value) => ({ value, label: value }));
  }, [allTransactions]);

  const categoryFilterOptions = useMemo(() => {
    const base = Array.isArray(allTransactions) ? allTransactions : [];
    const values = Array.from(
      new Set(
        base
          .map((tx) => tx.categoryName)
          .filter((name) => !!name)
      )
    ).sort((a, b) => String(a).localeCompare(String(b)));
    return values.map((value) => ({ value, label: value }));
  }, [allTransactions]);

  const costCentreFilterOptions = useMemo(() => {
    const base = Array.isArray(allTransactions) ? allTransactions : [];
    const values = Array.from(
      new Set(
        base
          .map((tx) => tx.costCentre)
          .filter((name) => !!name)
      )
    ).sort((a, b) => String(a).localeCompare(String(b)));
    return values.map((value) => ({
      value,
      label: formatUnitLabel(value),
    }));
  }, [allTransactions]);


  useEffect(() => {
    let ignore = false;
    const loadOptions = async () => {
      try {
        const { data } = await api.get('/api/hk-transactions/form-options');
        if (!ignore && data) {
          setFormOptions({
            units: Array.isArray(data.units) ? data.units : [],
            categories: Array.isArray(data.categories) ? data.categories : [],
          });
        }
      } catch (e) {
        console.warn('Failed to load HK form options', e);
      }
    };
    loadOptions();
    return () => { ignore = true; };
  }, []);

  const columns = [
    {
      header: 'Code',
      accessor: 'transactionCode',
      width: 110,
      cellStyle: { py: 1, px: 1.5 },
      headerStyle: { textAlign: 'left' },
      render: (value, row) => (
        <a
          href="#"
          className="table-link"
          onClick={(e) => {
            e.preventDefault();
            setSelectedId(row.id);
            setDrawerOpen(true);
          }}
        >
          {row.transactionCode}
        </a>
      ),
    },
    {
      header: 'Date',
      accessor: 'date',
      format: 'date',
      width: 110,
      cellStyle: { py: 1, px: 1.5 },
      headerStyle: { textAlign: 'left' },
      filterable: true,
      filterType: 'monthYear',
      inlineFilter: true,
    },
    {
      header: 'Unit',
      accessor: 'unitName',
      width: 180,
      cellStyle: { py: 1, px: 1.5 },
      headerStyle: { textAlign: 'left' },
      render: (value) => formatUnitLabel(value || ''),
      filter: {
        type: 'autocomplete',
        inline: true,
        placeholder: 'Unit',
        options: unitFilterOptions,
        getOptionLabel: (option) => {
          if (option == null) return '';
          if (typeof option === 'string') return formatUnitLabel(option);
          return formatUnitLabel(option.label ?? option.value ?? '');
        },
      },
    },
    {
      header: 'City',
      accessor: 'cityLabel',
      width: 140,
      cellStyle: { py: 1, px: 1.5 },
      headerStyle: { textAlign: 'left' },
      filter: {
        type: 'select',
        inline: true,
        placeholder: 'City',
        options: cityFilterOptions,
      },
    },
    {
      header: 'Category',
      accessor: 'categoryName',
      width: 160,
      cellStyle: { py: 1, px: 1.5 },
      headerStyle: { textAlign: 'left' },
      filter: {
        type: 'select',
        inline: true,
        placeholder: 'Category',
        options: categoryFilterOptions,
      },
    },
    {
      header: 'C. Centre',
      accessor: 'costCentre',
      width: 140,
      cellStyle: { py: 1, px: 1.5 },
      headerStyle: { textAlign: 'left' },
      render: (value, row) => {
        const v = row?.costCentre || '';
        if (v === 'Housekeepers_Playa') return 'HK Playa';
        if (v === 'Housekeepers_Tulum') return 'HK Tulum';
        if (v === 'Housekeepers_General') return 'HK General';
        return v;
      },
      filter: {
        type: 'select',
        inline: true,
        placeholder: 'C. Centre',
        options: costCentreFilterOptions,
      },
    },
    {
      header: 'Description',
      accessor: 'description',
      width: 240,
      cellStyle: { py: 1, px: 1.5 },
      headerStyle: { textAlign: 'left' },
    },
    {
      header: 'Paid',
      accessor: 'paid',
      align: 'right',
      format: 'money',
      width: 110,
      cellStyle: { py: 1, px: 1.5, textAlign: 'right' },
      headerStyle: { textAlign: 'right' },
    },
    {
      header: 'Charged',
      accessor: 'charged',
      align: 'right',
      format: 'money',
      width: 110,
      cellStyle: { py: 1, px: 1.5, textAlign: 'right' },
      headerStyle: { textAlign: 'right' },
    },
    {
      header: 'Notes',
      accessor: 'notes',
      width: 220,
      cellStyle: { py: 1, px: 1.5 },
      headerStyle: { textAlign: 'left' },
    },
    {
      header: 'Documents',
      accessor: 'documentLinks',
      width: 100,
      cellStyle: { py: 1, px: 1.5 },
      headerStyle: { textAlign: 'left' },
      render: (value, row) =>
        Array.isArray(row.documentLinks) && row.documentLinks.length
          ? row.documentLinks.map((doc, idx) => (
              <a
                key={idx}
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                className="table-link"
                title={doc.fileName}
                onClick={(e) => e.stopPropagation()}
                style={{ marginRight: '4px' }}
              >
                📎
              </a>
            ))
          : '',
    },
  ];

  const monthKey = selYM || (initialMonthRange ? `${prevMonthYM}_to_${currentMonthYM}` : 'all');
  const monthlyRows = transactions.filter((tx) => {
    if (!tx.date) return false;
    const status = String(tx.unitStatus || '').toLowerCase();
    const isActive = (status === '' || status === 'active' || status === 'internal');
    let matchesDate;
    if (initialMonthRange && !selYM) {
      const d = tx.date;
      matchesDate = d.startsWith(currentMonthYM) || d.startsWith(prevMonthYM);
    } else if (!selYM || selYM === 'all') {
      matchesDate = true;
    } else {
      matchesDate = tx.date.startsWith(selYM);
    }
    return matchesDate && isActive;
  });

  const sumBy = (rows, predicate = () => true) => rows.reduce((acc, r) => predicate(r) ? {
    paid: acc.paid + (Number(r.paid || 0)),
    charged: acc.charged + (Number(r.charged || 0))
  } : acc, { paid: 0, charged: 0 });

  const totalAll = sumBy(monthlyRows);
  const totalHK = sumBy(monthlyRows, (r) => {
    const c = String(r.city || '');
    return c === 'General' || c === 'Both';
  });
  const totalPlaya = sumBy(monthlyRows, (r) => String(r.city || '') === 'Playa del Carmen');
  const totalTulum = sumBy(monthlyRows, (r) => String(r.city || '') === 'Tulum');

  const diff = (obj) => (obj.charged - obj.paid);
  const selectedRow = selectedId ? transactions.find(r => r.id === selectedId) : null;

  const exportToXLSX = () => {
    try {
      const rows = Array.isArray(visibleRows) ? visibleRows : [];
      if (!rows.length) {
        alert('No rows to export for the selected month.');
        return;
      }

      // Prepare data with the requested fields: Date; Unit; Category; Description; Charged
      const data = rows.map(r => ({
        Date: r.date || '',
        Unit: r.unitName || '',
        Category: r.categoryName || '',
        Description: r.description || '',
        Charged: (r.charged !== null && r.charged !== undefined) ? Number(r.charged) : null
      }));

      // Compute total of Charged (numbers only)
      const totalCharged = rows.reduce((acc, r) => {
        const v = (r.charged !== null && r.charged !== undefined) ? Number(r.charged) : 0;
        return acc + (isFinite(v) ? v : 0);
      }, 0);

      // Append only a Total row
      data.push({
        Date: '',
        Unit: '',
        Category: '',
        Description: 'Total',
        Charged: totalCharged
      });

      // Create worksheet and workbook
      const headers = ['Date','Unit','Category','Description','Charged'];
      const ws = XLSX.utils.json_to_sheet(data, { header: headers });

      // Set an autoFilter to give an Excel table-like experience
      const lastRow = data.length + 1; // +1 for header row
      ws['!autofilter'] = { ref: `A1:E${lastRow}` };

      // Column widths for readability
      ws['!cols'] = [
        { wch: 12 }, // Date
        { wch: 24 }, // Unit
        { wch: 18 }, // Category
        { wch: 40 }, // Description
        { wch: 12 }  // Charged
      ];

      // Apply European number format: dot thousands, comma decimals, always 2 decimals, 0 -> 0,00
      for (let r = 2; r <= lastRow; r++) {
        const addr = 'E' + r;
        if (ws[addr]) {
          const value = Number(ws[addr].v || 0);
          ws[addr].t = 'n';
          ws[addr].v = isNaN(value) ? 0 : value;
          ws[addr].z = '#,##0.00'; // ensures 2 decimals with thousand separator
        }
      }

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Transactions');

      // Name the file using the first visible row's month (YYYY-MM), fallback to selYM or 'all'
      const ymForName = (rows?.[0]?.date ? String(rows[0].date).slice(0,7) : (selYM || 'all'));
      const fileName = `HK_Alorvacations_${ymForName}.xlsx`;
      XLSX.writeFile(wb, fileName);
    } catch (e) {
      console.error('XLSX export failed', e);
      alert('Failed to export Excel file.');
    }
  };

  // Prepare actionsHeader for stickyHeader prop
  const actionsHeader = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <button
        className="btn btn-primary"
        style={{ minWidth: 120 }}
        onClick={() => setCreateOpen(true)}
      >
        + Add
      </button>
      <button
        className="btn btn-secondary"
        style={{ minWidth: 120 }}
        onClick={() => setMarkupOpen(true)}
      >
        Markup
        <Calculate style={{ marginLeft: 4, fontSize: '1rem', padding: 0, lineHeight: 1, marginBottom: -2 }} />
      </button>
      <button
        className="btn btn-primary"
        style={{ minWidth: 120 }}
        onClick={() => setTransactions(allTransactions.filter(tx => String(tx.unitStatus).toLowerCase() === 'active'))}
      >
        Owners2
      </button>
      <button
        className="btn btn-secondary"
        style={{ minWidth: 120 }}
        onClick={() => setTransactions(allTransactions.filter(tx => String(tx.unitStatus).toLowerCase() === 'alor'))}
      >
        Alorvacations
      </button>
      <Button variant="outlined" size="small" onClick={clearAllFilters}>
        Clear Filters
      </Button>
      <Button variant="outlined" size="small" onClick={exportToXLSX}>
        Export Excel
      </Button>
    </div>
  );


  return (
    <AppShell sectionKey="housekeepers" currentPath="/hk/transactions">
      <PageScaffold
        layout="table"
        withCard
        title="Housekeepers Transactions"
        stickyHeader={actionsHeader}
        headerPlacement="inside"
      >
        <TableLite
          columns={columns}
          rows={transactions}
          loading={loading}
          error={null}
          defaultStringTransform={null}
          optionsSourceRows={transactions}
          enableFilters
          filterValues={{
            date: (!initialMonthRange && selYM && selYM !== 'all') ? selYM : '',
            unitName: unitFilter || '',
            cityLabel: cityFilter || '',
            categoryName: categoryFilter || '',
            costCentre: costCentreFilter || '',
          }}
          onFilterChange={(key, value) => {
            if (key === 'date') {
              setInitialMonthRange(false);
              setSelYM(value || 'all');
            } else if (key === 'unitName') {
              setUnitFilter(value || '');
            } else if (key === 'cityLabel') {
              setCityFilter(value || '');
            } else if (key === 'categoryName') {
              setCategoryFilter(value || '');
            } else if (key === 'costCentre') {
              setCostCentreFilter(value || '');
            }
          }}
          rowProps={(row) => ({
            id: `row-${row.id}`,
          })}
        />
        <AppDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title="Edit HK Transaction"
          showActions
          formId="hk-tx-form-edit"
          actions={{ saveLabel: 'Save', cancelLabel: 'Cancel', showDelete: true }}
          onDelete={async () => {
            try {
              if (!selectedRow) return;
              const ok = window.confirm(`Delete transaction ${selectedRow.transactionCode}? This cannot be undone.`);
              if (!ok) return;
              await api.delete(`/api/hk-transactions/${selectedRow.id}`);
              setDrawerOpen(false);
              fetchData();
            } catch (e) {
              console.error('Failed to delete HK transaction:', e);
              alert('Could not delete the transaction. Please try again.');
            }
          }}
        >
          {selectedRow && (
            <HKTransactionEditFormRHF
              formId="hk-tx-form-edit"
              initialValues={selectedRow}
              unitOptions={formOptions.units}
              categoryOptions={formOptions.categories}
              onSave={async (payload) => {
                try {
                  await api.put(`/api/hk-transactions/${payload.id}`, payload);
                  setDrawerOpen(false);
                  fetchData();
                } catch (e) {
                  console.error('Failed to update HK transaction:', e);
                  alert('Could not update the transaction. Please review the fields and try again.');
                }
              }}
            />
          )}
        </AppDrawer>

        <AppDrawer
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          title="New HK Transaction"
          showActions
          formId="hk-tx-form"
          actions={{ saveLabel: 'Save', cancelLabel: 'Cancel', showDelete: false }}
        >
          <HKTransactionNewFormRHF
            formId="hk-tx-form"
            onSave={async (payload) => {
              try {
                // Persist via API; form does not POST by itself
                const { data } = await api.post('/api/hk-transactions', payload);
                // Success → close and refresh
                setCreateOpen(false);
                fetchData();
              } catch (err) {
                console.error('Failed to create HK transaction:', err);
                // Keep drawer open so the user can fix inputs; surface a basic alert for now
                alert('Could not save the transaction. Please review the fields and try again. Check console/network for details.');
              }
            }}
            onClose={() => setCreateOpen(false)}
            unitOptions={formOptions.units}
            categoryOptions={formOptions.categories}
          />
        </AppDrawer>

        <AppDrawer
          open={markupOpen}
          onClose={() => setMarkupOpen(false)}
          title="Calculate Markup"
          showActions
          formId="markup-form"
          actions={{ showSave: false, cancelLabel: 'Close', showDelete: false }}
        >
          <MarkUpCalculatorFormRHF
            formId="markup-form"
            onClose={() => setMarkupOpen(false)}
          />
        </AppDrawer>
      </PageScaffold>
    </AppShell>
  );
};

export default HKTransactions;
