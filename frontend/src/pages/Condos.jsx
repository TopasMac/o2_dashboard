import React, { useEffect, useMemo, useState } from 'react';
import api from '../api';
import CondoContactsDrawer from '../components/drawers/CondoContactsDrawer';
import CondoNewDrawerForm from '../components/forms/CondoNew_DrawerForm';
import CondoEditDrawerForm from '../components/forms/CondoEdit_DrawerForm';
import { useIsMobile } from '../utils/breakpoints';
import '../components/layouts/Buttons.css';
import { HiMapPin } from 'react-icons/hi2';
import { IdentificationIcon, PencilSquareIcon, XMarkIcon, UserIcon, EnvelopeIcon, PhoneIcon, ChatBubbleLeftEllipsisIcon } from '@heroicons/react/24/outline';
import PageScaffold from '../components/layout/PageScaffold';
import TableLite from '../components/layout/TableLite';
import { Button, Stack } from '@mui/material';

const Condos = () => {
  const [condos, setCondos] = useState([]);
  const [quickCity, setQuickCity] = useState(null); // null | 'Playa' | 'Tulum'
  const [filterKey, setFilterKey] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedCondoId, setSelectedCondoId] = useState(null);
  const [selectedCondo, setSelectedCondo] = useState(null); // full row object for edit drawer
  const [drawerMode, setDrawerMode] = useState('edit'); // 'edit' | 'new' | 'contacts' | 'contactNew' | 'contactEdit'
  const [selectedContactId, setSelectedContactId] = useState(null);

  const [contacts, setContacts] = useState([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsError, setContactsError] = useState(null);

  const [units, setUnits] = useState([]);
  const [unitsLoading, setUnitsLoading] = useState(false);
  const [unitsError, setUnitsError] = useState(null);

  const [condoTab, setCondoTab] = useState('contacts'); // 'units' | 'contacts'

  const isMobile = useIsMobile();

  // Strip any residual ?focus=... parameter so navigation into Condos doesn’t persist it
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (url.searchParams.has('focus')) {
        url.searchParams.delete('focus');
        const next = `${url.pathname}${url.search}${url.hash}`;
        window.history.replaceState({}, '', next);
      }
    }
  }, []);

  // Centralized helpers for closing and refreshing
  const closeDrawer = () => {
    setDrawerOpen(false);
    setSelectedCondoId(null);
    setSelectedCondo(null);
    setSelectedContactId(null);
    setDrawerMode('edit');
    setCondoTab('contacts');
  };

  const closeAndRefresh = () => {
    closeDrawer();
    handleResetFilters();
  };

  const cityOptions = React.useMemo(
    () => Array.from(new Set((condos || []).map(c => c.city).filter(Boolean))).sort(),
    [condos]
  );
  const bankOptions = React.useMemo(
    () => Array.from(new Set((condos || []).map(c => c.hoaBank).filter(Boolean))).sort(),
    [condos]
  );

  const handleResetFilters = () => {
    api.get('/api/condos-list')
      .then(response => {
        console.log('API condos response:', response.data);
        const data = Array.isArray(response.data)
          ? response.data
          : response.data.member || [];
        data.sort((a, b) => a.condoName.localeCompare(b.condoName));
        setCondos(data);
        setFilterKey(prev => prev + 1);
      })
      .catch(error => {
        console.error('Error resetting condos:', error);
      });
  };

  useEffect(() => {
    api.get('/api/condos-list')
      .then(response => {
        console.log('API condos response:', response.data);
        const data = Array.isArray(response.data)
          ? response.data
          : response.data.member || [];
        data.sort((a, b) => a.condoName.localeCompare(b.condoName));
        setCondos(data);
      })
      .catch(error => {
        console.error('Error fetching condos:', error);
      });
  }, []);

  // Helper to reload contacts for the currently selected condo
  const reloadContacts = async () => {
    if (!selectedCondoId) return;
    setContactsLoading(true);
    setContactsError(null);
    try {
      const params = {
        condo: `/api/condos/${selectedCondoId}`,
        'order[department]': 'asc',
        'order[name]': 'asc',
      };
      const resp = await api.get('/api/condo_contacts', { params });
      const payload = Array.isArray(resp.data) ? resp.data : (resp.data['hydra:member'] || resp.data.member || []);
      setContacts(payload);
    } catch (err) {
      console.error('Error fetching condo contacts:', err);
      setContactsError('Could not load contacts.');
    } finally {
      setContactsLoading(false);
    }
  };

  useEffect(() => {
    const loadContacts = async () => {
      if (!drawerOpen || drawerMode !== 'contacts' || !selectedCondoId) return;
      await reloadContacts();
    };
    loadContacts();
  }, [drawerOpen, drawerMode, selectedCondoId]);

  useEffect(() => {
    const loadUnits = async () => {
      if (!drawerOpen || !selectedCondoId || (drawerMode !== 'contacts' && drawerMode !== 'contactNew')) return;
      setUnitsLoading(true);
      setUnitsError(null);
      try {
        // Active units for this condo (API Platform Unit collection)
        const params = {
          condo: `/api/condos/${selectedCondoId}`,
          status: 'Active',
          'order[unitName]': 'asc',
        };
        const resp = await api.get('/api/units', { params });
        let list = Array.isArray(resp.data) ? resp.data : (resp.data['hydra:member'] || resp.data.member || []);
        // Defensive: ensure condo association matches (handles different shapes)
        list = list.filter((u) => isUnitInCondo(u, selectedCondoId));
        setUnits(list);
      } catch (err) {
        console.error('Error fetching condo units:', err);
        setUnitsError('Could not load units.');
      } finally {
        setUnitsLoading(false);
      }
    };
    loadUnits();
  }, [drawerOpen, drawerMode, selectedCondoId]);

  const columns = [
    {
      header: 'Name',
      accessor: 'condoName',
      width: 200,
      minWidth: 200,
      maxWidth: 200,
      filterable: true,
      filterType: 'autocomplete',
      filterOptions: () => condos.map((c) => c.condoName).filter(Boolean).sort(),
      render: (_value, row) => {
        const cityRaw = row?.city || '';
        const cityLabel = cityRaw;

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            {/* Top row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minWidth: 0 }}>
              <button
                type="button"
                onClick={() => {
                  setSelectedCondoId(row.id);
                  setSelectedCondo(row);
                  setDrawerMode('edit');
                  setDrawerOpen(true);
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  color: '#0f766e',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  minWidth: 0,
                  flex: 1,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
                title={row?.condoName || ''}
              >
                {row?.condoName || '—'}
              </button>
              <button
                onClick={() => {
                  setSelectedCondoId(row.id);
                  setDrawerMode('contacts');
                  setCondoTab('contacts');
                  setDrawerOpen(true);
                }}
                title="View Contacts"
                style={{ cursor: 'pointer', background: 'transparent', border: 'none', padding: 0, flexShrink: 0 }}
              >
                <IdentificationIcon style={{ width: 16, height: 16, color: '#0f766e' }} />
              </button>
            </div>

            {/* Bottom row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 12,
                  color: '#6b7280',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  minWidth: 0,
                  flex: 1,
                }}
                title={cityLabel}
              >
                {cityLabel || ''}
              </div>
              {cityRaw ? (
                <HiMapPin size={14} color="#6b7280" title={cityRaw} />
              ) : null}
            </div>
          </div>
        );
      },
    },
    {
      header: 'Door Code',
      accessor: 'doorCode',
      headerStyle: { textAlign: 'center' },
      cellStyle: { textAlign: 'center' },
      render: (value, row) => row?.doorCode || value || '—',
      cell: row => (
        <span
          style={{
            display: 'inline-block',
            maxWidth: '80px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            textAlign: 'center',
            width: '100%',
          }}
        >
          {row.doorCode || ''}
        </span>
      )
    },
    {
      header: 'HOA Payments',
      accessor: 'hoaAccountName',
      width: 250,
      minWidth: 250,
      maxWidth: 250,
      headerStyle: { paddingRight: 0, paddingLeft: 0 },
      cellStyle: { paddingRight: '20px' },
      render: (_value, row) => {
        const acctRaw = row?.hoaAccountNr || '';
        const masked = (() => {
          if (!acctRaw) return '';
          const digits = String(acctRaw).replace(/\s+/g, '');
          if (!digits) return '';
          const tail = digits.slice(-3);
          return `*...${tail}`;
        })();
        return (
          <span
            style={{
              display: 'flex',
              flexDirection: 'column',
              lineHeight: 1.25,
              minWidth: 0,
              width: '100%',
              overflow: 'hidden',
            }}
          >
            <span
              style={{
                fontWeight: 600,
                minWidth: 0,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title={row?.hoaAccountName || ''}
            >
              {row?.hoaAccountName || '—'}
            </span>
            <span
              style={{
                fontSize: 12,
                color: '#6b7280',
                minWidth: 0,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title={`${row?.hoaBank || '—'}${masked ? ` • ${masked}` : ''}`}
            >
              {row?.hoaBank || '—'}{masked ? ` • ${masked}` : ''}
            </span>
          </span>
        );
      },
      filterable: false,
    },
    { header: 'Account Holder', accessor: 'hoaAccountName', render: (value, row) => row?.hoaAccountName || value || '—' },
    { header: 'Email', accessor: 'hoaEmail', width: 250, minWidth: 250, maxWidth: 250, render: (value, row) => row?.hoaEmail || value || '—' },
    {
      header: 'HOA Day',
      accessor: 'hoaDueDay',
      headerStyle: { textAlign: 'center' },
      cellStyle: { textAlign: 'center' },
      render: (value, row) => (
        <span style={{ display: 'inline-block', width: '100%', textAlign: 'center' }}>
          {row?.hoaDueDay || value || '—'}
        </span>
      ),
    },
    // Move Notes to the end
    { header: 'Notes', accessor: 'notes', render: (value, row) => row?.notes || value || '—' },
  ];

  const columnsMobile = [
    {
      header: 'Name',
      accessor: 'condoName',
      disableFilter: true,
      filterable: false,
      filterType: undefined,
      render: (_value, row) => (
        <button
          type="button"
          onClick={() => {
            setSelectedCondoId(row.id);
            setSelectedCondo(row);
            setDrawerMode('edit');
            setDrawerOpen(true);
          }}
          style={{ background: 'transparent', border: 'none', padding: 0, color: '#0f766e', fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}
        >
          {row.condoName}
        </button>
      )
    },
    {
      header: 'Contacts',
      accessor: 'contacts',
      disableFilter: true,
      render: (_value, row) => (
        <button
          onClick={() => {
            setSelectedCondoId(row.id);
            setDrawerMode('contacts');
            setCondoTab('contacts');
            setDrawerOpen(true);
          }}
          title="View Contacts"
          style={{ cursor: 'pointer', background: 'transparent', border: 'none', padding: 4 }}
        >
          <IdentificationIcon style={{ width: 18, height: 18, color: '#0f766e' }} />
        </button>
      )
    },
  ];

  const filteredCondos = React.useMemo(() => {
    if (!quickCity) return condos;
    const needle = quickCity.toLowerCase();
    return (condos || []).filter(c => (c.city || '').toLowerCase().includes(needle));
  }, [condos, quickCity]);

  const toTel = (s) => (s || '').replace(/\s+/g, '');

  const unitLabel = (u) => u?.unitName || u?.name || u?.unit_name || `Unit #${u?.id}`;

  const selectedCondoName = useMemo(() => {
    if (!selectedCondoId) return '';
    const c = (condos || []).find((x) => String(x.id) === String(selectedCondoId));
    return c?.condoName || '';
  }, [condos, selectedCondoId]);

  const isUnitInCondo = (u, condoId) => {
    if (!u) return false;
    // Common shapes: IRI string, embedded object, or raw id
    if (typeof u.condo === 'string') {
      return u.condo.endsWith(`/api/condos/${condoId}`);
    }
    if (u.condo && typeof u.condo === 'object' && (u.condo.id || u.condo['@id'])) {
      const id = u.condo.id || (u.condo['@id'] ? u.condo['@id'].split('/').pop() : null);
      return String(id) === String(condoId);
    }
    if (u.condoName && typeof u.condoName === 'object' && (u.condoName.id || u.condoName['@id'])) {
      const id = u.condoName.id || (u.condoName['@id'] ? u.condoName['@id'].split('/').pop() : null);
      return String(id) === String(condoId);
    }
    if (u.condoId != null) return String(u.condoId) === String(condoId);
    if (u.condo_id != null) return String(u.condo_id) === String(condoId);
    return false;
  };

  const groupContactsByDepartment = (list) => {
    const map = new Map();
    (list || []).forEach((c) => {
      const dept = c.department || '—';
      if (!map.has(dept)) map.set(dept, []);
      map.get(dept).push(c);
    });
    // sort each group by name
    map.forEach(arr => arr.sort((a, b) => (a.name || '').localeCompare(b.name || '')));
    // return as array of [dept, contacts[]]
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  };

  const handleDeleteContact = async (contactId) => {
    if (!contactId) return;
    const ok = window.confirm('Delete this contact?');
    if (!ok) return;
    try {
      await api.delete(`/api/condo_contacts/${contactId}`);
      setContacts((prev) => prev.filter((c) => c.id !== contactId));
    } catch (e) {
      console.error('Failed to delete contact', e);
      alert('Could not delete contact.');
    }
  };

  return (
    <PageScaffold
      title="Condos"
      sectionKey="management"
      currentPath="/condos"
      layout="table"
      stickyHeader={
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
          <Button
            variant="contained"
            onClick={() => {
              setDrawerMode('new');
              setSelectedCondoId(null);
              setCondoTab('contacts');
              setDrawerOpen(true);
            }}
          >
            + Add Condo
          </Button>
          <Button
            variant="outlined"
            onClick={() => {
              setQuickCity(null);
              handleResetFilters();
            }}
          >
            Clear Filters
          </Button>
        </Stack>
      }
      contentPadding={isMobile ? 12 : 20}
    >
      {isMobile && (
        <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
          <Button variant={quickCity === 'Playa' ? 'contained' : 'outlined'} onClick={() => setQuickCity(quickCity === 'Playa' ? null : 'Playa')}>
            Playa
          </Button>
          <Button variant={quickCity === 'Tulum' ? 'contained' : 'outlined'} onClick={() => setQuickCity(quickCity === 'Tulum' ? null : 'Tulum')}>
            Tulum
          </Button>
          <Button variant="outlined" onClick={() => { setQuickCity(null); handleResetFilters(); }}>
            Reset
          </Button>
        </Stack>
      )}
      <TableLite
        key={filterKey}
        columns={isMobile ? columnsMobile : columns}
        rows={filteredCondos}
        loading={false}
        enableFilters={!isMobile}
        defaultStringTransform={null}
      />
      <CondoNewDrawerForm
        open={drawerOpen && drawerMode === 'new'}
        onClose={closeDrawer}
        onCreated={() => {
          // refresh list after creating a condo
          handleResetFilters();
        }}
      />
      <CondoEditDrawerForm
        open={drawerOpen && drawerMode === 'edit'}
        onClose={closeDrawer}
        condo={selectedCondo}
        onUpdated={() => {
          // refresh list after editing
          handleResetFilters();
        }}
      />
      <CondoContactsDrawer
        open={drawerOpen && drawerMode === 'contacts'}
        onClose={closeDrawer}
        condoName={selectedCondoName}
        condoId={selectedCondoId}
        condoIri={selectedCondoId ? `/api/condos/${selectedCondoId}` : null}
        onContactCreated={async () => {
          // After create, refresh the list so the new contact appears
          try { await reloadContacts(); } catch {}
        }}
        activeUnits={units}
        contacts={contacts}
      >
        {/* body intentionally empty for now */}
      </CondoContactsDrawer>
    </PageScaffold>
  );
};

export default Condos;
