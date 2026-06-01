import React from 'react';
import {
  Box,
  Button,
  Stack,
} from '@mui/material';
import api from '../api';
import AppDrawer from '../components/common/AppDrawer';
import HKLaundryRecordNewFormRHF from '../components/forms/HKLaundryRecordNewFormRHF';
import HKLaundryRecordEditFormRHF from '../components/forms/HKLaundryRecordEditFormRHF';
import AppShell from '../components/layout/AppShell';
import PageScaffold from '../components/layout/PageScaffold';
import TableLite from '../components/layout/TableLite';
import YearMonthPicker from '../components/layout/components/YearMonthPicker';

const NEW_FORM_ID = 'hk-laundry-record-new-form';
const EDIT_FORM_ID = 'hk-laundry-record-edit-form';

export default function HKLaundryRecords() {
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [editDrawerOpen, setEditDrawerOpen] = React.useState(false);
  const [selectedRecord, setSelectedRecord] = React.useState(null);
  const [units, setUnits] = React.useState([]);
  const [rates, setRates] = React.useState([]);
  const [records, setRecords] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [yearMonth, setYearMonth] = React.useState('');
  const [page, setPage] = React.useState(0);
  const pageSize = 25;
  const [newFormSubmitMode, setNewFormSubmitMode] = React.useState('close');

  const loadData = React.useCallback(async () => {
    try {
      setLoading(true);
      const [unitsRes, ratesRes, recordsRes] = await Promise.all([
        api.get('/api/units/options'),
        api.get('/api/hk-laundry-rates'),
        api.get('/api/hk-laundry-records'),
      ]);

      setUnits(
        Array.isArray(unitsRes.data)
          ? unitsRes.data.map((u) => ({
              ...u,
              unitName: u.unitName || u.unit_name,
            }))
          : []
      );
      setRates(Array.isArray(ratesRes.data) ? ratesRes.data : []);
      setRecords(Array.isArray(recordsRes.data) ? recordsRes.data : []);
    } catch (e) {
      console.error('Failed loading laundry page data', e);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadData();
  }, [loadData]);


  const displayRows = React.useMemo(() => {
    const filtered = yearMonth
      ? records.filter((row) => String(row.laundryDate || '').startsWith(yearMonth))
      : records;

    return [...filtered].sort((a, b) => {
      const dateCompare = String(b.laundryDate || '').localeCompare(String(a.laundryDate || ''));
      if (dateCompare !== 0) return dateCompare;
      return Number(b.id || 0) - Number(a.id || 0);
    });
  }, [records, yearMonth]);

  const pagedRows = React.useMemo(() => {
    const start = page * pageSize;
    return displayRows.slice(start, start + pageSize);
  }, [displayRows, page, pageSize]);

  React.useEffect(() => {
    setPage(0);
  }, [yearMonth]);

  const handleCreate = async (payload) => {
    try {
      await api.post('/api/hk-laundry-records', payload);

      if (newFormSubmitMode === 'close') {
        setDrawerOpen(false);
      }

      await loadData();
      return true;
    } catch (e) {
      console.error('Failed creating laundry record', e);
      throw e;
    } finally {
      setNewFormSubmitMode('close');
    }
  };

  const handleOpenEdit = React.useCallback((record) => {
    setSelectedRecord(record);
    setEditDrawerOpen(true);
  }, []);

  const handleUpdate = async (payload) => {
    if (!selectedRecord?.id) return;

    try {
      await api.put(`/api/hk-laundry-records/${selectedRecord.id}`, payload);
      setEditDrawerOpen(false);
      setSelectedRecord(null);
      await loadData();
    } catch (e) {
      console.error('Failed updating laundry record', e);
    }
  };

  const columns = React.useMemo(() => ([
    {
      header: 'Laundry',
      accessor: (row) => ({
        primary: row.unitName || '-',
        meta: (
          <Box
            component="button"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              handleOpenEdit(row);
            }}
            sx={{
              appearance: 'none',
              border: 0,
              background: 'transparent',
              color: 'inherit',
              font: 'inherit',
              p: 0,
              m: 0,
              cursor: 'pointer',
              textDecoration: 'none',
              '&:hover': {
                textDecoration: 'underline',
              },
            }}
          >
            {row.laundryDate || '-'}
          </Box>
        ),
      }),
      twoLineClassName: 'o2-two-line-code',
      filter: { type: 'select', placeholder: 'Unit', accessor: 'unitName' },
    },
    {
      header: 'Type',
      accessor: (row) => ({
        primary: row.itemType || '-',
        meta: row.rateSnapshot ? `${row.rateSnapshot} MXN` : '-',
      }),
      twoLineClassName: 'o2-two-line-code',
      filter: { type: 'select', placeholder: 'Type', accessor: 'itemType' },
    },
    { header: 'Amount', accessor: 'quantity', align: 'right' },
    {
      header: 'Paid',
      accessor: (row) => ({
        primary: row.chargedAmount ? `${row.chargedAmount} MXN` : '-',
        meta: row.expectedAmount ? `Expected ${row.expectedAmount} MXN` : 'Expected -',
      }),
      twoLineClassName: (row) => {
        const charged = Number(row.chargedAmount || 0);
        const expected = Number(row.expectedAmount || 0);
        return Math.abs(charged - expected) > 0.009
          ? 'o2-two-line-warning'
          : 'o2-two-line-code';
      },
      align: 'right',
    },
    { header: 'Created by', accessor: 'createdBy' },
    { header: 'Notes', accessor: 'notes' },
  ]), [handleOpenEdit]);

  const headerActions = (
    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
      <YearMonthPicker
        label="Month"
        value={yearMonth}
        onChange={(value) => {
          setYearMonth(value || '');
          setPage(0);
        }}
      />
      <Button variant="outlined" color="success" onClick={() => setDrawerOpen(true)}>
        + Add
      </Button>
      <Button variant="outlined">
        Units & Fees
      </Button>
    </Stack>
  );

  return (
    <AppShell sectionKey="housekeepers" currentPath="/hk-laundry-records">
      <PageScaffold
        layout="table"
        withCard
        title="Laundry Records"
        stickyHeader={headerActions}
        headerPlacement="inside"
      >

        <TableLite
          columns={columns}
          rows={pagedRows}
          loading={loading}
          enableFilters
          emptyMessage="No laundry records found."
          page={page}
          pageSize={pageSize}
          total={displayRows.length}
          onPageChange={setPage}
        />
      </PageScaffold>

      <AppDrawer
        open={drawerOpen}
        onClose={() => {
          setNewFormSubmitMode('close');
          setDrawerOpen(false);
        }}
        title="New Laundry Record"
        showActions
        formId={NEW_FORM_ID}
        actions={{
          saveLabel: 'Save',
          cancelLabel: 'Cancel',
          showDelete: false,
        }}
        extraActions={(
          <Button
            type="submit"
            form={NEW_FORM_ID}
            variant="contained"
            sx={{
              ml: 'auto',
              bgcolor: '#00897b',
              '&:hover': {
                bgcolor: '#00796b',
              },
            }}
            onClick={() => setNewFormSubmitMode('add')}
          >
            + Add
          </Button>
        )}
      >
        <HKLaundryRecordNewFormRHF
          formId={NEW_FORM_ID}
          units={units}
          rates={rates}
          onSubmit={handleCreate}
        />
      </AppDrawer>
      <AppDrawer
        open={editDrawerOpen}
        onClose={() => {
          setEditDrawerOpen(false);
          setSelectedRecord(null);
        }}
        title="Edit Laundry Record"
        showActions
        formId={EDIT_FORM_ID}
        actions={{
          saveLabel: 'Save',
          cancelLabel: 'Cancel',
          showDelete: false,
        }}
      >
        {selectedRecord && (
          <HKLaundryRecordEditFormRHF
            formId={EDIT_FORM_ID}
            record={selectedRecord}
            units={units}
            rates={rates}
            onSubmit={handleUpdate}
          />
        )}
      </AppDrawer>
    </AppShell>
  );
}