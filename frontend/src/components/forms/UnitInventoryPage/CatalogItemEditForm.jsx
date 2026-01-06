import React, { useEffect, useMemo } from 'react';
import RHFForm from '../rhf/RHFForm';
import RHFTextField from '../rhf/RHFTextField';
import { useForm } from 'react-hook-form';

// Mirrors nullable handling used in CatalogItemNewForm.jsx
function toNullableTrimmedString(v) {
  const s = (v ?? '').toString().trim();
  return s.length ? s : null;
}

function toNullableMoney(v) {
  const raw = (v ?? '').toString().trim();
  if (!raw.length) return null;

  const cleaned = raw
    .replace(/[^0-9,.-]/g, '')
    .replace(/,(?=\d{3}(?:\D|$))/g, '');

  const parts = cleaned.split(',');
  let normalized = cleaned;
  if (parts.length > 1 && cleaned.indexOf('.') === -1) {
    const last = parts.pop();
    normalized = `${parts.join('')}.${last}`;
  }

  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return n.toFixed(2);
}

function getJwtToken() {
  try {
    return localStorage.getItem('jwt') || localStorage.getItem('token') || null;
  } catch {
    return null;
  }
}

export default function CatalogItemEditForm({ item, onSaved, formId }) {
  const canEdit = !!item && !!item.id;

  const defaultValues = useMemo(() => {
    const it = item || {};
    return {
      cost: it.cost ?? '',
      sell_price: it.sell_price ?? '',
      purchase_source: it.purchase_source ?? '',
      purchase_url: it.purchase_url ?? '',
      notes: it.notes ?? '',
    };
  }, [item]);

  const methods = useForm({
    defaultValues,
    mode: 'onSubmit',
  });

  useEffect(() => {
    methods.reset(defaultValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

  if (!item) {
    return <div style={{ padding: 12 }}>No item selected.</div>;
  }

  if (!canEdit) {
    return <div style={{ padding: 12 }}>Invalid item.</div>;
  }

  const handleSubmit = async (values) => {
    const payload = {
      cost: toNullableMoney(values.cost),
      sell_price: toNullableMoney(values.sell_price),
      purchase_source: toNullableTrimmedString(values.purchase_source),
      purchase_url: toNullableTrimmedString(values.purchase_url),
      notes: toNullableTrimmedString(values.notes),
    };

    const token = getJwtToken();

    const res = await fetch(`/api/purchase-catalog/${encodeURIComponent(item.id)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = (data && (data.error || data.message)) || `Save failed (${res.status})`;
      throw new Error(msg);
    }

    const updated = (data && (data.item || data.data || data)) || null;
    onSaved?.(updated);
  };

  return (
    <RHFForm
      formId={formId || `catalog-item-edit-${item.id}`}
      methods={methods}
      onSubmit={handleSubmit}
      onError={() => {}}
      useGrid={true}
      gridColumns="1fr"
      gridStyle={{ rowGap: 12 }}
    >
      <RHFTextField
        name="cost"
        label="Cost"
        placeholder="e.g. 250.00"
        inputMode="decimal"
      />

      <RHFTextField
        name="sell_price"
        label="Sell Price"
        placeholder="e.g. 350.00"
        inputMode="decimal"
      />

      <RHFTextField
        name="purchase_source"
        label="Provider"
        placeholder="e.g. Amazon"
      />

      <RHFTextField
        name="purchase_url"
        label="Purchase URL"
        placeholder="https://..."
      />

      <RHFTextField
        name="notes"
        label="Notes"
        multiline
        rows={4}
        placeholder="Optional notes"
      />
    </RHFForm>
  );
}