import React, { useEffect, useMemo, useState } from 'react';
import api, { BACKEND_BASE } from '../api';
import TableLite from '../components/layout/TableLite';
import TableToolbar from '../components/layout/TableToolbar';
import AppDrawer from '../components/common/AppDrawer';
import UnitTransactionEditFormRHF from '../components/forms/UnitTransactionEditFormRHF';
import UnitTransactionNewFormRHF from '../components/forms/UnitTransactionNewFormRHF';
import NewClientUnitNote from '../components/forms/NewClientUnitNote';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import DocumentPreview from '../components/common/DocumentPreview';
import { HiOutlineDocumentText } from 'react-icons/hi';
import {
  Autocomplete,
  Button,
  FormControl,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  TextField,
} from '@mui/material';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import SearchIcon from '@mui/icons-material/Search';
import { alpha, darken, useTheme } from '@mui/material/styles';
import PageScaffold from '../components/layout/PageScaffold';

const INITIAL_FILTER_VALUES = {
  unitName: '',
  type: '',
  description: '',
};

const formatDateDisplay = (value) => {
  if (!value) return '';
  if (typeof value === 'string') {
    // Handle date-only strings: YYYY-MM-DD
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      return `${m[3]}/${m[2]}/${m[1]}`; // dd/mm/yyyy
    }
    // Handle ISO datetime strings: YYYY-MM-DDThh:mm... (take the date part only)
    const m2 = value.match(/^(\d{4})-(\d{2})-(\d{2})T/);
    if (m2) {
      return `${m2[3]}/${m2[2]}/${m2[1]}`; // dd/mm/yyyy
    }
  }
  // Fallback to Date parsing if needed
  const d = new Date(value);
  if (isNaN(d)) return String(value);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
};

const Owners2UnitTransactions = () => {
  const theme = useTheme();
  const tokens = theme.hausin;
  const [transactions, setTransactions] = useState([]);
  const [filterValues, setFilterValues] = useState({ ...INITIAL_FILTER_VALUES });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [newDrawerOpen, setNewDrawerOpen] = useState(false);
  const [commentDrawerOpen, setCommentDrawerOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewTitle, setPreviewTitle] = useState('Document Preview');

  const [backPath, setBackPath] = useState(null);

  const location = useLocation();
  const navigate = useNavigate();

  // Helpers: close drawers, refresh data, and highlight rows
  const closeEditDrawer = () => {
    setDrawerOpen(false);
    setSelectedTransaction(null);
    if (backPath) {
      navigate(backPath);
      setBackPath(null);
    }
  };

  const closeNewDrawer = () => {
    setNewDrawerOpen(false);
  };

  const extractId = (res) => {
    if (!res) return selectedTransaction?.id || null;
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
    return selectedTransaction?.id || null;
  };

  const refreshAndHighlight = async (idToHighlight) => {
    try { await fetchTransactions(); } catch (_) {}
    if (idToHighlight) {
      window.dispatchEvent(
        new CustomEvent('datatable:highlight', {
          detail: { id: idToHighlight },
        }),
      );
    }
  };

  const fetchTransactions = () => {
    api.get('/api/unit-transactions')
      .then(response => {
        const items = Array.isArray(response.data) ? response.data : response.data['hydra:member'] || [];
        const rows = items.map(t => {
          // Gather possible document URLs from various shapes
          const directUrls = [];
          if (t.s3_url) directUrls.push(t.s3_url);
          if (t.documentUrl) directUrls.push(t.documentUrl);

          // If backend sends unitDocuments as IRIs or objects, normalize to URLs
          let docsFromAssoc = [];
          if (Array.isArray(t.unitDocuments)) {
            docsFromAssoc = t.unitDocuments
              .map(d => {
                if (!d) return null;
                if (typeof d === 'string') {
                  // If we only have an IRI like "/api/unit_documents/29", keep as-is for now (no URL to open)
                  return null;
                }
                return d.s3_url || d.documentUrl || d.url || null;
              })
              .filter(Boolean);
          }

          const documents = Array.from(new Set([...directUrls, ...docsFromAssoc]));

          return {
            id: t.id,
            transaction_code: t.transaction_code || t.transactionCode || 'N/A',
            linkId: t.id,
            date: t.date,
            // snake_case + camelCase mirrors for filters
            unit_name: t.unit_name || t.unitName || t.unit?.unit_name || t.unit?.unitName || 'Unknown',
            unitName:  t.unit_name || t.unitName || t.unit?.unit_name || t.unit?.unitName || 'Unknown',
            amount: t.amount,
            type: t.type,
            category_name: t.category_name || t.category?.name || t.category || 'N/A',
            category: t.category_name || t.category?.name || t.category || 'N/A',
            description: t.description,
            comments: t.comments,
            cost_center: t.cost_center || t.costCenter || 'N/A',
            costCenter: t.cost_center || t.costCenter || 'N/A',
            documents,
          };
        }).filter(Boolean);

        // Consolidate duplicates by `id` (API may return one row per doc). Merge documents.
        const byId = new Map();
        for (const r of rows) {
          const existing = byId.get(r.id);
          if (!existing) {
            byId.set(r.id, r);
          } else {
            const mergedDocs = Array.from(new Set([...(existing.documents || []), ...(r.documents || [])]));
            byId.set(r.id, { ...existing, documents: mergedDocs });
          }
        }
        const enriched = Array.from(byId.values());
        const sorted = enriched.sort((a, b) => {
          const da = new Date(a.date || 0);
          const db = new Date(b.date || 0);
          return db - da; // latest first
        });
        setTransactions(sorted);
      })
      .catch(error => {
        console.error('Error fetching transactions:', error);
      });
  };

  useEffect(() => {
    fetchTransactions();
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

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const txIdParam = params.get('txId');
    const fromParam = params.get('from');

    if (!txIdParam || !transactions.length) {
      return;
    }

    const id = Number(txIdParam) || txIdParam;
    const row = transactions.find((t) => String(t.id) === String(id));

    if (row) {
      setSelectedTransaction(row);
      setDrawerOpen(true);
      if (fromParam) {
        setBackPath(fromParam);
      }
    }

    // Clean txId and from from the URL so the deep-link is one-shot
    const url = new URL(window.location.href);
    url.searchParams.delete('txId');
    url.searchParams.delete('from');
    window.history.replaceState({}, '', url.toString());
  }, [location.search, transactions]);

  const unitOptions = useMemo(
    () => Array.from(
      new Set(
        transactions
          .map((transaction) => transaction.unitName)
          .filter((value) => value !== undefined && value !== null)
          .map((value) => String(value))
      )
    ).sort(),
    [transactions]
  );

  const typeOptions = useMemo(
    () => Array.from(
      new Set(
        transactions
          .map((transaction) => transaction.type)
          .filter((value) => value !== undefined && value !== null)
          .map((value) => String(value))
      )
    ).sort(),
    [transactions]
  );

  const handleFilterChange = (key, value) => {
    if (!Object.prototype.hasOwnProperty.call(INITIAL_FILTER_VALUES, key)) {
      return;
    }
    setFilterValues((previous) => ({
      ...previous,
      [key]: value || '',
    }));
  };

  const hasActiveFilters = Object.values(filterValues).some((value) => value !== '');
  const controlSx = {
    '& .MuiInputLabel-root': {
      color: tokens.colors.textSecondary,
      fontSize: tokens.controls.fontSize,
    },
    '& .MuiInputLabel-root.Mui-focused': {
      color: tokens.colors.primaryTeal,
    },
    '& .MuiOutlinedInput-root': {
      height: tokens.controls.height,
      borderRadius: `${tokens.controls.borderRadius}px`,
      backgroundColor: theme.palette.common.white,
      '& .MuiInputBase-input, & .MuiSelect-select': {
        fontSize: tokens.controls.fontSize,
        fontWeight: tokens.controls.fontWeight,
      },
      '& .MuiOutlinedInput-notchedOutline': {
        borderColor: tokens.colors.border,
      },
      '&:hover .MuiOutlinedInput-notchedOutline': {
        borderColor: tokens.colors.primaryTeal,
      },
      '&.Mui-focused': {
        boxShadow: `0 0 0 2px ${alpha(tokens.colors.primaryTeal, 0.18)}`,
      },
      '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
        borderColor: tokens.colors.primaryTeal,
      },
      '&.Mui-focused .MuiOutlinedInput-notchedOutline legend': {
        maxWidth: '100%',
      },
    },
  };
  const primaryButtonSx = {
    height: tokens.controls.height,
    borderRadius: `${tokens.controls.borderRadius}px`,
    px: 2,
    fontSize: tokens.controls.fontSize,
    fontWeight: tokens.controls.fontWeight,
    backgroundColor: tokens.colors.primaryTeal,
    '&:hover': {
      backgroundColor: darken(tokens.colors.primaryTeal, 0.12),
    },
    '&.Mui-focusVisible': {
      outline: `2px solid ${tokens.colors.primaryTeal}`,
      outlineOffset: 2,
    },
    '&.Mui-disabled': {
      backgroundColor: tokens.colors.subtle,
      color: tokens.colors.muted,
    },
  };
  const secondaryButtonSx = {
    height: tokens.controls.height,
    borderRadius: `${tokens.controls.borderRadius}px`,
    px: 2,
    fontSize: tokens.controls.fontSize,
    fontWeight: tokens.controls.fontWeight,
    color: tokens.colors.primaryTeal,
    borderColor: tokens.colors.primaryTeal,
    backgroundColor: theme.palette.common.white,
    '&:hover': {
      borderColor: tokens.colors.primaryTeal,
      backgroundColor: alpha(tokens.colors.primaryTeal, 0.08),
    },
    '&.Mui-focusVisible': {
      outline: `2px solid ${tokens.colors.primaryTeal}`,
      outlineOffset: 2,
    },
    '&.Mui-disabled': {
      color: tokens.colors.muted,
      borderColor: tokens.colors.border,
    },
  };
  const utilityButtonSx = {
    ...secondaryButtonSx,
    color: tokens.colors.textSecondary,
    borderColor: tokens.colors.border,
    '&:hover': {
      borderColor: tokens.colors.border,
      backgroundColor: tokens.colors.subtle,
      color: tokens.colors.textPrimary,
    },
  };

  const columns = [
    {
      header: 'Code',
      accessor: 'transaction_code',
      id: 'transaction_code',
      width: '170px',
      minWidth: '170px',
      render: (value, row) => {
        const code = value ?? row?.transaction_code ?? 'Missing';
        return {
          top: (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedTransaction(row);
                setDrawerOpen(true);
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
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#f57c00';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = '#1e6f68';
              }}
            >
              {code}
            </button>
          ),
          bottom: formatDateDisplay(row.date),
        };
      },
    },
    {
      header: 'Unit',
      accessor: 'unitName',
      filterable: true,
      filterType: 'autocomplete',
      width: '200px',
      minWidth: '200px',
      cell: (row) => row.unitName || row.unit_name || '-',
    },
    {
      header: 'Type',
      accessor: 'type',
      filterable: true,
      filterType: 'select',
      width: '170px',
      minWidth: '170px',
      render: (value, row) => {
        const type = row.type || '-';
        const category = row.category || row.category_name || '-';
        const costCenter = row.costCenter || row.cost_center || '-';

        return {
          top: category,
          bottom: `${type} • ${costCenter}`,
        };
      }
    },
    {
      header: 'Description',
      accessor: 'description',
      filterable: true,
      width: '300px',
      minWidth: '300px',
    },
    {
      header: 'Amount',
      accessor: 'amount',
      type: 'currency',
    },
    {
      header: 'Comments',
      accessor: 'comments',
      width: '250px',
      minWidth: '250px',
    },
    {
      header: 'Documents',
      accessor: 'documents',
      cell: (row) => {
        const docs = Array.isArray(row?.documents) ? row.documents : [];
        if (docs.length === 0) return '';
        return (
          <span
            onClick={(e) => e.stopPropagation()}
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '6px',
              width: '100%',
            }}
          >
            {docs.map((rawUrl, idx) => {
              const base = (BACKEND_BASE || '').replace(/\/+$/, '');
              const link = rawUrl && rawUrl.startsWith('/') ? `${base}${rawUrl}` : rawUrl;
              if (!link) return null;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setPreviewUrl(link);
                    setPreviewTitle(`Document ${idx + 1}`);
                    setPreviewOpen(true);
                  }}
                  style={{
                    marginRight: '0.35rem',
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center'
                  }}
                  title={`Preview document ${idx + 1}`}
                  aria-label={`Preview document ${idx + 1}`}
                >
                  <InsertDriveFileOutlinedIcon fontSize="small" sx={{ color: '#1e6f68' }} />
                </button>
              );
            })}
          </span>
        );
      }
    }
  ];

  const toolbar = (
    <TableToolbar
      title="Unit Transactions"
      layout="stacked"
      actions={(
        <>
          <Button variant="contained" sx={primaryButtonSx} onClick={() => setNewDrawerOpen(true)}>
            + New Transaction
          </Button>
          <Button component={Link} to="/report-comments" variant="outlined" sx={secondaryButtonSx}>
            View Comments
          </Button>
        </>
      )}
      filters={(
        <>
          <Autocomplete
            size="small"
            options={unitOptions}
            value={unitOptions.includes(filterValues.unitName) ? filterValues.unitName : null}
            inputValue={filterValues.unitName}
            onChange={(_, value) => handleFilterChange('unitName', value)}
            onInputChange={(_, value, reason) => {
              if (reason !== 'reset') {
                handleFilterChange('unitName', value);
              }
            }}
            sx={{ width: 200, ...controlSx }}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Unit"
                placeholder="All units"
                inputProps={{
                  ...params.inputProps,
                  'aria-label': 'Filter by unit',
                }}
              />
            )}
          />
          <FormControl size="small" sx={{ width: 160, ...controlSx }}>
            <InputLabel id="unit-transactions-type-filter-label">Type</InputLabel>
            <Select
              labelId="unit-transactions-type-filter-label"
              id="unit-transactions-type-filter"
              value={filterValues.type}
              label="Type"
              onChange={(event) => handleFilterChange('type', event.target.value)}
            >
              <MenuItem value="">All types</MenuItem>
              {typeOptions.map((type) => (
                <MenuItem key={type} value={type}>
                  {type}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            size="small"
            label="Description"
            placeholder="Search description..."
            value={filterValues.description}
            onChange={(event) => handleFilterChange('description', event.target.value)}
            inputProps={{ 'aria-label': 'Search description' }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
            sx={{ width: 360, minWidth: 320, flex: '0 1 360px', ...controlSx }}
          />
          <Button
            variant="outlined"
            sx={utilityButtonSx}
            disabled={!hasActiveFilters}
            onClick={() => setFilterValues({ ...INITIAL_FILTER_VALUES })}
          >
            Clear Filters
          </Button>
        </>
      )}
    />
  );

  return (
    <PageScaffold
      title="Unit Transactions"
      sectionKey="transactions"
      currentPath="/unit-transactions"
      layout="table"
      stickyHeader={toolbar}
      tableToolbar
    >
      <div className="table-container">
        <TableLite
          columns={columns}
          rows={transactions}
          enableFilters
          filterValues={filterValues}
          onFilterChange={handleFilterChange}
          optionsSourceRows={transactions}
          showHeaderFilters={false}
          rowProps={(row) => ({
            id: `row-${row.id}`
          })}
        />
      </div>
      <AppDrawer
        anchor="right"
        open={drawerOpen}
        size="default"
        showActions
        formId="unit-tx-edit-form"
        actions={{ showDelete: true }}
        onClose={() => { closeEditDrawer(); fetchTransactions(); }}
        onDelete={async () => {
          try {
            if (!selectedTransaction?.id) return;
            await api.delete(`/api/unit_transactions/${selectedTransaction.id}`);
            closeEditDrawer();
            await fetchTransactions();
          } catch (e) {
            console.error('Delete transaction failed:', e);
            alert('Could not delete the transaction.');
          }
        }}
      >
        {selectedTransaction && (
          <UnitTransactionEditFormRHF
            formId="unit-tx-edit-form"
            transactionId={selectedTransaction.id}
            onClose={() => { closeEditDrawer(); refreshAndHighlight(selectedTransaction.id); }}
            onSave={(result) => { closeEditDrawer(); const id = extractId(result); refreshAndHighlight(id || selectedTransaction.id); }}
          />
        )}
      </AppDrawer>
      <AppDrawer
        anchor="right"
        open={newDrawerOpen}
        size="default"
        showActions
        formId="unit-tx-form"
        onClose={() => { closeNewDrawer(); fetchTransactions(); }}
      >
        <UnitTransactionNewFormRHF
          formId="unit-tx-form"
          onClose={() => { closeNewDrawer(); fetchTransactions(); }}
          onCancel={() => { closeNewDrawer(); fetchTransactions(); }}
          onSave={(result) => {
            closeNewDrawer();
            const id = extractId(result);
            fetchTransactions();
            if (id) {
              window.dispatchEvent(
                new CustomEvent('datatable:highlight', {
                  detail: { id },
                }),
              );
            }
          }}
          onSaved={(result) => {
            closeNewDrawer();
            const id = extractId(result);
            fetchTransactions();
            if (id) {
              window.dispatchEvent(
                new CustomEvent('datatable:highlight', {
                  detail: { id },
                }),
              );
            }
          }}
        />
      </AppDrawer>
      <AppDrawer
        anchor="right"
        open={commentDrawerOpen}
        size="default"
        onClose={() => {
          setCommentDrawerOpen(false);
          fetchTransactions(); // refresh table on close
        }}
      >
        <NewClientUnitNote
          unitId={null}
          onClose={() => {
            setCommentDrawerOpen(false);
            fetchTransactions(); // refresh table on close
          }}
          onCancel={() => {
            setCommentDrawerOpen(false);
            fetchTransactions(); // refresh table on cancel
          }}
          onSave={() => {
            setCommentDrawerOpen(false);
            fetchTransactions(); // refresh table on save
          }}
        />
      </AppDrawer>
      <AppDrawer
        anchor="right"
        open={previewOpen}
        size="document"
        title={previewTitle}
        headerLink={previewUrl}
        onClose={() => { setPreviewOpen(false); setPreviewUrl(''); setPreviewTitle('Document Preview'); }}
      >
        <DocumentPreview url={previewUrl} />
      </AppDrawer>
    </PageScaffold>
  );
};

export default Owners2UnitTransactions;
