import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Box, Stack, TextField, MenuItem, Button, Typography, Paper } from '@mui/material';
import api from '../api';
import AppDrawer from '../components/common/AppDrawer';
import HRNewFormRHF from '../components/forms/HRNewFormRHF';
import HREditFormRHF from '../components/forms/HREditFormRHF';
import PageScaffold from '../components/layout/PageScaffold';
import TableLite from '../components/layout/TableLite';

const DEFAULT_PAGE_SIZE = 25;
const FORM_ID = 'hr-new-employee-form';

const divisionOptions = ['Owners2', 'Housekeepers'];
const areaOptions = ['Admin', 'Supervisor', 'Cleaning'];
const statusOptions = ['Active', 'OnLeave', 'Terminated'];
const cityOptions = ['General', 'Playa del Carmen', 'Tulum', 'Puerto Morelos'];

export default function Employees() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState(null);

  // Filters
  const [q, setQ] = useState('');
  const [division, setDivision] = useState('');
  const [area, setArea] = useState('');
  const [city, setCity] = useState('');
  const [status, setStatus] = useState('');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editDrawerOpen, setEditDrawerOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);

  const roles = useMemo(() => {
    try {
      const raw = localStorage.getItem('roles');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }, []);
  const isManagerOnly = roles.includes('ROLE_MANAGER') && !roles.includes('ROLE_ADMIN');

  const columns = useMemo(() => {
    const list = [
      {
        header: 'Status',
        accessor: 'status',
        filter: { type: 'select', inline: true, options: statusOptions.map((v) => ({ label: v, value: v })) },
        render: (_value, row) => (
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
            <span style={{ fontWeight: 600 }}>{row?.status || '-'}</span>
            <span
              style={{
                color: '#008080',
                cursor: 'pointer',
                transition: 'color 0.2s',
                fontSize: 12,
              }}
              onMouseEnter={(e) => (e.target.style.color = 'orange')}
              onMouseLeave={(e) => (e.target.style.color = '#008080')}
              onClick={() => {
                setSelectedEmployee(row);
                setEditDrawerOpen(true);
              }}
            >
              {row?.employeeCode || '-'}
            </span>
          </div>
        ),
      },
      {
        header: 'Name',
        accessor: 'name',
        filter: { type: 'text', inline: true },
        render: (value, row) => (
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
            <span style={{ fontWeight: 600 }}>{value || '-'}</span>
            {row?.shortName ? (
              <span style={{ fontSize: 12, color: '#6b7280' }}>{row.shortName}</span>
            ) : null}
          </div>
        ),
      },
      {
        header: 'Contact',
        accessor: 'phone',
        filter: { type: 'text', inline: true, placeholder: 'Contact' },
        render: (_value, row) => (
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
            <span>{row?.phone || '-'}</span>
            {row?.email ? (
              <span style={{ fontSize: 12, color: '#6b7280' }}>{row.email}</span>
            ) : null}
          </div>
        ),
      },
      {
        header: 'Division',
        accessor: 'division',
        filter: { type: 'select', inline: true, options: divisionOptions.map((v) => ({ label: v, value: v })) },
        render: (_value, row) => {
          const metaParts = [];
          if (row?.area) metaParts.push(row.area);
          if (row?.city) {
            metaParts.push(row.city === 'Playa del Carmen' ? 'Playa' : row.city);
          }
          const metaLabel = metaParts.length ? metaParts.join(' • ') : '-';
          return (
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
              <span style={{ fontWeight: 600 }}>{row?.division || '-'}</span>
              <span style={{ fontSize: 12, color: '#6b7280' }}>{metaLabel}</span>
            </div>
          );
        },
      },
      {
        header: 'Started', accessor: 'dateStarted',
        filter: { type: 'text', inline: true, placeholder: 'Started' },
        render: (value) => {
          const dateStr = value;
          if (!dateStr) return '-';
          const parts = dateStr.split('-');
          if (parts.length === 3) {
            return `${parts[2]}-${parts[1]}-${parts[0]}`;
          }
          return dateStr;
        },
        className: 'date',
      },
    ];

    if (!isManagerOnly) {
      list.push(
        {
          header: 'Initial Salary',
          accessor: 'initialSalary',
          filter: { type: 'text', inline: true },
          render: (value) => (value != null ? `${value}` : '-'),
        },
        {
          header: 'Current Salary',
          accessor: 'currentSalary',
          filter: { type: 'text', inline: true },
          render: (value) => (value != null ? `${value}` : '-'),
        }
      );
    }
    list.push({
      header: 'Bank',
      accessor: 'bank',
      filter: { type: 'text', inline: true, placeholder: 'Bank' },
      render: (_value, row) => {
        const bankName = row?.bank || row?.bankName || '-';
        const accountRaw = row?.accountNumber || row?.bankAccount || '';
        const masked = (() => {
          if (!accountRaw) return null;
          const digits = String(accountRaw).replace(/\s+/g, '');
          if (!digits) return null;
          const tail = digits.slice(-3);
          return `*...${tail}`;
        })();
        return (
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
            <span style={{ fontWeight: 600 }}>{bankName}</span>
            {masked && (
              <span style={{ fontSize: 12, color: '#6b7280' }}>{masked}</span>
            )}
          </div>
        );
      },
    });

    return list;
  }, [isManagerOnly]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { page, pageSize };
      if (q) params.q = q;
      if (division) params.division = division;
      if (area) params.area = area;
      if (city) params.city = city;
      if (status) params.status = status;

      // Use explicit /api path since baseURL is just origin
      const { data } = await api.get('/api/employees', { params });
      setRows(data?.member || []);
      setTotal(data?.total || 0);
    } catch (err) {
      console.error('Failed to load employees', err);
      setError(err?.response?.data?.message || err.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, q, division, area, city, status]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleClearFilters = () => {
    setDivision('');
    setArea('');
    setCity('');
    setStatus('');
    setPage(1);
  };

  const handleCreate = async (payload) => {
    try {
      setSaving(true);
      // POST to API
      await api.post('/api/employees', payload);
      setDrawerOpen(false);
      // refresh table
      await fetchData();
    } catch (err) {
      console.error('Create employee failed', err);
      alert(err?.response?.data?.message || 'Failed to create employee');
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageScaffold
      title="Employees"
      sectionKey="management"
      currentPath="/employees"
      layout="table"
      stickyHeader={
        <Stack direction="row" spacing={1}>
          <Button variant="contained" onClick={() => setDrawerOpen(true)}>
            + New
          </Button>
          <Button variant="outlined" onClick={handleClearFilters}>
            Clear Filters
          </Button>
        </Stack>
      }
    >
      <TableLite
        columns={columns}
        rows={rows}
        loading={loading}
        error={error}
        enableFilters
        defaultStringTransform={null}
        filterValues={{
          name: q,
          division,
          area,
          city,
          status,
        }}
        onFilterChange={(key, value) => {
          if (key === 'division') setDivision(value || '');
          else if (key === 'area') setArea(value || '');
          else if (key === 'city') setCity(value || '');
          else if (key === 'status') setStatus(value || '');
        }}
      />
      <AppDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="New Employee"
        width={480}
        showActions
        formId={FORM_ID}
      >
        <HRNewFormRHF
          formId={FORM_ID}
          onSubmit={handleCreate}
        />
        {saving && (<Typography variant="caption" sx={{ mt: 1, display: 'block' }}>Saving…</Typography>)}
      </AppDrawer>
      <AppDrawer
        open={editDrawerOpen}
        onClose={() => setEditDrawerOpen(false)}
        title={`Edit Employee`}
        width={480}
        showActions
        formId="hr-edit-employee-form"
      >
        <HREditFormRHF
          employee={selectedEmployee}
          onSubmit={async (payload) => {
            try {
              setSaving(true);
              await api.put(`/api/employees/${selectedEmployee.id}`, payload);
              setEditDrawerOpen(false);
              await fetchData();
            } catch (err) {
              console.error('Update employee failed', err);
              alert(err?.response?.data?.message || 'Failed to update employee');
            } finally {
              setSaving(false);
            }
          }}
        />
        {saving && (<Typography variant="caption" sx={{ mt: 1, display: 'block' }}>Saving…</Typography>)}
      </AppDrawer>
    </PageScaffold>
  );
}
