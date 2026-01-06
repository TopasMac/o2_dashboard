import React from 'react';
import api from '../../api';
import { useForm, FormProvider } from 'react-hook-form';
import {
  RHFTextField,
  RHFSelect,
  RHFAutocomplete,
  RHFDatePicker,
} from '../forms/rhf/RHFForm';
import { widthMap } from '../forms/rhf/widthMap';

/**
 * UnitEditFormRHF
 * Props:
 *  - unitId (required): number | string
 *  - initialValues?: object (optional seed)
 *  - onSuccess?: () => void
 */
export default function UnitEditFormRHF({ unitId, initialValues, onSuccess }) {
  const [loading, setLoading] = React.useState(!initialValues);
  const [clientOpts, setClientOpts] = React.useState([]);
  const [condoOpts, setCondoOpts] = React.useState([]);

  const defaults = React.useMemo(() => ({
    unit_name: '',
    listing_name: '',
    airbnb_ical: '',
    host_type: 'Host',
    payment_type: 'OWNERS2',
    cleaning_fee: '',
    linens_fee: '',
    status: 'Active',
    client_name: '',
    client_id: null,
    cc_email: '',
    date_started: '',
    type: '',
    city: '',
    condo_name: '',
    condo_id: null,
    // Optional/extended fields
    unit_number: '',
    unit_floor: '',
    access_type: '',
    access_code: '',
    backup_lockbox: '',
    building_code: '',
    wifi_name: '',
    wifi_password: '',
    airbnb_email: '',
    airbnb_pass: '',
    airbnb_id: '',
    notes: '',
    seo_short_description: '',
    pax: '',
    beds: '',
    bed_config: [],
    baths: '',
    parking: '',
    // New Airbnb payment route field
    airbnb_pay_route: '',
    // iCal export fields
    ical_export_token: '',
    private_ical_enabled: false,
    // Services
    cfe_reference: '',
    cfe_name: '',
    cfe_period: '',
    cfe_payment_day: '',
    cfe_starting_month: '',
    internet_isp: '',
    internet_reference: '',
    internet_cost: '',
    internet_deadline: '',
    water_reference: '',
    water_deadline: '',
    hoa_amount: '',
    // Service flags (0/1)
    cfe: 0,
    internet: 0,
    water: 0,
    hoa: 0,
  }), []);

  const [values, setValues] = React.useState(initialValues || defaults);

  // Set up React Hook Form context directly
  const methods = useForm({ defaultValues: values });
  const { handleSubmit, reset } = methods;
  // Determine if current user is admin.
  // Prefer roles from saved user object; if absent, decode roles from JWT token.
  const token = (typeof window !== 'undefined') ? localStorage.getItem('token') : null;
  const authUser = React.useMemo(() => {
    try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
  }, []);
  const jwtPayload = React.useMemo(() => {
    try {
      if (!token) return null;
      const base64Url = token.split('.')[1];
      if (!base64Url) return null;
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(c =>
        '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
      ).join(''));
      return JSON.parse(jsonPayload);
    } catch {
      return null;
    }
  }, [token]);
  const roles = Array.isArray(authUser?.roles) ? authUser.roles : (Array.isArray(jwtPayload?.roles) ? jwtPayload.roles : []);
  const isAdmin = roles.includes('ROLE_ADMIN');
  const hostType = methods.watch('host_type');
  const paymentType = methods.watch('payment_type');
  const privateIcalEnabled = !!methods.watch('private_ical_enabled');

  // Bed config editor (array of { type, count })
  const bedConfig = methods.watch('bed_config') || [];

  const bedTypeOptions = [
    { value: 'king', label: 'King' },
    { value: 'queen', label: 'Queen' },
    { value: 'double', label: 'Double' },
    { value: 'single', label: 'Single' },
    { value: 'bunk', label: 'Bunk' },
    { value: 'sofa_bed', label: 'Sofa bed' },
    { value: 'crib', label: 'Crib' },
    { value: 'air_mattress', label: 'Air mattress' },
  ];

  const normalizeBedConfig = (rows) => {
    if (!Array.isArray(rows)) return [];
    const out = [];
    for (const r of rows) {
      if (!r || typeof r !== 'object') {
        out.push({ type: '', count: 1 });
        continue;
      }
      const type = String(r.type ?? '').trim();
      out.push({ type, count: 1 });
    }
    return out;
  };

  const setBedConfig = (nextRows) => {
    const normalized = normalizeBedConfig(nextRows);
    methods.setValue('bed_config', normalized, { shouldDirty: true, shouldValidate: true });
    // Keep local `values` in sync so reset(values) doesn't wipe edits during this session
    setValues((v) => ({ ...v, bed_config: normalized }));
  };

  const setBedsFromRows = (rows) => {
    const len = Array.isArray(rows) ? rows.length : 0;
    methods.setValue('beds', len > 0 ? len : '', { shouldDirty: true, shouldValidate: true });
    setValues((v) => ({ ...v, beds: len > 0 ? len : '' }));
  };

  const addBedRow = () => {
    const current = Array.isArray(methods.getValues('bed_config')) ? methods.getValues('bed_config') : [];
    const next = [...normalizeBedConfig(current), { type: '', count: 1 }];
    methods.setValue('bed_config', next, { shouldDirty: true, shouldValidate: true });
    setValues((v) => ({ ...v, bed_config: next }));
    setBedsFromRows(next);
  };

  const removeBedRow = (idx) => {
    const current = Array.isArray(methods.getValues('bed_config')) ? methods.getValues('bed_config') : [];
    const normalized = normalizeBedConfig(current);
    const next = normalized.filter((_, i) => i !== idx);
    methods.setValue('bed_config', next, { shouldDirty: true, shouldValidate: true });
    setValues((v) => ({ ...v, bed_config: next }));
    setBedsFromRows(next);
  };


  const updateBedRow = (idx, patch) => {
    const current = Array.isArray(bedConfig) ? bedConfig : [];
    const next = current.map((r, i) => (i === idx ? { ...(r || {}), ...(patch || {}) } : r));
    setBedConfig(next);
  };


  // Keep bed_config rows in sync with the Beds field (1 row per bed)
  React.useEffect(() => {
    const bedsRaw = methods.getValues('beds');
    const bedsInt = (bedsRaw === '' || bedsRaw === null || typeof bedsRaw === 'undefined') ? 0 : parseInt(bedsRaw, 10);
    const n = Number.isFinite(bedsInt) && bedsInt > 0 ? bedsInt : 0;

    const current = Array.isArray(methods.getValues('bed_config')) ? methods.getValues('bed_config') : [];
    const normalized = normalizeBedConfig(current);

    if (n === 0) {
      // If user clears Beds, keep config but do not force rows.
      return;
    }

    if (normalized.length === n) {
      return;
    }

    let next = normalized;
    if (normalized.length > n) {
      next = normalized.slice(0, n);
    } else {
      const missing = n - normalized.length;
      const fillers = Array.from({ length: missing }).map(() => ({ type: '', count: 1 }));
      next = [...normalized, ...fillers];
    }

    // Only set if actually changed
    methods.setValue('bed_config', next, { shouldDirty: true, shouldValidate: true });
    setValues((v) => ({ ...v, bed_config: next }));
  }, [methods.watch('beds')]);
  React.useEffect(() => { reset(values); }, [values, reset]);

  // Keep Beds synced to the number of bed_config rows (and also auto-fill when API returns beds=0)
  React.useEffect(() => {
    const currentCfg = methods.getValues('bed_config');
    const cfgLen = Array.isArray(currentCfg) ? currentCfg.length : 0;
    const bedsRaw = methods.getValues('beds');
    const bedsInt = (bedsRaw === '' || bedsRaw === null || typeof bedsRaw === 'undefined') ? 0 : parseInt(bedsRaw, 10);

    // If rows exist and Beds differs (or is 0), align Beds to cfgLen
    if (cfgLen > 0 && (!Number.isFinite(bedsInt) || bedsInt !== cfgLen)) {
      methods.setValue('beds', cfgLen, { shouldDirty: true, shouldValidate: true });
      setValues((v) => ({ ...v, beds: cfgLen }));
    }

    // If no rows, allow Beds to be user-controlled (do not force)
  }, [methods.watch('bed_config')]);

  // Helper for robust boolean conversion (for private_ical_enabled API field)
  const asBool = (v) => v === true || v === 1 || v === '1' || v === 'true';

  React.useEffect(() => {
    if (!initialValues && unitId) {
      setLoading(true);
      api.get(`/api/unit-details/${unitId}`)
        .then(({ data }) => {
          const u = data || {};
          // Helper to extract client id from IRI string
          const clientIdFromIri = (typeof u.client === 'string') ? parseInt(u.client.split('/').pop(), 10) : null;
          setValues({
            ...defaults,
            unit_name: u.unit_name || u.unitName || '',
            listing_name: u.listing_name || u.listingName || '',
            airbnb_ical: u.airbnb_ical || u.airbnbIcal || '',
            host_type: u.host_type || u.hostType || 'Host',
            payment_type: u.payment_type || u.paymentType || 'OWNERS2',
            cleaning_fee: (u.cleaning_fee ?? u.cleaningFee) ?? '',
            linens_fee: (u.linens_fee ?? u.linensFee) ?? '',
            status: u.status || 'Active',
            client_name: u.client_name || u.clientName || '',
            client_id: (u.client_id ?? u.clientId ?? clientIdFromIri) ?? null,
            cc_email: u.cc_email || u.ccEmail || '',
            date_started: u.date_started || u.dateStarted || '',
            type: u.type || '',
            city: u.city || '',
            pax: (u.pax ?? ''),
            baths: (u.baths ?? ''),    
            bed_config: (u.bed_config ?? u.bedConfig ?? []),
            beds: (() => {
              const cfg = (u.bed_config ?? u.bedConfig);
              const cfgLen = Array.isArray(cfg) ? cfg.length : 0;
              const bedsRaw = (typeof u.beds !== 'undefined') ? u.beds : (u.beds ?? '');
              const bedsInt = (bedsRaw === '' || bedsRaw === null) ? null : parseInt(bedsRaw, 10);

              // If API has bed_config rows, prefer that count when beds is missing or 0
              if (cfgLen > 0 && (!Number.isFinite(bedsInt) || bedsInt <= 0)) {
                return cfgLen;
              }

              return (bedsRaw ?? '');
            })(),
            parking: (u.parking || ''),
            condo_name: u.condo_name || u.condoName || (u.condo && u.condo.condoName) || '',
            condo_id: (u.condo_id ?? u.condoId ?? (u.condo && u.condo.id)) ?? null,
            unit_number: u.unit_number || u.unitNumber || '',
            unit_floor: u.unit_floor || u.unitFloor || '',
            access_type: u.access_type || u.accessType || '',
            access_code: u.access_code || u.accessCode || '',
            backup_lockbox: u.backup_lockbox || u.backupLockbox || '',
            building_code: u.door_code || u.doorCode || '',
            wifi_name: u.wifi_name || u.wifiName || '',
            wifi_password: u.wifi_password || u.wifiPassword || '',
            airbnb_email: u.airbnb_email || u.airbnbEmail || '',
            airbnb_pass: u.airbnb_pass || u.airbnbPass || '',
            airbnb_id: u.airbnb_id || u.airbnbId || '',
            // iCal export fields
            ical_export_token: u.ical_export_token || u.icalExportToken || '',
            private_ical_enabled: asBool(
              (typeof u.private_ical_enabled !== 'undefined') ? u.private_ical_enabled
                : (typeof u.privateIcalEnabled !== 'undefined') ? u.privateIcalEnabled
                : false
            ),
            notes: u.notes || '',
            seo_short_description: u.seo_short_description || u.seoShortDescription || '',
            // New Airbnb payment route field mapping
            airbnb_pay_route: u.airbnb_pay_route || u.airbnbPayRoute || '',
            // Services
            cfe_reference: u.cfe_reference || u.cfeReference || '',
            cfe_name: u.cfe_name || u.cfeName || '',
            cfe_period: u.cfe_period || u.cfePeriod || '',
            cfe_payment_day: (u.cfe_payment_day ?? u.cfePaymentDay) ?? '',
            cfe_starting_month: u.cfe_starting_month || u.cfeStartingMonth || '',
            internet_isp: u.internet_isp || u.internetIsp || '',
            internet_reference: u.internet_reference || u.internetReference || '',
            internet_cost: (u.internet_cost ?? u.internetCost) ?? '',
            internet_deadline: (u.internet_deadline ?? u.internetDeadline ?? u.internetDeadLine) ?? '',
            water_reference: u.water_reference || u.waterReference || '',
            water_deadline: (u.water_deadline ?? u.waterDeadline ?? u.waterDeadLine) ?? '',
            hoa_amount: (u.hoa_amount ?? u.hoaAmount) ?? '',
            // Service flags (1/0)
            cfe: (u.cfe ?? u.hasCfe) ? 1 : 0,
            internet: (u.internet ?? u.hasInternet) ? 1 : 0,
            water: (u.water ?? u.hasWater) ? 1 : 0,
            hoa: (u.hoa ?? u.hasHoa) ? 1 : 0,
          });

          setServicesEnabled({
            cfe: !!(u.cfe ?? u.hasCfe),
            internet: !!(u.internet ?? u.hasInternet),
            water: !!(u.water ?? u.hasWater),
            hoa: !!(u.hoa ?? u.hasHoa),
          });
        })
        .finally(() => setLoading(false));
    }
  }, [unitId, initialValues, defaults]);

  // Watch paymentType and set airbnb_pay_route to "Client" if paymentType is CLIENT
  React.useEffect(() => {
    if (paymentType === 'CLIENT') {
      const curr = methods.getValues('airbnb_pay_route');
      if (curr !== 'Client') {
        methods.setValue('airbnb_pay_route', 'Client', { shouldDirty: true, shouldValidate: true });
      }
    }
  }, [paymentType, methods]);

  // Watchers for autocompletes
  const [clientName, setClientName] = React.useState(values.client_name || '');
  const [condoName, setCondoName] = React.useState(values.condo_name || '');
  const [clientHasTyped, setClientHasTyped] = React.useState(false);
  const [condoHasTyped, setCondoHasTyped] = React.useState(false);

  React.useEffect(() => { setClientName(values.client_name || ''); }, [values.client_name]);
  React.useEffect(() => { setCondoName(values.condo_name || ''); }, [values.condo_name]);

  // Initial load: fetch a base list of clients so the autocomplete has options on open
  React.useEffect(() => {
    let cancelled = false;
    api.get('/api/clients')
      .then(({ data }) => {
        if (cancelled) return;
        const rows = Array.isArray(data) ? data : (data['hydra:member'] || data.items || data.rows || []);
        setClientOpts(rows);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Initial load: fetch a base list of condos so the autocomplete has options on open
  React.useEffect(() => {
    let cancelled = false;
    api.get('/api/condos')
      .then(({ data }) => {
        if (cancelled) return;
        const rows = Array.isArray(data) ? data : (data['hydra:member'] || data.items || data.rows || []);
        setCondoOpts(rows);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Ensure current condo appears in the options list without typing
  React.useEffect(() => {
    if (condoHasTyped) return; // only inject on initial load / when user hasn't typed
    const id = values.condo_id ?? null;
    const label = values.condo_name ?? '';
    if (!id || !label) return;
    setCondoOpts((opts) => {
      const exists = opts.some((o) => (o?.id || null) === id);
      return exists ? opts : [{ id, condoName: label }, ...opts];
    });
  }, [values.condo_id, values.condo_name, condoHasTyped]);

  // Fetch options only when typing (q.length >= 1) and user has typed
  React.useEffect(() => {
    const q = (clientName || '').trim();
    if (!clientHasTyped || q.length < 1) { return; }
    let cancelled = false;
    api.get('/api/clients', { params: { q }})
      .then(({ data }) => {
        if (!cancelled) {
          setClientOpts(Array.isArray(data) ? data : (data['hydra:member'] || data.items || data.rows || []));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [clientName, clientHasTyped]);

  React.useEffect(() => {
    const q = (condoName || '').trim();
    if (!condoHasTyped || q.length < 1) { return; }
    let cancelled = false;
    api.get('/api/condos', { params: { q }})
      .then(({ data }) => {
        if (!cancelled) {
          setCondoOpts(Array.isArray(data) ? data : (data['hydra:member'] || data.items || data.rows || []));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [condoName, condoHasTyped]);

  const onSubmit = async (formValues) => {
    const toNullNum = (v) => (v === '' || v === null || typeof v === 'undefined') ? null : Number(v);
    const toNullInt = (v) => (v === '' || v === null || typeof v === 'undefined') ? null : parseInt(v, 10);
    const payload = {
      unit_name: (formValues.unit_name || '').trim(),
      listing_name: formValues.listing_name || '',
      airbnb_ical: formValues.airbnb_ical || '',
      host_type: formValues.host_type || '',
      payment_type: (formValues.payment_type || '').toUpperCase(),
      cleaning_fee: toNullNum(formValues.cleaning_fee),
      linens_fee: toNullNum(formValues.linens_fee),
      status: formValues.status || '',
      client_id: formValues.client_id ? Number(formValues.client_id) : null,
      cc_email: (formValues.cc_email || '').trim(),
      date_started: formValues.date_started || null,
      type: formValues.type || '',
      city: formValues.city || '',
      pax: toNullInt(formValues.pax),
      baths: toNullInt(formValues.baths),
      beds: toNullInt(formValues.beds),
      bed_config: Array.isArray(formValues.bed_config) ? formValues.bed_config : null,
      parking: formValues.parking || '',
      condo_id: formValues.condo_id ? Number(formValues.condo_id) : null,
      // Service flags 1/0
      cfe: servicesEnabled.cfe ? 1 : 0,
      internet: servicesEnabled.internet ? 1 : 0,
      water: servicesEnabled.water ? 1 : 0,
      hoa: servicesEnabled.hoa ? 1 : 0,
      // Extended
      unit_number: formValues.unit_number || '',
      unit_floor: formValues.unit_floor || '',
      access_type: formValues.access_type || '',
      access_code: formValues.access_code || '',
      backup_lockbox: formValues.backup_lockbox || '',
      wifi_name: formValues.wifi_name || '',
      wifi_password: formValues.wifi_password || '',
      airbnb_email: formValues.airbnb_email || '',
      airbnb_pass: formValues.airbnb_pass || '',
      airbnb_id: formValues.airbnb_id || '',
      notes: formValues.notes || '',
      seo_short_description: formValues.seo_short_description || '',
      // New Airbnb payment route field
      airbnb_pay_route: formValues.airbnb_pay_route || '',
      private_ical_enabled: !!formValues.private_ical_enabled,
      // Services
      cfe_reference: formValues.cfe_reference || '',
      cfe_name: formValues.cfe_name || '',
      cfe_period: formValues.cfe_period || '',
      cfe_payment_day: toNullInt(formValues.cfe_payment_day),
      cfe_starting_month: formValues.cfe_starting_month || '',
      internet_isp: formValues.internet_isp || '',
      internet_reference: formValues.internet_reference || '',
      internet_cost: toNullNum(formValues.internet_cost),
      internet_deadline: toNullInt(formValues.internet_deadline),
      water_reference: formValues.water_reference || '',
      water_deadline: toNullInt(formValues.water_deadline),
      hoa_amount: toNullNum(formValues.hoa_amount),
    };

    if (!isAdmin) {
      delete payload.airbnb_pay_route;
    }

    try {
      await api.patch(`/api/units/${unitId}`, payload);
      if (onSuccess) onSuccess();
    } catch (err) {
      console.error('Failed to update unit', err);
      alert('Failed to update unit. Please check the fields and try again.');
    }
  };

  // Accordion state for sections (must be declared before any conditional returns)
  const [openSection, setOpenSection] = React.useState('basic');
  const onOpen = (key) => (e) => { e.preventDefault(); setOpenSection(key); };

  // Auto-scroll opened section into view
  React.useEffect(() => {
    if (!openSection) return;
    const el = document.getElementById(`section-${openSection}`);
    if (el && typeof el.scrollIntoView === 'function') {
      // Wait for details content to expand before scrolling
      setTimeout(() => {
        try {
          el.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
        } catch {
          el.scrollIntoView(true);
        }
      }, 0);
    }
  }, [openSection]);

  // Service checkboxes and accordion state
  const [servicesEnabled, setServicesEnabled] = React.useState({ cfe: false, internet: false, water: false, hoa: false });
  const [openService, setOpenService] = React.useState(null); // 'cfe' | 'internet' | 'water' | 'hoa' | null
  React.useEffect(() => {
    setServicesEnabled({
      cfe: !!values.cfe,
      internet: !!values.internet,
      water: !!values.water,
      hoa: !!values.hoa,
    });
  }, [values.cfe, values.internet, values.water, values.hoa]);

  const toggleServiceEnabled = (key) => (e) => {
    const checked = e.target.checked;
    setServicesEnabled((prev) => ({ ...prev, [key]: checked }));
    methods.setValue(key, checked ? 1 : 0, { shouldDirty: true });
    if (checked) setOpenService(key);
    else if (openService === key) setOpenService(null);
  };

  const onServiceHeaderClick = (key) => (e) => {
    e.preventDefault();
    if (!servicesEnabled[key]) return;
    setOpenService((curr) => (curr === key ? null : key));
  };

  // iCal URL builder and copy handler
  const icalUrl = React.useMemo(() => {
    const token = values.ical_export_token || '';
    if (!unitId || !token) return '';
    const origin = (typeof window !== 'undefined' && window.location && window.location.origin) ? window.location.origin : '';
    return `${origin}/ical/export/unit/${unitId}.ics?token=${token}`;
  }, [unitId, values.ical_export_token]);

  const handleCopyIcal = async () => {
    if (!icalUrl) return;
    try {
      await navigator.clipboard.writeText(icalUrl);
      // Use a lightweight fallback toast via alert for now
      alert('iCal URL copied to clipboard');
    } catch (e) {
      try {
        const ta = document.createElement('textarea');
        ta.value = icalUrl;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        alert('iCal URL copied to clipboard');
      } catch {
        alert('Unable to copy. URL: ' + icalUrl);
      }
    }
  };

  const handleTogglePrivateIcal = () => {
    const next = !privateIcalEnabled;
    methods.setValue('private_ical_enabled', next, { shouldDirty: true, shouldValidate: true });
    setValues((v) => ({ ...v, private_ical_enabled: next }));
  };
  if (loading) return <div style={{ padding: 16 }}>Loading…</div>;

  // Shared style for sticky section headers
  const summaryStyle = {
    fontWeight: 600,
    margin: '0 0 8px 0',
    cursor: 'pointer',
    position: 'sticky',
    top: 0,
    background: 'transparent',
    zIndex: 5,
    padding: '10px 0 8px 0',
    borderBottom: 'none',
  };

  return (
    <FormProvider {...methods}>
      <div
        id="unit-edit-scroll"
        style={{
          padding: 0,
          boxSizing: 'border-box',
        }}
      >
        <form id="unit-edit-form" onSubmit={handleSubmit(onSubmit)}>
        {/* Basic Info */}
        <details id="section-basic" open={openSection === 'basic'}>
          <summary onClick={onOpen('basic')} style={summaryStyle}>Basic Info</summary>
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 12, rowGap: 0, alignItems: 'center' }}>
              <RHFDatePicker name="date_started" label="Date Started" widthVariant="half" />
              <RHFSelect name="status" label="Status" options={["Active", "Alor", "Onboarding", "Inactive"]} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 12, rowGap: 0, alignItems: 'center' }}>
              <RHFTextField name="unit_name" label="Unit Name *" rules={{ required: 'Required' }} />
              <RHFSelect name="type" label="Type" options={["Studio", "1 Bdr", "2 Bdr", "3 Bdr"]} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 12, rowGap: 0, alignItems: 'center' }}>
              <RHFSelect name="city" label="City" options={["Playa del Carmen", "Tulum"]} />

              <RHFAutocomplete
                name="condo_id"                                // store id in form state
                label="Condo"
                options={condoOpts}
                getOptionLabel={(opt) => (opt?.condoName || opt?.name || opt?.condo_name || '')}
                getOptionValue={(opt) => opt?.id}               // use id as value
                isOptionEqualToValue={(opt, val) => (opt?.id || null) === (val ?? null)}
                inputValue={condoName}
                onInputChange={(val, reason) => {
                  if (reason === 'input') {
                    setCondoHasTyped(true);
                    setCondoName(val);
                  }
                }}
                onChange={(val, opt) => {
                  const label = opt ? (opt.condoName || opt.name || opt.condo_name || '') : '';
                  methods.setValue('condo_id', val ?? null, { shouldDirty: true });
                  methods.setValue('condo_name', label, { shouldDirty: true });
                  setValues((v) => ({ ...v, condo_id: val ?? null, condo_name: label }));
                }}
                placeholder="Type to search condo"
                sx={{ width: '100%' }}
              />
            </div>

            <RHFAutocomplete
              name="client_id"                                  // store id in form state
              label="Client"
              options={clientOpts}
              getOptionLabel={(opt) => (opt?.name || opt?.client_name || '')}
              getOptionValue={(opt) => opt?.id}                 // use id as value
              isOptionEqualToValue={(opt, val) => (opt?.id || null) === (val ?? null)}
              inputValue={clientName}
              onInputChange={(val, reason) => {
                if (reason === 'input') {
                  setClientHasTyped(true);
                  setClientName(val);
                }
              }}
              onChange={(val, opt) => {
                const label = opt ? (opt.name || opt.client_name || '') : '';
                methods.setValue('client_id', val ?? null, { shouldDirty: true });
                methods.setValue('client_name', label, { shouldDirty: true });
                setValues((v) => ({ ...v, client_id: val ?? null, client_name: label }));
              }}
              placeholder="Type to search client"
              sx={{ width: widthMap.full }}
            />
            <RHFTextField name="cc_email" label="CC Email" sx={{ width: widthMap.full }} />

            
          </div>
        </details>

        {/* Unit Details */}
        <details id="section-details" open={openSection === 'details'}>
          <summary onClick={onOpen('details')} style={summaryStyle}>Unit Details</summary>
          <div style={{ display: 'grid', gap: 12 }}>
            {/* Unit Number and Unit Floor */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 12, rowGap: 0, alignItems: 'center' }}>
              <RHFTextField name="unit_number" label="Unit Number" />
              <RHFTextField name="unit_floor" label="Unit Floor" />
            </div>

            {/* Pax and Baths */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 12, rowGap: 0, alignItems: 'center' }}>
              <RHFTextField name="pax" label="Pax" inputProps={{ type: 'number', min: 0, step: 1, inputMode: 'numeric' }} />
              <RHFTextField name="baths" label="Baths" inputProps={{ type: 'number', min: 0, step: 1, inputMode: 'numeric' }} />
            </div>

            {/* Beds and Parking */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 12, rowGap: 0, alignItems: 'center' }}>
              <RHFTextField
                name="beds"
                label="Beds"
                inputProps={{ type: 'number', min: 0, step: 1, inputMode: 'numeric' }}
              />
              <RHFSelect
                name="parking"
                label="Parking"
                options={["No", "Assigned", "Not Assigned"]}
              />
            </div>

            {/* Bed Types (bed_config) */}
            <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                <div style={{ fontWeight: 700 }}>Bed Types</div>
                <button
                  type="button"
                  onClick={addBedRow}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 8,
                    border: '1px solid #d0d7de',
                    background: '#fff',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  + Add
                </button>
              </div>

              {(Array.isArray(bedConfig) ? bedConfig : []).length === 0 ? null : (
                <div style={{ display: 'grid', gap: 8 }}>
                  {(bedConfig || []).map((row, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '32px 1fr 44px', gap: 8, alignItems: 'center' }}>
                      <div style={{ fontWeight: 700, color: '#6b7280', textAlign: 'right' }}>{idx + 1}.</div>
                      <select
                        value={row?.type ?? ''}
                        onChange={(e) => updateBedRow(idx, { type: e.target.value, count: 1 })}
                        style={{
                          height: 40,
                          borderRadius: 8,
                          border: '1px solid #d0d7de',
                          padding: '0 10px',
                          background: '#fff',
                        }}
                      >
                        <option value="">— Select —</option>
                        {bedTypeOptions.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => removeBedRow(idx)}
                        title="Remove"
                        style={{
                          height: 40,
                          width: 44,
                          borderRadius: 8,
                          border: '1px solid #d0d7de',
                          background: '#fff',
                          cursor: 'pointer',
                          fontWeight: 800,
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* WiFi Name and Password */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 12, rowGap: 0, alignItems: 'center' }}>
              <RHFTextField name="wifi_name" label="WiFi Name" />
              <RHFTextField name="wifi_password" label="WiFi Password" />
            </div>

          </div>
        </details>

        {/* Access Info */}
        <details id="section-access" open={openSection === 'access'}>
          <summary onClick={onOpen('access')} style={summaryStyle}>Access Details</summary>
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 12, rowGap: 0, alignItems: 'center' }}>
              <RHFSelect name="access_type" label="Access Type" options={["Lockbox", "Smart Lock"]} />
              <RHFTextField name="access_code" label="Access Code" />
            </div>
            <RHFTextField name="backup_lockbox" label="Backup Lockbox" />
            <RHFTextField name="building_code" label="Building Code" sx={{ width: widthMap.full }} />
          </div>
        </details>

        {/* Services */}
        <details id="section-services" open={openSection === 'services'}>
          <summary onClick={onOpen('services')} style={summaryStyle}>Services</summary>
          {/* Services */}
          <div style={{ display: 'grid', gap: 12 }}>
            {/* CFE */}
            <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <input type="checkbox" checked={servicesEnabled.cfe} onChange={toggleServiceEnabled('cfe')} />
                <button
                  type="button"
                  onClick={onServiceHeaderClick('cfe')}
                  disabled={!servicesEnabled.cfe}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontWeight: 600,
                    cursor: servicesEnabled.cfe ? 'pointer' : 'not-allowed',
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                  }}
                >
                  {servicesEnabled.cfe && (
                    <span style={{ display: 'inline-block', transform: openService === 'cfe' ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▸</span>
                  )}
                  CFE
                </button>
              </div>
              {openService === 'cfe' && (
                <div style={{ display: 'grid', gap: 12 }}>
                  <RHFTextField name="cfe_name" label="CFE Name" sx={{ width: widthMap.full }} />
                  <RHFTextField name="cfe_reference" label="CFE Reference" sx={{ width: widthMap.full }} />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 12, rowGap: 0, alignItems: 'center' }}>
                    <RHFSelect name="cfe_period" label="CFE Period" options={["Monthly", "BiMonthly"]} />
                    <RHFTextField name="cfe_payment_day" label="CFE Payment Day" inputProps={{ type: 'number', min: 1, max: 31 }} />
                  </div>
                  <RHFTextField name="cfe_starting_month" label='CFE Starting Month (ex "1")' sx={{ width: widthMap.full }} />
                </div>
              )}
            </div>

            {/* Internet */}
            <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <input type="checkbox" checked={servicesEnabled.internet} onChange={toggleServiceEnabled('internet')} />
                <button
                  type="button"
                  onClick={onServiceHeaderClick('internet')}
                  disabled={!servicesEnabled.internet}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontWeight: 600,
                    cursor: servicesEnabled.internet ? 'pointer' : 'not-allowed',
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                  }}
                >
                  {servicesEnabled.internet && (
                    <span style={{ display: 'inline-block', transform: openService === 'internet' ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▸</span>
                  )}
                  Internet
                </button>
              </div>
              {openService === 'internet' && (
                <div style={{ display: 'grid', gap: 12 }}>
                  {/* Row 1: ISP (half) | Reference (half) */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 12, rowGap: 0, alignItems: 'center' }}>
                    <RHFSelect name="internet_isp" label="ISP" options={["Telmex", "Totalplay"]} />
                    <RHFTextField name="internet_reference" label="Reference" />
                  </div>
                  {/* Row 2: Monthly Cost (half) | Pay Day (half) */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 12, rowGap: 0, alignItems: 'center' }}>
                    <RHFTextField name="internet_cost" label="Monthly Cost" inputProps={{ type: 'number', step: '0.01', inputMode: 'decimal' }} />
                    <RHFTextField name="internet_deadline" label="Pay Day" inputProps={{ type: 'number', min: 1, max: 31 }} />
                  </div>
                </div>
              )}
            </div>

            {/* Water */}
            <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <input type="checkbox" checked={servicesEnabled.water} onChange={toggleServiceEnabled('water')} />
                <button
                  type="button"
                  onClick={onServiceHeaderClick('water')}
                  disabled={!servicesEnabled.water}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontWeight: 600,
                    cursor: servicesEnabled.water ? 'pointer' : 'not-allowed',
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                  }}
                >
                  {servicesEnabled.water && (
                    <span style={{ display: 'inline-block', transform: openService === 'water' ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▸</span>
                  )}
                  Water
                </button>
              </div>
              {openService === 'water' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 12, rowGap: 0, alignItems: 'center' }}>
                  <RHFTextField name="water_reference" label="Water Reference" />
                  <RHFTextField name="water_deadline" label="Pay Day" inputProps={{ type: 'number', min: 1, max: 31 }} />
                </div>
              )}
            </div>

            {/* HOA */}
            <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <input type="checkbox" checked={servicesEnabled.hoa} onChange={toggleServiceEnabled('hoa')} />
                <button
                  type="button"
                  onClick={onServiceHeaderClick('hoa')}
                  disabled={!servicesEnabled.hoa}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontWeight: 600,
                    cursor: servicesEnabled.hoa ? 'pointer' : 'not-allowed',
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                  }}
                >
                  {servicesEnabled.hoa && (
                    <span style={{ display: 'inline-block', transform: openService === 'hoa' ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▸</span>
                  )}
                  HOA
                </button>
              </div>
              {openService === 'hoa' && (
                <div>
                  <RHFTextField name="hoa_amount" label="Monthly Amount" inputProps={{ type: 'number', step: '0.01', inputMode: 'decimal' }} />
                </div>
              )}
            </div>
          </div>
        </details>

        {/* Airbnb Info */}
        <details id="section-airbnb" open={openSection === 'airbnb'}>
          <summary onClick={onOpen('airbnb')} style={summaryStyle}>Airbnb Info</summary>
          <div style={{ display: 'grid', gap: 12 }}>
            <RHFTextField name="listing_name" label="Listing Name" sx={{ width: widthMap.full }} />
            <RHFTextField name="airbnb_ical" label="Airbnb iCal" sx={{ width: widthMap.full }} />
            <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', alignItems: 'center', columnGap: 12 }}>
              <button
                type="button"
                onClick={handleCopyIcal}
                disabled={!values.ical_export_token || !privateIcalEnabled}
                style={{
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid #d0d7de',
                  background: (!values.ical_export_token || !privateIcalEnabled) ? '#f3f4f6' : '#fff',
                  cursor: (!values.ical_export_token || !privateIcalEnabled) ? 'not-allowed' : 'pointer',
                  fontWeight: 600,
                  whiteSpace: 'nowrap'
                }}
                title={!privateIcalEnabled ? 'Private iCal not enabled for this unit' : (values.ical_export_token ? `Copy: ${icalUrl}` : 'No iCal token')}
              >
                Copy iCal URL
              </button>

              <button
                type="button"
                onClick={handleTogglePrivateIcal}
                style={{
                  padding: '6px 10px',
                  borderRadius: 16,
                  border: '1px solid #d0d7de',
                  background: privateIcalEnabled ? '#d1fae5' : '#fee2e2',
                  color: privateIcalEnabled ? '#065f46' : '#991b1b',
                  fontWeight: 700,
                  minWidth: 110,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  cursor: 'pointer'
                }}
                title={privateIcalEnabled ? 'Private iCal Enabled' : 'Private iCal Disabled'}
              >
                <span>Enabled</span>
                <span style={{
                  display: 'inline-block',
                  width: 36,
                  height: 18,
                  borderRadius: 999,
                  background: privateIcalEnabled ? '#10b981' : '#ef4444',
                  position: 'relative',
                  boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)'
                }}>
                  <span style={{
                    position: 'absolute',
                    top: 2,
                    left: privateIcalEnabled ? 20 : 2,
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    background: '#fff',
                    transition: 'left 120ms ease'
                  }} />
                </span>
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 12, rowGap: 0, alignItems: 'center' }}>
              <RHFSelect name="host_type" label="Host Type" options={["Host", "Co-Host"]} />
              <RHFSelect name="payment_type" label="Payment Type" options={["OWNERS2", "CLIENT"]} />
            </div>
            {/* Insert Payment Route select here */}
            {isAdmin && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
                <RHFSelect
                  name="airbnb_pay_route"
                  label="Payment Route"
                  options={["Espiral", "Santander", "Client"]}
                  disabled={paymentType === 'CLIENT'}
                />
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 12, rowGap: 0, alignItems: 'center' }}>
              <RHFTextField name="cleaning_fee" label="Cleaning Fee" inputProps={{ type: 'number', step: '0.01', inputMode: 'decimal' }} />
              <RHFTextField name="linens_fee" label="Linens Fee" inputProps={{ type: 'number', step: '0.01', inputMode: 'decimal' }} />
            </div>
            {hostType === 'Co-Host' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 12, rowGap: 0, alignItems: 'center' }}>
                <RHFTextField name="airbnb_email" label="Airbnb Email" />
                <RHFTextField name="airbnb_pass" label="Airbnb Password" />
              </div>
            )}
            <RHFTextField name="seo_short_description" label="Description" multiline minRows={3} sx={{ width: widthMap.full }} />
          </div>
        </details>

        {/* Notes */}
        <details id="section-notes" open={openSection === 'notes'}>
          <summary onClick={onOpen('notes')} style={summaryStyle}>Notes</summary>
          <div style={{ display: 'grid', gap: 12 }}>
            <RHFTextField name="notes" label="Notes" multiline minRows={3} sx={{ width: widthMap.full }} />
          </div>
        </details>
        </form>
      </div>
    </FormProvider>
  );
}