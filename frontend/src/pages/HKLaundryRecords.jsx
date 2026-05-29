import React from 'react';
import {
  Box,
  Typography,
  Button,
  Stack,
} from '@mui/material';
import api from '../api';
import AppDrawer from '../components/common/AppDrawer';
import HKLaundryRecordNewFormRHF from '../components/forms/HKLaundryRecordNewFormRHF';
import AppShell from '../components/layout/AppShell';
import PageScaffold from '../components/layout/PageScaffold';
import TableLite from '../components/layout/TableLite';

const FORM_ID = 'hk-laundry-record-new-form';

export default function HKLaundryRecords() {
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [units, setUnits] = React.useState([]);
  const [rates, setRates] = React.useState([]);
  const [records, setRecords] = React.useState([]);
  const [loading, setLoading] = React.useState(false);

  const loadData = React.useCallback(async () => {
    try {
      setLoading(true);
      const [unitsRes, ratesRes, recordsRes] = await Promise.all([
        api.get('/api/units'),
        api.get('/api/hk-laundry-rates'),
        api.get('/api/hk-laundry-records'),
      ]);

      setUnits(Array.isArray(unitsRes.data) ? unitsRes.data : []);
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

  const currentKgRate = React.useMemo(() => {
    return rates.find((rate) => {
      const itemType = String(rate.itemType || '').toLowerCase();
      const city = String(rate.city || '').toLowerCase();
      const isPlaya = city === 'playa' || city === 'playa del carmen';
      return rate.isActive !== false && isPlaya && ['kg', 'kilo'].includes(itemType);
    });
  }, [rates]);

  const handleCreate = async (payload) => {
    try {
      await api.post('/api/hk-laundry-records', payload);
      setDrawerOpen(false);
      await loadData();
    } catch (e) {
      console.error('Failed creating laundry record', e);
    }
  };

  const columns = React.useMemo(() => ([
    { header: 'Date', accessor: 'laundryDate' },
    { header: 'Unit', accessor: 'unitName' },
    { header: 'Amount', accessor: 'quantity', align: 'right' },
    { header: 'Rate', accessor: 'rateSnapshot', align: 'right' },
    { header: 'Expected', accessor: 'expectedAmount', align: 'right' },
    { header: 'Charged', accessor: 'chargedAmount', align: 'right' },
    { header: 'Created by', accessor: 'createdBy' },
    { header: 'Notes', accessor: 'notes' },
  ]), []);

  const headerActions = (
    <Stack direction="row" spacing={1} alignItems="center">
      <Button variant="contained" onClick={() => setDrawerOpen(true)}>
        New Record
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
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5 }}>
            Current Laundry Rate
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {currentKgRate
              ? `${currentKgRate.city}: ${currentKgRate.unitPrice} MXN/kg · Effective from ${currentKgRate.effectiveFrom || '-'}`
              : 'No active Playa kg rate configured yet.'}
          </Typography>
        </Box>

        <TableLite
          columns={columns}
          rows={records}
          loading={loading}
          enableFilters
          emptyMessage="No laundry records found."
        />
      </PageScaffold>

      <AppDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="New Laundry Record"
        showActions
        formId={FORM_ID}
        actions={{
          saveLabel: 'Save',
          cancelLabel: 'Cancel',
          showDelete: false,
        }}
      >
        <HKLaundryRecordNewFormRHF
          formId={FORM_ID}
          units={units}
          rates={rates}
          onSubmit={handleCreate}
        />
      </AppDrawer>
    </AppShell>
  );
}