// frontend/src/pages/EmployeeCashAdmin.jsx
//
// Admin view for employee cash ledger:
// - Lists Payments, Cash Advances and Expenses from EmployeeFinancialLedger
// - Uses the new PageScaffold layout and TableLite
// - Filtering by status, type, employee (basic scaffold – API wiring can be added later)

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Box, Chip, Button, IconButton, Typography, Divider, ToggleButtonGroup, ToggleButton, TextField } from '@mui/material';
import PageScaffoldTable from '../components/layout/PageScaffoldTable';
import TableLite from '../components/layout/TableLite';
import YearMonthPicker from '../components/layout/components/YearMonthPicker';
import AppDrawer from '../components/common/AppDrawer';
import EmployeeTransAdminNewFormRHF from '../components/forms/EmployeeCashLedgerNewFormRHF';
import NewO2TransactionForm from '../components/forms/NewO2TransactionForm';
import UnitTransactionNewFormRHF from '../components/forms/UnitTransactionNewFormRHF';
import HKTransactionNewFormRHF from '../components/forms/HKTransactionNewFormRHF';
import HRTransactionsNewFormRHF from '../components/forms/HRTransactionsNewFormRHF';
import EmployeeCashLedgerEditFormRHF from '../components/forms/EmployeeCashLedgerEditFormRHF';
import api from '../api';

function getCurrentYearMonth() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
// Status -> color mapping for the status pill
const STATUS_COLOR_MAP = {
  Pending: 'warning',
  Approved: 'success',
  Allocated: 'info',
  Rejected: 'error',
};

const STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'Pending', label: 'Pending' },
  { value: 'Approved', label: 'Approved' },
  { value: 'Allocated', label: 'Allocated' },
  { value: 'Rejected', label: 'Rejected' },
];

const TYPE_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'CashAdvance', label: 'Cash Advance' },
  { value: 'GuestPayment', label: 'Guest Payment' },
  { value: 'CashReturn', label: 'Cash Return' },
  { value: 'Expense', label: 'Expense' },
  { value: 'Other', label: 'Other' },
];

function renderStatusPill(statusRaw) {
  const status = statusRaw || 'Pending';
  const color = STATUS_COLOR_MAP[status] || 'default';

  return (
    <Chip
      size="small"
      label={status}
      color={color}
      sx={{ fontSize: 12, fontWeight: 500 }}
    />
  );
}

export default function EmployeeCashAdmin() {
  const FORM_ID = 'employee-trans-admin-form';
  const EDIT_FORM_ID = 'employee-cash-edit-form';
  const navigate = useNavigate();
  const location = useLocation();

  const handleAllocationCodeClick = (row) => {
    if (!row || !row.allocationId || !row.allocationType) return;

    const id = row.allocationId;
    const type = row.allocationType;

    let path = null;
    if (type === 'O2') {
      path = `/o2-transactions?focusId=${id}`;
    } else if (type === 'HK') {
      path = `/hk-transactions?focusId=${id}`;
    } else if (type === 'Unit') {
      path = `/unit-transactions?focusId=${id}`;
    }

    if (path) {
      navigate(path);
    }
  };
  // Filter values that can be wired to API params later
  const [filters, setFilters] = useState({
    status: '',
    type: '',
    employee: '',
    month: getCurrentYearMonth(),
  });

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [allocationDrawerOpen, setAllocationDrawerOpen] = useState(false);
  const [allocationRow, setAllocationRow] = useState(null);
  const [allocationType, setAllocationType] = useState(null);
  const [allocationForm, setAllocationForm] = useState({
    date: '',
    amount: '',
    notes: '',
  });
  const [hkFormOptions, setHkFormOptions] = useState(null);

  const hkUnitOptions = useMemo(() => {
    if (!hkFormOptions) return [];

    // Support different possible shapes from the API:
    // { units: [...] } or { data: { units: [...] } } or { items: [...] }
    const units = Array.isArray(hkFormOptions.units)
      ? hkFormOptions.units
      : Array.isArray(hkFormOptions.data?.units)
        ? hkFormOptions.data.units
        : Array.isArray(hkFormOptions.items)
          ? hkFormOptions.items
          : [];

    if (!units.length) return [];

    return units.map((u) => ({
      id: u.id,
      value: u.id,
      label: u.unitName || u.label || u.name || '',
      unitName: u.unitName || u.label || u.name || '',
      city: u.city || '',
    }));
  }, [hkFormOptions]);

  const hkCategoryOptions = useMemo(() => {
    if (!hkFormOptions) return [];

    // Support different possible shapes from the API for categories as well
    const categories = Array.isArray(hkFormOptions.categories)
      ? hkFormOptions.categories
      : Array.isArray(hkFormOptions.data?.categories)
        ? hkFormOptions.data.categories
        : Array.isArray(hkFormOptions.items)
          ? hkFormOptions.items
          : [];

    if (!categories.length) return [];

    return categories.map((c) => ({
      id: c.id,
      value: c.id,
      label: c.name || c.label || '',
      name: c.name || '',
      type: c.type || '',
    }));
  }, [hkFormOptions]);
  useEffect(() => {
    // When allocating to Housekeepers, fetch HK form options similar to HKTransactions page
    if (!allocationDrawerOpen || allocationType !== 'hk') {
      return;
    }
    if (hkFormOptions) {
      return;
    }

    const fetchHkFormOptions = async () => {
      try {
        const data = await api.get('/api/hk-transactions/form-options');
        setHkFormOptions(data);
      } catch (err) {
        console.error('Error loading HK form options', err);
      }
    };

    fetchHkFormOptions();
  }, [allocationDrawerOpen, allocationType, hkFormOptions]);
  const [editDrawerOpen, setEditDrawerOpen] = useState(false);
  const [editRow, setEditRow] = useState(null);
  useEffect(() => {
    if (!allocationRow) {
      setAllocationForm({
        date: '',
        amount: '',
        notes: '',
      });
      return;
    }

    const date =
      allocationRow.date ||
      (allocationRow.createdAt
        ? String(allocationRow.createdAt).split(' ')[0]
        : '');

    setAllocationForm({
      date: date || '',
      amount: allocationRow.amount || '',
      notes: allocationRow.notes || '',
    });
  }, [allocationRow]);

  useEffect(() => {
    const search = location.search || '';
    if (!search) return;

    const params = new URLSearchParams(search);
    const focusId = params.get('focusId');
    if (!focusId) return;

    // Remove focusId from this page's URL so it doesn't stay sticky
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('focusId');
      window.history.replaceState({}, '', url.toString());
    } catch (e) {
      // Fail silently if URL API is not available
    }
  }, [location.search]);

  const handleCreateSuccess = () => {
    setDrawerOpen(false);
    setReloadToken((prev) => prev + 1);
  };

  const handleCreateSubmit = async (values) => {
    try {
      await api.post('/api/employee-cash-ledger', values);
      handleCreateSuccess();
    } catch (err) {
      console.error(err);
      // Optionally we could surface an error state/toast here later
    }
  };

  const handleEditSubmit = async (payload) => {
    if (!payload || !payload.id) return;

    const {
      id,
      date,
      type,
      notes,
      amount,
      status,
      adminComment,
      attachmentsToRemove = [],
      filesToUpload = [],
    } = payload;

    try {
      // If there are no files and no attachment removals, use a simple JSON PATCH
      if (filesToUpload.length === 0 && attachmentsToRemove.length === 0) {
        await api.patch(
          `/api/employee-cash-ledger/${id}`,
          {
            date,
            type,
            notes,
            amount,
            status,
            adminComment,
          },
          {
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );
      } else {
        // When there are files to upload (or attachments to remove), use FormData
        const formData = new FormData();
        if (date) formData.append('date', date);
        if (type) formData.append('type', type);
        if (typeof notes === 'string') formData.append('notes', notes);
        if (amount !== undefined && amount !== null && amount !== '') {
          formData.append('amount', amount);
        }
        if (status) formData.append('status', status);
        if (typeof adminComment === 'string') formData.append('adminComment', adminComment);

        // Pass attachment removal info so the backend can handle it later
        attachmentsToRemove.forEach((att) => {
          if (att && att.id != null) {
            formData.append('attachmentsToRemove[]', String(att.id));
          }
        });

        // Append new files to upload using indexed keys (files[0], files[1], ...)
        filesToUpload.forEach((file, idx) => {
          if (file) {
            formData.append(`files[${idx}]`, file);
          }
        });

        // Let Symfony treat this as a PATCH via _method override
        formData.append('_method', 'PATCH');
        await api.post(`/api/employee-cash-ledger/${id}`, formData);
      }

      setEditDrawerOpen(false);
      setEditRow(null);
      setReloadToken((prev) => prev + 1);
    } catch (err) {
      console.error('Error updating employee cash row', err);
      // TODO: surface toast later
    }
  };

  const handleEditDelete = async (row) => {
    if (!row || !row.id) return;

    try {
      await api.delete(`/api/employee-cash-ledger/${row.id}`);
      setEditDrawerOpen(false);
      setEditRow(null);
      setReloadToken((prev) => prev + 1);
    } catch (err) {
      console.error('Error deleting employee cash row', err);
      // TODO: surface toast later
    }
  };

  const handleAllocationSuccess = async (type, created) => {
    if (!allocationRow || !created) {
      console.warn('Missing allocation row or created transaction payload', { allocationRow, created });
      return;
    }

    // Normalise the created payload into a single "row" object.
    // It might come as the row itself, or wrapped in { row: {...} } or { data: {...} }.
    const createdRow =
      (created && created.row) ||
      (created && created.data) ||
      created;

    if (!createdRow || !createdRow.id) {
      console.warn('Could not determine created transaction row / id for allocation', { created });
      return;
    }

    const allocationId = createdRow.id;

    const allocationCode =
      createdRow.code ||
      createdRow.transactionCode ||
      (created.row && (created.row.code || created.row.transactionCode)) ||
      (created.data && (created.data.code || created.data.transactionCode)) ||
      null;

    try {
      await api.post(`/api/employee-cash-ledger/${allocationRow.id}/allocate`, {
        allocationType: type,
        allocationId,
        allocationCode,
        status: 'Allocated',
      });

      setAllocationDrawerOpen(false);
      setAllocationRow(null);
      setAllocationType(null);
      setReloadToken((prev) => prev + 1);
    } catch (e) {
      console.error('Error updating allocation on employee cash row', e);
      // TODO: later surface as toast
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  useEffect(() => {
    const fetchRows = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (filters.status) params.append('status', filters.status);
        if (filters.type) params.append('type', filters.type);
        if (filters.month) params.append('month', filters.month);

        const query = params.toString();
        const url = query ? "/api/employee-cash-ledger?" + query : "/api/employee-cash-ledger";

        const data = await api.get(url);

        // Support both plain JSON and wrapped responses (e.g. { data: { rows: [...] } })
        let rowsPayload = [];
        if (data && Array.isArray(data.rows)) {
          rowsPayload = data.rows;
        } else if (data && data.data && Array.isArray(data.data.rows)) {
          rowsPayload = data.data.rows;
        }

        setRows(rowsPayload);
      } catch (err) {
        console.error(err);
        setError(err.message || 'Error loading data');
      } finally {
        setLoading(false);
      }
    };

    fetchRows();
  }, [filters.status, filters.type, filters.month, reloadToken]);

  const columns = useMemo(
    () => [
      {
        header: 'Date',
        accessor: 'date',
        width: 150,
        minWidth: 150,
        truncate: false,
        render: (value, row) => {
          // Prefer business date from API: row.date (YYYY-MM-DD)
          const raw = row?.date || value || (row?.createdAt ? String(row.createdAt).split(' ')[0] : '');
          if (!raw) return '';

          const [year, month, day] = String(raw).split('-');
          const formatted = (year && month && day) ? `${day}-${month}-${year}` : String(raw);

          // Code from row
          const code = row?.code || '';

          return (
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: '1.2' }}>
              <span>{formatted}</span>
              {code && (
                <span
                  style={{
                    fontSize: '11px',
                    color: '#1E6F68',
                    cursor: 'pointer',
                    fontWeight: 600,
                    transition: 'color 0.15s ease-in-out',
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditRow(row);
                    setEditDrawerOpen(true);
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.color = '#F57C00';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.color = '#1E6F68';
                  }}
                >
                  {code}
                </span>
              )}
            </div>
          );
        },
      },
      {
        header: 'Employee',
        accessor: 'employeeShortName',
        width: 200,
        minWidth: 200,
        filter: {
          type: 'text',
          label: 'Employee',
          placeholder: 'Search…',
        },
        render: (value, row) => {
          const shortName = value || '';
          const costCentre = row?.costCentre || '';

          return (
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: '1.2' }}>
              <span>{shortName}</span>
              <span style={{ fontSize: '11px', color: '#666' }}>{costCentre}</span>
            </div>
          );
        },
      },
      {
        header: 'Type',
        accessor: 'type',
        width: 150,
        minWidth: 140,
        filter: {
          type: 'select',
          label: 'Type',
          options: TYPE_OPTIONS,
          key: 'type',
        },
        render: (value) => {
          if (!value) return '';
          if (value === 'CashAdvance') return 'Cash Advance';
          if (value === 'GuestPayment') return 'Guest Payment';
          if (value === 'CashReturn') return 'Cash Return';
          return value;
        },
      },
      {
        header: 'Notes',
        accessor: 'notes',
        width: 220,
        minWidth: 200,
        truncate: true,
        render: (value, row) => {
          const notes = value || '';
          const adminComment = row?.adminComment || '';

          if (!notes && !adminComment) return '';

          return (
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: '1.2' }}>
              {notes && (
                <span title={notes}>
                  {notes}
                </span>
              )}
              {adminComment && (
                <span style={{ fontSize: '11px', color: '#666' }} title={adminComment}>
                  {adminComment}
                </span>
              )}
            </div>
          );
        },
      },
      {
        header: 'Amount',
        accessor: 'amount',
        width: 110,
        minWidth: 110,
        align: 'right',
        truncate: false,
        render: (value, row) => {
          const format = (v) => {
            if (v == null) return '';
            const num = Number(v);
            if (Number.isNaN(num)) return v;
            return num.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            });
          };

          const amount = format(value);
          const balance = format(row?.balance);

          const balanceNum = row?.balance == null ? null : Number(row.balance);
          const balanceColor =
            balanceNum == null || Number.isNaN(balanceNum)
              ? '#666'
              : balanceNum > 0
                ? '#1E6F68'
                : balanceNum < 0
                  ? '#C62828'
                  : '#666';

          return (
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: '1.2', textAlign: 'right' }}>
              <span>{amount}</span>
              <span style={{ fontSize: '11px', color: balanceColor, fontWeight: 600 }}>{balance}</span>
            </div>
          );
        },
      },
      {
        header: 'Status',
        accessor: 'status',
        width: 130,
        minWidth: 120,
        filter: {
          type: 'select',
          label: 'Status',
          options: STATUS_OPTIONS,
          key: 'status',
        },
        render: (value) => {
          const v = value || '';
          let color = '#555';

          if (v === 'Approved') color = '#1E6F68';      // Teal
          else if (v === 'Pending') color = '#D4A017'; // Yellow
          else if (v === 'Rejected') color = '#C62828'; // Red
          else if (v === 'Allocated') color = '#1565C0'; // Blue

          return (
            <span style={{ color, fontWeight: 600 }}>
              {v}
            </span>
          );
        },
      },
      {
        header: 'Attach',
        accessor: 'attachments', // map to attachments array from API
        width: 90,
        minWidth: 80,
        align: 'center',
        truncate: true,
        render: (value, row) => {
          const attachments = value || row?.attachments;
          if (!attachments || !attachments.length) return '';

          const url = attachments[0]?.url;
          if (!url) return '';

          const handleClick = (event) => {
            // Prevent triggering row click (which opens the edit form)
            event.stopPropagation();
            // Open inline preview in drawer
            setPreviewUrl(url);
          };

          return (
            <IconButton
              size="small"
              onClick={handleClick}
              aria-label="View attachment"
            >
              <span style={{ fontSize: 18, lineHeight: 1 }}>📎</span>
            </IconButton>
          );
        },
      },
      {
        header: 'Allocate',
        accessor: 'allocationId',
        width: 120,
        minWidth: 120,
        align: 'center',
        truncate: false,
        render: (value, row) => {
          const hasAllocation = !!row?.allocationId;
          const status = row?.status || '';
          if (status === 'Rejected') {
            return '';
          }

          if (hasAllocation) {
            const code = row?.allocationCode || 'Allocated';
            return (
              <span
                style={{
                  fontWeight: 600,
                  color: '#1E6F68',
                  cursor: 'pointer',
                  transition: 'color 0.15s ease-in-out',
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  handleAllocationCodeClick(row);
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.color = '#F57C00';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.color = '#1E6F68';
                }}
              >
                {code}
              </span>
            );
          }

          const handleClick = (event) => {
            event.stopPropagation();
            setAllocationRow(row);
            setAllocationType(null);
            setAllocationDrawerOpen(true);
          };

          return (
            <Button
              variant="outlined"
              size="small"
              onClick={handleClick}
            >
              Allocate
            </Button>
          );
        },
      },
    ],
    [setPreviewUrl, setAllocationRow, setAllocationDrawerOpen, setAllocationType, setEditRow, setEditDrawerOpen]
  );

  const stickyHeader = (
    <Box sx={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', gap: 2 }}>
      <Button
        variant="outlined"
        size="small"
        sx={{
          borderColor: '#1E6F68',
          color: '#1E6F68',
          fontWeight: 500,
          '&:hover': {
            borderColor: '#1E6F68',
            backgroundColor: 'rgba(30, 111, 104, 0.04)',
          },
        }}
        startIcon={
          <Box component="span" sx={{ fontSize: 18, lineHeight: 1 }}>
            +
          </Box>
        }
        onClick={() => setDrawerOpen(true)}
      >
        Add
      </Button>
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        <YearMonthPicker
          value={filters.month}
          onChange={(ym) => handleFilterChange('month', ym)}
        />
      </Box>
    </Box>
  );

  return (
    <PageScaffoldTable stickyHeader={stickyHeader}>

      <TableLite
        columns={columns}
        rows={rows}
        loading={loading}
        error={error}
        dense
        enableFilters
        filterValues={filters}
        onFilterChange={handleFilterChange}
      />
      <AppDrawer
        open={allocationDrawerOpen}
        title="Allocate transaction"
        onClose={() => {
          setAllocationDrawerOpen(false);
          setAllocationRow(null);
          setAllocationType(null);
        }}
        maxWidth="sm"
      >
        {!allocationRow ? (
          <Typography variant="body2">Select a row to allocate.</Typography>
        ) : (
          <>
            <Box
              sx={{
                mb: 2,
                p: 1.5,
                bgcolor: '#F8FAF9',
                borderRadius: 1,
                border: '1px solid #E0E6E8',
              }}
            >
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                Summary
              </Typography>
              <Typography variant="body2">
                {(allocationRow.createdAt
                  ? String(allocationRow.createdAt).split(' ')[0]
                  : allocationRow.date) || ''}{' '}
                • {allocationRow.type} • {allocationRow.amount}
              </Typography>
              {allocationRow.notes && (
                <Typography variant="body2" sx={{ mt: 0.5, color: 'text.secondary' }}>
                  {allocationRow.notes}
                </Typography>
              )}
              {allocationRow.attachments && allocationRow.attachments.length > 0 && (
                <Box
                  sx={{
                    mt: 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                  }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    Attachment:
                  </Typography>
                  <Button
                    size="small"
                    variant="text"
                    onClick={(event) => {
                      event.stopPropagation();
                      const url = allocationRow.attachments[0]?.url;
                      if (url) {
                        setPreviewUrl(url);
                      }
                    }}
                    startIcon={
                      <span style={{ fontSize: 16, lineHeight: 1 }}>📎</span>
                    }
                  >
                    View
                  </Button>
                </Box>
              )}
            </Box>

            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Allocation type
            </Typography>

            <ToggleButtonGroup
              value={allocationType}
              exclusive
              onChange={(_, value) => {
                if (value !== null) {
                  setAllocationType(value);
                }
              }}
              size="small"
              sx={{ mb: 2 }}
            >
              <ToggleButton value="owners2">Owners2</ToggleButton>
              <ToggleButton value="unit">Unit</ToggleButton>
              <ToggleButton value="hk">Housekeepers</ToggleButton>
            </ToggleButtonGroup>

            <Divider sx={{ mb: 2 }} />

            {allocationType == null && (
              <Typography variant="body2" color="text.secondary">
                Select an allocation type to continue.
              </Typography>
            )}

            {allocationType && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Typography variant="subtitle2">
                  {allocationType === 'owners2'
                    ? 'Owners2 transaction'
                    : allocationType === 'unit'
                    ? 'Unit transaction'
                    : 'Housekeepers transaction'}
                </Typography>

                {allocationType === 'owners2' && (
                  <NewO2TransactionForm
                    defaultValues={{
                      date: allocationForm.date,
                      amount: allocationForm.amount,
                      notes: allocationForm.notes,
                      attachments: allocationRow.attachments || [],
                      sourceType: 'employeeCash',
                      sourceId: allocationRow.id,
                    }}
                    onSaved={(created) => handleAllocationSuccess('owners2', created)}
                    hideFileUpload
                  />
                )}

                {allocationType === 'unit' && (
                  <UnitTransactionNewFormRHF
                    showO2Mirror={false}
                    showAttachment={false}
                    showInlineActions
                    defaultDate={allocationForm.date}
                    defaultAmount={allocationForm.amount}
                    defaultService={allocationRow.notes || allocationForm.notes}
                    onSave={(created) => handleAllocationSuccess('unit', created)}
                    onClose={() => {
                      setAllocationDrawerOpen(false);
                      setAllocationRow(null);
                      setAllocationType(null);
                    }}
                  />
                )}

                {allocationType === 'hk' && (
                  <HKTransactionNewFormRHF
                    defaultValues={{
                      date: allocationForm.date,
                      description: allocationForm.notes,
                      paid: allocationForm.amount,
                    }}
                    unitOptions={hkUnitOptions}
                    categoryOptions={hkCategoryOptions}
                    hideFileInputs
                    showInlineActions
                    onSubmit={async (values) => {
                      try {
                        // Build sourceAttachments from the original cash ledger row attachments
                        const sourceAttachments = (allocationRow.attachments || [])
                          .filter((att) => att && att.documentId)
                          .map((att) => ({ documentId: att.documentId }));

                        const payload = {
                          ...values,
                          sourceType: 'employeeCash',
                          sourceId: allocationRow.id,
                          sourceAttachments,
                        };

                        const created = await api.post('/api/hk-transactions', payload);
                        await handleAllocationSuccess('hk', created);
                      } catch (err) {
                        console.error('Error creating HK transaction from allocation', err);
                      }
                    }}
                    onCancel={() => {
                      setAllocationDrawerOpen(false);
                      setAllocationRow(null);
                      setAllocationType(null);
                    }}
                  />
                )}
              </Box>
            )}
          </>
        )}
      </AppDrawer>
      <AppDrawer
        open={editDrawerOpen}
        title="Edit Employee Transaction"
        onClose={() => {
          setEditDrawerOpen(false);
          setEditRow(null);
        }}
        maxWidth="sm"
        formId={EDIT_FORM_ID}
        showActions
        extraActions={
          editRow
            ? (
              <Button
                variant="text"
                color="error"
                onClick={() => handleEditDelete(editRow)}
              >
                Delete
              </Button>
            )
            : null
        }
      >
        {editRow && (
          <EmployeeCashLedgerEditFormRHF
            row={editRow}
            onSubmit={handleEditSubmit}
            onDelete={handleEditDelete}
            onCancel={() => {
              setEditDrawerOpen(false);
              setEditRow(null);
            }}
            formId={EDIT_FORM_ID}
          />
        )}
      </AppDrawer>
      <AppDrawer
        open={drawerOpen}
        title="New Employee Transaction"
        onClose={() => setDrawerOpen(false)}
        formId={FORM_ID}
        showActions
      >
        <EmployeeTransAdminNewFormRHF
          formId={FORM_ID}
          onSubmit={handleCreateSubmit}
        />
      </AppDrawer>
      <AppDrawer
        open={Boolean(previewUrl)}
        title="Attachment"
        onClose={() => setPreviewUrl(null)}
        maxWidth="md"
      >
        {previewUrl && (
          <>
            {previewUrl.toLowerCase().includes('.pdf') ? (
              <Box sx={{ height: '80vh' }}>
                <iframe
                  src={previewUrl}
                  title="Attachment preview"
                  style={{ width: '100%', height: '100%', border: 'none' }}
                />
              </Box>
            ) : (
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', p: 2 }}>
                <img
                  src={previewUrl}
                  alt="Attachment"
                  style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain' }}
                />
              </Box>
            )}
          </>
        )}
      </AppDrawer>
    </PageScaffoldTable>
  );
}
