import React, { useMemo, useState, useEffect } from 'react';
import { Box, Grid, Typography, Button, Stack } from '@mui/material';
import { FormProvider, useForm } from 'react-hook-form';

// RHF fields (these exist in your project)
import RHFTextField from '../rhf/RHFTextField';
import RHFSelect from '../rhf/RHFSelect';
import RHFCheckbox from '../rhf/RHFCheckbox';
import { widthMap } from '../rhf/widthMap';

/**
 * Create new Purchase Catalog Item (purchase_catalog_item)
 *
 * Props:
 *  - onCreated(item): called after successful create
 *  - onCancel(): optional
 */
export default function CatalogItemNewForm({ onCreated, onCancel }) {
  const [submitError, setSubmitError] = useState(null);

  const categoryOptions = useMemo(
    () => [
      { value: '', label: '—' },
      { value: 'Basics', label: 'Basics' },
      { value: 'Towels', label: 'Towels' },
      { value: 'Bedroom', label: 'Bedroom' },
      { value: 'Kitchen', label: 'Kitchen' },
      { value: 'Dining', label: 'Dining' },
      { value: 'Other', label: 'Other' },
    ],
    []
  );

  const bedSizeOptions = useMemo(
    () => [
      { value: '', label: '—' },
      { value: 'king', label: 'King' },
      { value: 'queen', label: 'Queen' },
      { value: 'single', label: 'Single' },
      { value: 'sofa', label: 'Sofa' },
    ],
    []
  );

  const towelBasisOptions = useMemo(
    () => [
      { value: 'guest', label: 'Per guest' },
      { value: 'bath', label: 'Per bath' },
    ],
    []
  );

  const diningBasisOptions = useMemo(
    () => [
      { value: 'guest', label: 'Per guest' },
    ],
    []
  );

  const towelNameOptions = useMemo(
    () => [
      { value: '', label: '—' },
      { value: 'Shower Towel', label: 'Shower Towel' },
      { value: 'Pool Towel', label: 'Pool Towel' },
      { value: 'Handtowel', label: 'Handtowel' },
      { value: 'Bath Mat', label: 'Bath Mat' },
    ],
    []
  );

  const towelNameToDefaults = useMemo(
    () => ({
      'Shower Towel': { basis: 'guest', qty: 2 },
      'Pool Towel': { basis: 'guest', qty: 2 },
      'Handtowel': { basis: 'bath', qty: 2 },
      'Bath Mat': { basis: 'bath', qty: 2 },
    }),
    []
  );

  const bedroomNameOptions = useMemo(
    () => [
      { value: '', label: '—' },
      { value: 'Sheets', label: 'Sheets' },
      { value: 'Mattress Protector', label: 'Mattress Protector' },
      { value: 'Pillow Cases', label: 'Pillow Cases' },
      { value: 'Pillows', label: 'Pillows' },
      { value: 'Blanket', label: 'Blanket' },
    ],
    []
  );

  const bedroomNameToRule = useMemo(
    () => ({
      Sheets: { qty_basis: 'bed', qty_per_basis: 2 },
      'Mattress Protector': { qty_basis: 'bed', qty_per_basis: 1 },
      Blanket: { qty_basis: 'bed', qty_per_basis: 1 },
      Pillows: { qty_basis: 'bed', qty_per_bed_by_size: { king: 2, queen: 2, single: 1 } },
      'Pillow Cases': { qty_basis: 'bed', qty_per_bed_by_size: { king: 4, queen: 4, single: 2 } },
    }),
    []
  );

  const basicsNameOptions = useMemo(
    () => [
      { value: '', label: '—' },
      { value: 'Hair Dryer', label: 'Hair Dryer' },
      { value: 'Ironing Board', label: 'Ironing Board' },
      { value: 'Lockbox', label: 'Lockbox' },
    ],
    []
  );

  const kitchenNameOptions = useMemo(
    () => [
      { value: '', label: '—' },
      { value: 'Coffee Maker', label: 'Coffee Maker' },
      { value: 'Frying Pan', label: 'Frying Pan' },
      { value: 'Pan Big', label: 'Pan Big' },
      { value: 'Pan Medium', label: 'Pan Medium' },
      { value: 'Pan Small', label: 'Pan Small' },
      { value: 'Salad Bowl', label: 'Salad Bowl' },
      { value: 'Toaster', label: 'Toaster' },
    ],
    []
  );

  const diningNameOptions = useMemo(
    () => [
      { value: '', label: '—' },
      { value: 'Bowls', label: 'Bowls' },
      { value: 'Coffee Cup', label: 'Coffee Cup' },
      { value: 'Glasses Shot', label: 'Glasses Shot' },
      { value: 'Glasses Water', label: 'Glasses Water' },
      { value: 'Glasses Wine', label: 'Glasses Wine' },
      { value: 'Plates Big', label: 'Plates Big' },
      { value: 'Plates Small', label: 'Plates Small' },
    ],
    []
  );

  const diningNameToDefaults = useMemo(
    () => ({
      Bowls: 2,
      'Coffee Cup': 1,
      'Glasses Shot': 2,
      'Glasses Water': 2,
      'Glasses Wine': 2,
      'Plates Big': 2,
      'Plates Small': 2,
    }),
    []
  );

  const defaultValues = useMemo(
    () => ({
      name: '',
      category: '',
      towel_basis: 'guest',
      dining_basis: 'guest',
      is_always_needed: true,
      bed_size: '',
      qty_per_basis: '',
      purchase_source: '',
      purchase_url: '',
      cost: '',
      sell_price: '',
      notes: '',
    }),
    []
  );

  const form = useForm({
    defaultValues,
    mode: 'onSubmit',
  });

  const selectedCategory = form.watch('category');
  const towelBasis = form.watch('towel_basis');
  const selectedName = form.watch('name');
  const selectedBedSize = form.watch('bed_size');

  const isBedroomMapRule =
    selectedCategory === 'Bedroom' &&
    (selectedName === 'Pillows' || selectedName === 'Pillow Cases');

  useEffect(() => {
    if (selectedCategory !== 'Towels') return;

    // If name cleared, reset to a clean state
    if (!selectedName) {
      form.setValue('towel_basis', 'guest', { shouldDirty: true, shouldTouch: true });
      form.setValue('qty_per_basis', '', { shouldDirty: true, shouldTouch: true });
      return;
    }

    const def = towelNameToDefaults[selectedName];
    if (!def) return;

    if (def.basis !== towelBasis) {
      form.setValue('towel_basis', def.basis, { shouldDirty: true, shouldTouch: true });
    }

    // Always default qty based on preset
    form.setValue('qty_per_basis', String(def.qty), { shouldDirty: true, shouldTouch: true });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory, selectedName]);

  useEffect(() => {
    if (selectedCategory !== 'Dining') return;

    // If name cleared, clear qty
    if (!selectedName) {
      form.setValue('qty_per_basis', '', { shouldDirty: true, shouldTouch: true });
      return;
    }

    const def = diningNameToDefaults[selectedName];
    if (typeof def !== 'number') return;

    // Default qty per guest
    form.setValue('qty_per_basis', String(def), { shouldDirty: true, shouldTouch: true });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory, selectedName]);

  useEffect(() => {
    if (selectedCategory !== 'Basics') return;

    // If name cleared, clear qty
    if (!selectedName) {
      form.setValue('qty_per_basis', '', { shouldDirty: true, shouldTouch: true });
      return;
    }

    // Always 1 item per unit for Basics
    form.setValue('qty_per_basis', '1', { shouldDirty: true, shouldTouch: true });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory, selectedName]);

  useEffect(() => {
    if (selectedCategory !== 'Kitchen') return;

    // If name cleared, clear qty
    if (!selectedName) {
      form.setValue('qty_per_basis', '', { shouldDirty: true, shouldTouch: true });
      return;
    }

    // Always 1 item per unit for Kitchen
    form.setValue('qty_per_basis', '1', { shouldDirty: true, shouldTouch: true });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory, selectedName]);

  useEffect(() => {
    if (selectedCategory !== 'Bedroom') return;
    const rule = bedroomNameToRule[selectedName];
    if (!rule) return;

    // If the rule uses a by-size map, clear the numeric qty field to avoid ambiguity.
    if (rule.qty_per_bed_by_size) {
      form.setValue('qty_per_basis', '', { shouldDirty: true });
    } else if (typeof rule.qty_per_basis === 'number') {
      form.setValue('qty_per_basis', String(rule.qty_per_basis), { shouldDirty: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory, selectedName]);

useEffect(() => {
  if (selectedCategory !== 'Bedroom') return;
  const rule = bedroomNameToRule[selectedName];
  if (!rule || !rule.qty_per_bed_by_size) return;

  // If bed size is cleared, clear qty too
  if (!selectedBedSize) {
    form.setValue('qty_per_basis', '', { shouldDirty: true });
    return;
  }

  const suggested = rule.qty_per_bed_by_size[selectedBedSize];
  if (typeof suggested !== 'number') return;

  // Always update when bed size changes
  form.setValue('qty_per_basis', String(suggested), { shouldDirty: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [selectedCategory, selectedName, selectedBedSize]);

  const toNullableNumber = (v) => {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    if (s === '') return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };

  const toNullableInt = (v) => {
    const n = toNullableNumber(v);
    return n === null ? null : Math.trunc(n);
  };

  const toNullableString = (v) => {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    return s === '' ? null : s;
  };

  const getJwtToken = () => {
    return (
      localStorage.getItem('jwt') ||
      localStorage.getItem('token') ||
      localStorage.getItem('access_token') ||
      sessionStorage.getItem('jwt') ||
      sessionStorage.getItem('token') ||
      sessionStorage.getItem('access_token') ||
      null
    );
  };

  const authFetch = async (url, options = {}) => {
    const token = getJwtToken();
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    return fetch(url, {
      ...options,
      headers,
      credentials: 'include',
    });
  };

  const onSubmit = async (values) => {
    setSubmitError(null);

    // Base payload (new API)
    const payload = {
      name: String(values.name || '').trim(),
      category: toNullableString(values.category),
      is_always_needed: !!values.is_always_needed,
      bed_size: toNullableString(values.bed_size),

      qty_basis: null,
      qty_per_basis: null,
      qty_per_bed_by_size: null,

      purchase_source: toNullableString(values.purchase_source),
      purchase_url: toNullableString(values.purchase_url),
      cost: toNullableNumber(values.cost) !== null ? String(toNullableNumber(values.cost)) : null,
      sell_price: toNullableNumber(values.sell_price) !== null ? String(toNullableNumber(values.sell_price)) : null,
      notes: toNullableString(values.notes),
    };

    const qtyPer = toNullableInt(values.qty_per_basis);

    // Bedroom: apply preset rules when available
    if (payload.category === 'Bedroom') {
        const rule = bedroomNameToRule[values.name];
        payload.qty_basis = 'bed';
  
        if (rule?.qty_per_bed_by_size) {
          payload.qty_per_bed_by_size = rule.qty_per_bed_by_size;
          payload.qty_per_basis = qtyPer; // override for selected bed size
        } else {
          payload.qty_per_basis = qtyPer;
          payload.qty_per_bed_by_size = null;
        }
      }

    // Towels: qty per guest OR per bath depending on Scale
    if (payload.category === 'Towels') {
      const basis = values.towel_basis || 'guest';
      payload.qty_basis = basis === 'bath' ? 'bath' : 'guest';
      payload.qty_per_basis = qtyPer;
    }

    // Dining: qty per guest
    if (payload.category === 'Dining') {
      payload.qty_basis = 'guest';
      payload.qty_per_basis = qtyPer;
    }

    // Fixed-per-unit categories
    if (['Security', 'Basics', 'Kitchen', 'Other'].includes(payload.category || '')) {
      payload.qty_basis = 'unit';
      payload.qty_per_basis = qtyPer;
    }

    if (!payload.name) {
      setSubmitError('Name is required');
      return;
    }
    const needsRule = !!payload.category;
    const hasQty = payload.qty_per_basis !== null && payload.qty_per_basis !== undefined;
    const hasMap = payload.qty_per_bed_by_size && Object.keys(payload.qty_per_bed_by_size).length > 0;
    if (needsRule && !hasQty && !hasMap) {
      setSubmitError('Qty is required');
      return;
    }

    const res = await authFetch('/api/purchase-catalog', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const json = await res.json().catch(() => ({}));

    if (res.status === 401) {
      throw new Error('Unauthorized (JWT missing/expired)');
    }

    if (!res.ok || !json?.ok) {
      const msg = json?.error || json?.message || 'Failed to create item';
      setSubmitError(msg);
      return;
    }

    form.reset(defaultValues);
    if (typeof onCreated === 'function') {
      onCreated(json.item);
    }
  };

  return (
    <Box sx={{ p: 2 }}>
      {submitError && (
        <Box sx={{ mb: 1, color: '#b91c1c' }}>{String(submitError)}</Box>
      )}

      <FormProvider {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <Grid container spacing={2}>
            <Grid item xs={12} sx={widthMap.full}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Box sx={widthMap.twoThirds}>
                  <RHFSelect name="category" label="Category" options={categoryOptions} />
                </Box>
                <Box sx={{ ...widthMap.oneThird, display: 'flex', alignItems: 'center' }}>
                  <RHFCheckbox name="is_always_needed" label="Always" />
                </Box>
              </Box>
            </Grid>
            <Grid item xs={12} sx={widthMap.full}>
              {selectedCategory === 'Towels' ? (
                <RHFSelect name="name" label="Name" options={towelNameOptions} />
              ) : selectedCategory === 'Bedroom' ? (
                <RHFSelect name="name" label="Name" options={bedroomNameOptions} />
              ) : selectedCategory === 'Basics' ? (
                <RHFSelect name="name" label="Name" options={basicsNameOptions} />
              ) : selectedCategory === 'Kitchen' ? (
                <RHFSelect name="name" label="Name" options={kitchenNameOptions} />
              ) : selectedCategory === 'Dining' ? (
                <RHFSelect name="name" label="Name" options={diningNameOptions} />
              ) : (
                <RHFTextField name="name" label="Name" required />
              )}
            </Grid>

            {selectedCategory === 'Bedroom' && (
              <>
                <Grid item xs={12} sx={widthMap.full}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Box sx={widthMap.oneThird}>
                      <RHFSelect name="bed_size" label="Bed Size" options={bedSizeOptions} />
                    </Box>
                    <Box sx={widthMap.oneThird}>
  {isBedroomMapRule ? (
    <RHFTextField
      name="qty_per_basis"
      label="Qty (per bed)"
      type="number"
    />
  ) : (
    <RHFTextField name="qty_per_basis" label="Qty (per bed)" type="number" />
  )}
</Box>
                    <Box sx={widthMap.oneThird} />
                  </Box>
                </Grid>

                <Grid item xs={12} sx={widthMap.full}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Box sx={widthMap.half}>
                      <RHFTextField name="cost" label="Cost (per set/unit)" type="number" />
                    </Box>
                    <Box sx={widthMap.half}>
                      <RHFTextField name="sell_price" label="Sell Price" type="number" />
                    </Box>
                  </Box>
                </Grid>
              </>
            )}

            {selectedCategory === 'Towels' && (
              <>
                <Grid item xs={12} sx={widthMap.full}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Box sx={widthMap.twoThirds}>
                      <RHFSelect name="towel_basis" label="Scale" options={towelBasisOptions} />
                    </Box>
                    <Box sx={widthMap.oneThird}>
                      <RHFTextField name="qty_per_basis" label="Qty" type="number" />
                    </Box>
                  </Box>
                </Grid>

                {/* Pricing row (below Towels scaling row) */}
                <Grid item xs={12} sx={widthMap.full}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Box sx={widthMap.half}>
                      <RHFTextField name="cost" label="Cost (per set/unit)" type="number" />
                    </Box>
                    <Box sx={widthMap.half}>
                      <RHFTextField name="sell_price" label="Sell Price" type="number" />
                    </Box>
                  </Box>
                </Grid>
              </>
            )}

            {selectedCategory === 'Dining' && (
              <>
                <Grid item xs={12} sx={widthMap.full}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Box sx={widthMap.twoThirds}>
                      <RHFSelect
                        name="dining_basis"
                        label="Scale"
                        options={diningBasisOptions}
                        disabled
                      />
                    </Box>
                    <Box sx={widthMap.oneThird}>
                      <RHFTextField name="qty_per_basis" label="Qty" type="number" />
                    </Box>
                  </Box>
                </Grid>

                <Grid item xs={12} sx={widthMap.full}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Box sx={widthMap.half}>
                      <RHFTextField name="cost" label="Cost (per set/unit)" type="number" />
                    </Box>
                    <Box sx={widthMap.half}>
                      <RHFTextField name="sell_price" label="Sell Price" type="number" />
                    </Box>
                  </Box>
                </Grid>
              </>
            )}

            {['Security', 'Basics', 'Kitchen', 'Other'].includes(selectedCategory) && (
              <>
                <Grid item xs={12} sx={widthMap.full}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Box sx={widthMap.oneThird}>
                      <RHFTextField name="qty_per_basis" label="Qty" type="number" />
                    </Box>
                    <Box sx={widthMap.twoThirds} />
                  </Box>
                </Grid>

                <Grid item xs={12} sx={widthMap.full}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Box sx={widthMap.half}>
                      <RHFTextField name="cost" label="Cost (per set/unit)" type="number" />
                    </Box>
                    <Box sx={widthMap.half}>
                      <RHFTextField name="sell_price" label="Sell Price" type="number" />
                    </Box>
                  </Box>
                </Grid>
              </>
            )}

            <Grid item xs={12} sx={widthMap.half}>
              <RHFTextField name="purchase_source" label="Provider" placeholder="Amazon / Walmart / Chedraui" />
            </Grid>
            <Grid item xs={12} sx={widthMap.full}>
              <RHFTextField name="purchase_url" label="Purchase URL" />
            </Grid>

            <Grid item xs={12} sx={widthMap.full}>
              <RHFTextField name="notes" label="Notes" multiline minRows={2} />
            </Grid>
          </Grid>

          <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 2 }}>
            {onCancel && (
              <Button variant="outlined" onClick={onCancel}>
                Cancel
              </Button>
            )}
            <Button type="submit" variant="contained">
              Create
            </Button>
          </Stack>
        </form>
      </FormProvider>
    </Box>
  );
}