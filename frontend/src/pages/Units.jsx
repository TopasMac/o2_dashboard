import React from 'react';
import api from '../api';
import AppDrawer from '../components/common/AppDrawer';
import UnitNewFormRHF from '../components/forms/UnitNewFormRHF';
import UnitEditFormRHF from '../components/forms/UnitEditFormRHF';
import { toast } from 'react-toastify';
import { ListBulletIcon, ArrowPathIcon } from '@heroicons/react/24/solid';
import UnitDetails from './UnitDetails';
import TableLite from '../components/layout/TableLite';
import PageScaffold from '../components/layout/PageScaffold';
import { Button, Stack, Box } from '@mui/material';

const INITIAL_FILTERS = {
  unitName: '',
  clientName: '',
  status: '',
  type: '',
  city: '',
  condoName: '',
  listingName: '',
  hostType: '',
  paymentType: '',
  hoa: null,
  cfe: null,
  internet: null,
  water: null,
};

const BOOLEAN_FILTER_KEYS = new Set(['hoa', 'cfe', 'internet', 'water']);

const Units = () => {
  const [isAddOpen, setIsAddOpen] = React.useState(false);
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = React.useState(false);
  const [selectedUnitId, setSelectedUnitId] = React.useState(null);
  // Raw rows from API (already filtered server-side for most filters)
  const [rows, setRows] = React.useState([]);
  const [filterValues, setFilterValues] = React.useState({ ...INITIAL_FILTERS });
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  // Fetch rows from new fast endpoint -- reusable
  const fetchRows = React.useCallback((params = null) => {
    setLoading(true);
    setError(null);
    api
      .get('/api/unit-list', params ? { params } : undefined)
      .then(({ data }) => {
        const list = Array.isArray(data) ? data : data.rows || data.items || [];
        const normalized = (list || []).map((u) => ({
          id: u.id,
          unitName: u.unit_name || '',
          clientName: u.client_name || '',
          status: u.status || '',
          city: u.city || '',
          type: u.type || '',
          condoName: u.condo_name || '',
          listingName: u.listing_name || '',
          hostType: u.host_type || '',
          paymentType: u.payment_type || '',
          cleaningFee: u.cleaning_fee ?? null,
          linensFee: u.linens_fee ?? null,
          hoa: !!u.hoa,
          cfe: !!u.cfe,
          internet: !!u.internet,
          water: !!u.water,
          privateIcalEnabled: !!u.private_ical_enabled,
        }));
        setRows(
          normalized.sort((a, b) =>
            (a.unitName || '').localeCompare(b.unitName || '', undefined, { sensitivity: 'base' })
          )
        );
        setLoading(false);
      })
      .catch((err) => {
        console.error('Error fetching /api/unit-list', err);
        setError('Failed to load units');
        setLoading(false);
      });
  }, []);

  React.useEffect(() => { fetchRows(); }, [fetchRows]);
  // Handler for successful new unit creation
  const handleNewUnitSuccess = React.useCallback(() => {
    toast.success('New Unit Created!');
    setIsAddOpen(false);
    fetchRows();
  }, [fetchRows]);

  const handleEditUnitSuccess = React.useCallback(() => {
    toast.success('Unit updated!');
    setIsEditOpen(false);
    fetchRows();
  }, [fetchRows]);

  // Build select options from current data
  const selectOptions = React.useMemo(() => {
    const pick = (k) => Array.from(new Set((rows||[]).map(r => (r[k]??'').toString()).filter(Boolean)))
      .sort((a,b) => a.localeCompare(b, undefined, {sensitivity:'base'}));
    return {
      status: pick('status'),
      type: pick('type'),
      city: pick('city'),
      hostType: pick('hostType'),
      paymentType: pick('paymentType'),
    };
  }, [rows]);

  // Columns — legacy filter API to match other working pages
  const columns = React.useMemo(() => [
    {
      header: 'Unit',
      accessor: 'unitName',
      width: 220,
      minWidth: 220,
      maxWidth: 220,
      filter: { type: 'text', inline: true, placeholder: 'Unit' },
      render: (_value, u) => {
        const cityLabel = u.city === 'Playa del Carmen' ? 'Playa' : (u.city || '—');
        return (
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ListBulletIcon
              className="unit-details-icon"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedUnitId(u.id);
                setIsDetailsOpen(true);
              }}
            />
            <ArrowPathIcon
              style={{
                width: 16,
                height: 16,
                color: u.privateIcalEnabled ? '#0d9488' : '#9ca3af',
                marginRight: 6,
                cursor: 'default'
              }}
            />
            <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
              <span
                className="unit-link"
                onClick={() => { setSelectedUnitId(u.id); setIsEditOpen(true); }}
              >
                {u.unitName}
              </span>
              <span style={{ fontSize: 12, color: '#6b7280', display: 'flex', gap: 4 }}>
                <span
                  style={{ color: '#0f766e', cursor: 'pointer' }}
                  onClick={() => setFilterValues((prev) => ({ ...prev, city: u.city || '' }))}
                >
                  {cityLabel}
                </span>
                {u.condoName ? (
                  <>
                    <span>•</span>
                    <a
                      href={`/condos?focus=${encodeURIComponent(u.condoName)}`}
                      style={{ color: '#0f766e', textDecoration: 'none' }}
                    >
                      {u.condoName}
                    </a>
                  </>
                ) : null}
              </span>
            </span>
          </span>
        );
      }
    },
    { header: 'Client', accessor: 'clientName', width: 200, minWidth: 200, maxWidth: 200, filter: { type: 'text', inline: true, placeholder: 'Client' } },
    {
      header: 'Status',
      accessor: 'status',
      width: 120,
      filter: {
        type: 'select',
        inline: true,
        options: ['', 'Inactive', 'Onboarding', 'All'],
        placeholder: 'Status',
      },
      // keep rendering the row's status as-is
    },
    { header: 'Type', accessor: 'type', width: 120, filter: { type: 'select', inline: true, options: selectOptions.type } },
    {
      header: 'Listing Name',
      accessor: 'listingName',
      width: 220,
      filter: { type: 'text', inline: true, placeholder: 'Listing' },
      render: (_value, u) => (
        <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
          <span
            style={{
              display: 'block',
              maxWidth: '100%',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            title={u.listingName || ''}
          >
            {u.listingName || '—'}
          </span>
          {u.hostType && (
            <span
              style={{ fontSize: 12, color: '#0f766e', cursor: 'pointer' }}
              onClick={() => setFilterValues((prev) => ({ ...prev, hostType: u.hostType }))}
            >
              {u.hostType}
            </span>
          )}
        </span>
      ),
    },
    { header: 'Payment', accessor: 'paymentType', width: 140, filter: { type: 'select', inline: true, options: selectOptions.paymentType } },
    {
      header: 'Services',
      accessor: 'services',
      width: 200,
      filter: {
        type: 'autocomplete',
        inline: true,
        options: ['CFE', 'Internet', 'Water', 'HOA'],
        placeholder: 'Service',
      },
      render: (_value, u) => {
        const items = [];
        if (u.cfe) items.push('CFE');
        if (u.internet) items.push('Internet');
        if (u.water) items.push('Water');
        if (u.hoa) items.push('HOA');
        const rows = [];
        for (let i = 0; i < items.length; i += 2) {
          rows.push(items.slice(i, i + 2));
        }
        return (
          <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
            {rows.length ? rows.map((row, idx) => (
              <span key={idx} style={{ fontSize: 12, color: '#6b7280' }}>
                {row.join(' • ')}
              </span>
            )) : (
              <span style={{ fontSize: 12, color: '#6b7280' }}>—</span>
            )}
          </span>
        );
      },
    },
  ], [selectOptions]);
  const handleClearFilters = () => setFilterValues({ ...INITIAL_FILTERS });

  const stickyHeader = (
    <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
      <Button variant="contained" onClick={() => setIsAddOpen(true)}>
        + Add Unit
      </Button>
      <Button variant="outlined" onClick={handleClearFilters}>
        Clear Filters
      </Button>
    </Stack>
  );

  return (
    <PageScaffold
      title="Units"
      sectionKey="management"
      currentPath="/units"
      layout="table"
      stickyHeader={stickyHeader}
    >
      <div className="units-page">

      <AppDrawer
        open={isAddOpen}
        title="Create New Unit"
        formId="unit-new-form"
        onClose={() => setIsAddOpen(false)}
        showActions
      >
        <UnitNewFormRHF onSuccess={handleNewUnitSuccess} />
      </AppDrawer>

      <AppDrawer
        open={isEditOpen}
        title={`Edit ${rows.find(r => r.id === selectedUnitId)?.unitName || 'Unit'}`}
        formId="unit-edit-form"
        onClose={() => setIsEditOpen(false)}
        showActions
      >
        {selectedUnitId && (
          <UnitEditFormRHF unitId={selectedUnitId} onSuccess={handleEditUnitSuccess} />
        )}
      </AppDrawer>

      <AppDrawer
        open={isDetailsOpen}
        title={`Details ${rows.find(r => r.id === selectedUnitId)?.unitName || 'Unit'}`}
        onClose={() => setIsDetailsOpen(false)}
      >
        {selectedUnitId && (
          <UnitDetails unitId={selectedUnitId} />
        )}
      </AppDrawer>

      <style>{`
        .units-page .unit-link {
          color: var(--o2-teal, #0d9488);
          cursor: pointer;
          font-weight: 600;
          text-decoration: none;
          border: none;
          background: transparent;
          padding: 0;
        }
        .units-page .unit-link:hover {
          color: var(--o2-orange, #f97316);
          text-decoration: underline;
        }
        .unit-details-icon {
          width: 18px;
          height: 18px;
          color: var(--o2-teal, #0d9488);
          cursor: pointer;
        }
        .unit-details-icon:hover {
          color: var(--o2-orange, #f97316);
        }
      `}</style>

      <Box sx={{ flex: 1, minHeight: 0, mt: 2 }}>
        <TableLite
          columns={columns}
          rows={rows}
          loading={loading}
          error={error}
          enableFilters
          filterValues={filterValues}
          onFilterChange={(key, value) => {
            const nextValue = value === '' || value === null ? (BOOLEAN_FILTER_KEYS.has(key) ? null : '') : value;

            setFilterValues((prev) => ({
              ...prev,
              [key]: nextValue,
            }));

            // Server-side lifecycle fetch for status filter
            if (key === 'status') {
              const v = (nextValue || '').toString();
              if (v === '' || v === 'Active') {
                fetchRows(null); // backend defaults to active
              } else if (v === 'Inactive') {
                fetchRows({ lifecycle: 'inactive' });
              } else if (v === 'Onboarding') {
                fetchRows({ lifecycle: 'onboarding' });
              } else if (v === 'All') {
                fetchRows({ lifecycle: 'all' });
              }
            }
          }}
          optionsSourceRows={rows}
          defaultStringTransform={null}
        />
      </Box>
      </div>
    </PageScaffold>
  );
};

export default Units;
