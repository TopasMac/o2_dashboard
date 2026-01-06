import React from 'react';
import { useForm, useFormContext } from 'react-hook-form';
import api from '../../api';
import RHFForm, {
  RHFTextField,
  RHFSelect,
  RHFAutocomplete,
  RHFDatePicker,
  RHFFile,
  RHFCheckbox,
} from '../forms/rhf/RHFForm';
import { widthMap } from '../forms/rhf/widthMap';

// --- Fieldset rendered inside RHFForm context ---
function UnitFields() {
  const { register, setValue, watch, formState: { errors } } = useFormContext();

  // --- Client autocomplete (fetch by name, set client_id when matched) ---
  const [clientOpts, setClientOpts] = React.useState([]);
  const clientName = watch('client_name') || '';
  React.useEffect(() => {
    const q = (clientName || '').trim();
    if (q.length < 1) {
      setClientOpts([]);
      return;
    }
    let cancelled = false;
    api.get('/api/clients', { params: { q }})
      .then(({ data }) => {
        if (!cancelled) {
          setClientOpts(Array.isArray(data) ? data : (data['hydra:member'] || data.items || data.rows || []));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [clientName]);

  // --- Condo autocomplete (fetch by name, set condo_id when matched) ---
  const [condoOpts, setCondoOpts] = React.useState([]);
  const condoName = watch('condo_name') || '';
  React.useEffect(() => {
    const q = (condoName || '').trim();
    if (q.length < 1) {
      setCondoOpts([]);
      return;
    }
    let cancelled = false;
    api.get('/api/condos', { params: { q }})
      .then(({ data }) => {
        if (!cancelled) {
          setCondoOpts(Array.isArray(data) ? data : (data['hydra:member'] || data.items || data.rows || []));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [condoName]);

  return (
    <div
      className="form-grid"
      style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr', width: '100%' }}
    >
      {/* Date Started */}
      <RHFDatePicker
        name="date_started"
        label="Date Started"          
        widthVariant="half"
        variant="outlined"
        fullWidth
        sx={{ alignSelf: 'stretch' }}
        InputLabelProps={{ shrink: true }}
      />

      {/* Unit Name */}
      <RHFTextField
        name="unit_name"
        label="Unit Name *"
        rules={{ required: 'Required' }}
        placeholder="e.g. 5aLia_13"
      />

      {/* Type & City in same row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <RHFSelect name="type" label="Type" options={["Studio", "1 Bdr", "2 Bdr", "3 Bdr"]} />
        <RHFSelect name="city" label="City" sx={{ width: widthMap.half }} options={["Playa del Carmen", "Tulum"]} />
      </div>

      {/* Status */}
      <RHFSelect
        name="status"
        label="Status"
        variant="outlined"
        fullWidth
        sx={{ width: widthMap.half, alignSelf: 'stretch' }}
        InputLabelProps={{ shrink: true }}
        options={["Active", "Alor", "Onboarding"]}
      />

      {/* Listing Name */}
      <RHFTextField
        name="listing_name"
        label="Listing Name"
        placeholder="Public listing title"
        sx={{ width: widthMap.full }}
      />

      {/* Host Type & Payment Type in same row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <RHFSelect name="host_type" label="Host Type" options={["Host", "Co-Host"]} />
        <RHFSelect name="payment_type" label="Payment Type" options={["OWNERS2", "CLIENT"]} />
      </div>

      {/* Cleaning Fee & Linens Fee in same row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <RHFTextField
          name="cleaning_fee"
          label="Cleaning Fee"
          inputProps={{ type: 'number', step: '0.01', inputMode: 'decimal' }}
          rules={{
            validate: (v) => (v === '' || !isNaN(Number(v))) || 'Must be a number',
          }}
          placeholder="e.g. 800"
        />
        <RHFTextField
          name="linens_fee"
          label="Linens Fee"
          inputProps={{ type: 'number', step: '0.01', inputMode: 'decimal' }}
          rules={{
            validate: (v) => (v === '' || !isNaN(Number(v))) || 'Must be a number',
          }}
          placeholder="e.g. 0"
        />
      </div>


      {/* Client (autocomplete -> sets client_id) */}
      <RHFAutocomplete
        name="client_name"
        label="Client"
        options={clientOpts}
        getOptionLabel={(opt) => (opt?.name || opt?.client_name || '')}
        onInputChange={(_, val) => setValue('client_name', val)}
        onChange={(_, opt) => setValue('client_id', opt ? opt.id : null, { shouldValidate: true })}
        placeholder="Type to search client"
        sx={{ width: widthMap.full }}
        isOptionEqualToValue={(opt, val) => (opt?.id || null) === (val?.id || null)}
      />

      {/* Condo (autocomplete -> sets condo_id) */}
      <RHFAutocomplete
        name="condo_name"
        label="Condo"
        options={condoOpts}
        getOptionLabel={(opt) => (opt?.condoName || opt?.name || opt?.condo_name || '')}
        onInputChange={(_, val) => setValue('condo_name', val)}
        onChange={(_, opt) => setValue('condo_id', opt ? opt.id : null, { shouldValidate: true })}
        placeholder="Type to search condo"
        sx={{ width: widthMap.half }}
        isOptionEqualToValue={(opt, val) => (opt?.id || null) === (val?.id || null)}
      />

      {/* Hidden IDs to keep payload mapping explicit */}
      <input type="hidden" {...register('client_id')} />
      <input type="hidden" {...register('condo_id')} />
    </div>
  );
}

export default function UnitNewFormRHF({ onSuccess }) {

  const defaults = React.useMemo(() => ({
    unit_name: '',
    listing_name: '',
    host_type: 'Host',
    payment_type: 'OWNERS2',
    cleaning_fee: '',
    linens_fee: '',
    status: 'Active',
    client_name: '',
    client_id: null,
    date_started: '',
    type: '',
    city: '',
    condo_name: '',
    condo_id: null,
  }), []);

  const methods = useForm({ defaultValues: defaults, mode: 'onSubmit' });

  const onSubmit = async (values) => {
    const toNullNum = (v) => (v === '' || v === null || typeof v === 'undefined') ? null : Number(v);
    const payload = {
      unit_name: (values.unit_name || '').trim(),
      listing_name: values.listing_name || '',
      host_type: values.host_type || '',
      payment_type: (values.payment_type || '').toUpperCase(),
      cleaning_fee: toNullNum(values.cleaning_fee),
      linens_fee: toNullNum(values.linens_fee),
      status: values.status || '',
      client_id: values.client_id ? Number(values.client_id) : null,
      date_started: values.date_started || null,
      type: values.type || '',
      city: values.city || '',
      condo_id: values.condo_id ? Number(values.condo_id) : null,
    };

    try {
      await api.post('/api/units', payload);
      if (onSuccess) onSuccess();
    } catch (err) {
      console.error('Failed to create unit', err);
      alert('Failed to create unit. Please check the fields and try again.');
    }
  };

  return (
    <div className="form-card" style={{ maxWidth: 960 }}>
      <h2 style={{ marginTop: 0 }}>Create New Unit</h2>
      <RHFForm formId="unit-new-form" methods={methods} onSubmit={onSubmit}>
        <UnitFields />
      </RHFForm>
    </div>
  );
}