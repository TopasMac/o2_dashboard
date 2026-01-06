import React from 'react';
import PropTypes from 'prop-types';
import { useForm } from 'react-hook-form';
import {
  Box,
  Typography,
} from '@mui/material';
import { toast } from 'react-toastify';
import RHFTextField from './rhf/RHFTextField';
import RHFDatePicker from './rhf/RHFDatePicker';
import RHFSelect from './rhf/RHFSelect';
import RHFFile from './rhf/RHFFile';
import RHFForm from './rhf/RHFForm';
import api from '../../api';

// Determine default txn_date: if yearMonth is provided (from UnitMonthlyReport),
// default to the 2nd day of the following month per reporting policy.
const computePolicyDate = (ym) => {
  try {
    if (!ym || typeof ym !== 'string' || ym.length < 7) return null;
    const [y, m] = ym.split('-').map((v) => Number(v));
    if (!y || !m) return null;
    // JS Date months are 0-based; set to first of next month, then add 1 day → 2nd
    const firstOfNext = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1));
    const secondOfNext = new Date(firstOfNext.getTime() + 24 * 60 * 60 * 1000);
    return secondOfNext.toISOString().slice(0, 10);
  } catch (e) {
    return null;
  }
};

export default function UnitLedgerNewFormRHF({
  onSave,
  onClose,
  formId = 'unit-ledger-new-form',
  unitId,
  unitNamePreset,
  yearMonth,
  closingBalance,
  defaultDate,
  defaultType,
  defaultAmount,
  defaultPaymentMethod,
  defaultDescription,
  defaultComments,
  postToApi = true,
}) {

  // Compute hidden txn_date: 2nd day of the month following yearMonth (or today if missing)
  const computeSecondOfNextFrom = (baseISO) => {
    try {
      const base = new Date(baseISO + 'T00:00:00Z');
      const y = base.getUTCFullYear();
      const m = base.getUTCMonth();
      const firstOfNext = new Date(Date.UTC(m === 11 ? y + 1 : y, (m + 1) % 12, 1));
      const secondOfNext = new Date(firstOfNext.getTime() + 24 * 60 * 60 * 1000);
      return secondOfNext.toISOString().slice(0, 10);
    } catch (e) {
      return new Date().toISOString().slice(0, 10);
    }
  };
  const baseYM = (yearMonth && yearMonth.length >= 7) ? `${yearMonth}-01` : new Date().toISOString().slice(0, 10);
  const policyDefaultDate = computeSecondOfNextFrom(baseYM);

  const methods = useForm({
    defaultValues: {
      date: defaultDate || new Date().toISOString().slice(0, 10),
      txn_date: policyDefaultDate,
      entryType: defaultType || 'O2 Payment',
      amount: defaultAmount || '',
      paymentMethod: defaultPaymentMethod || 'Transfer',
      description: defaultDescription || '',
      comments: defaultComments || '',
      doc1: null,
      unitName: unitNamePreset || '',
    },
  });

  const { setValue, handleSubmit, watch } = methods;

  // Ensure unitId and unitName are set
  React.useEffect(() => {
    if (unitId != null) {
      setValue('unit', Number(unitId), { shouldDirty: false, shouldValidate: true });
    }
    if (unitNamePreset != null) {
      setValue('unitName', String(unitNamePreset), { shouldDirty: false, shouldValidate: false });
    }
  }, [unitId, unitNamePreset, setValue]);

  React.useEffect(() => {
    const newPolicy = computeSecondOfNextFrom(baseYM);
    setValue('txn_date', newPolicy, { shouldDirty: false, shouldValidate: true });
  }, [yearMonth]);

  // Submit handler
  const onSubmit = async (data) => {
    const amountStr = String(data.amount ?? '').replace(',', '.');
    const amountBase = amountStr === '' ? null : Number(amountStr);
    const isO2Payment = String(data.entryType || '').toLowerCase() === 'o2 payment';
    let amountNum = amountBase;
    if (amountBase != null && !Number.isNaN(amountBase)) {
      amountNum = isO2Payment ? -Math.abs(amountBase) : Math.abs(amountBase);
    }
    const entryTypeCode = isO2Payment ? 'O2_PAYMENT' : 'CLIENT_PAYMENT';

    // Normalize target report period (YYYY-MM): prefer prop yearMonth, else from chosen date
    const normalizedYM = (() => {
      const fromProp = (typeof yearMonth === 'string' && yearMonth.length >= 7) ? yearMonth.slice(0, 7) : '';
      if (fromProp) return fromProp;
      const fromDate = data.date ? String(data.date).slice(0, 7) : '';
      return fromDate;
    })();

    // File handling
    const readFileAsDataURL = (file) =>
      new Promise((resolve, reject) => {
        try {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        } catch (e) {
          resolve(null);
        }
      });
    const resolveFile = (input) => {
      if (!input) return null;
      if (input instanceof File) return input;
      if (Array.isArray(input)) return input[0] instanceof File ? input[0] : null;
      if (typeof input === 'object') {
        if (input.file instanceof File) return input.file;
        if (input.files && input.files[0] instanceof File) return input.files[0];
        if (input[0] instanceof File) return input[0];
        if (input.value instanceof File) return input.value;
      }
      return null;
    };
    const file = resolveFile(data.doc1);
    let fileBase64 = null;
    let fileName = null;
    if (file) {
      const dataUrl = await readFileAsDataURL(file);
      if (typeof dataUrl === 'string') {
        const commaIdx = dataUrl.indexOf(',');
        fileBase64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : null;
      }
      fileName = file.name || 'payment-proof';
    }

    const payload = {
      unitId: data.unit ? Number(data.unit) : (unitId ? Number(unitId) : null),
      yearMonth: normalizedYM,
      yearmonth: normalizedYM,
      ym: normalizedYM,
      // Record the actual payment date on the ledger row
      txn_date: data.date || policyDefaultDate,
      amount: amountNum == null || Number.isNaN(amountNum) ? null : Number(amountNum).toFixed(2),
      paymentMethod: data.paymentMethod || 'Transfer',
      entryType: entryTypeCode,
      reference: data.description || '',
      note: data.comments || '',
      closingBalance: (closingBalance != null) ? Number(closingBalance) : null,
    };

    let result = payload;
    if (postToApi) {
      try {
        const res = await api.post('/api/unit-monthly/payment', payload);
        result = res.data || payload;

        // Try to extract the created ledger id from different possible shapes
        const ledgerIdFromResult =
          (res?.data?.id && Number(res.data.id)) ||
          (res?.data?.ledgerId && Number(res.data.ledgerId)) ||
          (res?.data?.ledger?.id && Number(res.data.ledger.id)) ||
          (res?.data?.data?.id && Number(res.data.data.id)) ||
          null;

        const docRaw = res?.data?.document ?? res?.data?.doc ?? res?.data?.unitDocument ?? null;
        const createdDoc = (docRaw && (docRaw.id != null || docRaw.url || docRaw.publicUrl || docRaw.s3Url)) ? docRaw : null;
        console.debug('Payment response doc check:', { ledgerIdFromResult, createdDoc });

        // If there's a file to upload and we have the ledger id, upload via UnitDocumentUploadController
        if (file && ledgerIdFromResult && !createdDoc) {
          try {
            const fd = new FormData();
            const unitForDoc = data.unit ? Number(data.unit) : (unitId ? Number(unitId) : null);
            if (unitForDoc != null) fd.append('unit', String(unitForDoc));
            fd.append('ledger', String(ledgerIdFromResult));
            fd.append('category', 'Report Payment');
            const ym = yearMonth || (data.date ? String(data.date).slice(0, 7) : '');
            const desc = ym ? `Report Payment ${ym}` : 'Report Payment';
            fd.append('description', desc);
            // Use the report period for file naming (YYMM), not the payment date
            const ymForName = (normalizedYM && normalizedYM.length >= 7) ? normalizedYM.slice(0, 7) : (data.date ? String(data.date).slice(0, 7) : '');
            const dateForNameIso = ymForName ? `${ymForName}-01` : (data.date || policyDefaultDate);
            fd.append('dateForName', String(dateForNameIso));
            fd.append('document', file, file.name || 'payment-proof');

            const docRes = await api.post('/api/unit-documents/upload', fd, {
              headers: { 'Content-Type': 'multipart/form-data' },
            });

            if (docRes?.data?.document) {
              result.document = docRes.data.document;
            }
          } catch (uploadErr) {
            console.error('Payment saved, but document upload failed:', uploadErr);
            result.uploadError = true;
          }
        }
      } catch (e) {
        console.error('Create unit monthly payment failed:', e);
        alert('Could not record the payment. Please try again.');
        return;
      }
    }

    if (result.uploadError) {
      toast.warn('Payment saved. File upload failed', {
        style: { backgroundColor: '#FF9800', color: '#fff' },
        autoClose: 1000,
        hideProgressBar: true,
        closeOnClick: true,
        pauseOnHover: false,
        draggable: false,
      });
    } else {
      toast.success('Payment saved', {
        style: { backgroundColor: '#009688', color: '#fff' },
        autoClose: 1000,
        hideProgressBar: true,
        closeOnClick: true,
        pauseOnHover: false,
        draggable: false,
      });
    }

    if (typeof onSave === 'function') onSave(result);
    if (typeof onClose === 'function') onClose();
  };

  return (
    <RHFForm methods={methods} onSubmit={handleSubmit(onSubmit)} formId={formId}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, p: 2 }}>
        <input type="hidden" name="unit" value={watch('unit') ?? ''} />
        <input type="hidden" name="txn_date" value={watch('txn_date') ?? ''} />
        <RHFTextField name="unitName" label="Unit" widthVariant="full" disabled defaultValue={unitNamePreset} />
        <RHFDatePicker name="date" label="Date" widthVariant="full" />
        <RHFSelect
          name="entryType"
          label="Entry Type"
          options={[
            { value: 'O2 Payment', label: 'O2 Payment' },
            { value: 'Client Payment', label: 'Client Payment' },
          ]}
          widthVariant="full"
          disabled
        />
        <RHFTextField name="amount" label="Amount" widthVariant="half" />
        <RHFSelect
          name="paymentMethod"
          label="Payment Method"
          options={[
            { value: 'Transfer', label: 'Transfer' },
            { value: 'Cash', label: 'Cash' },
          ]}
          widthVariant="half"
        />
        <RHFTextField name="description" label="Reference" widthVariant="full" />
        <RHFTextField name="comments" label="Note" widthVariant="full" multiline minRows={2} />
        <RHFFile name="doc1" label="Payment Proof" accept=".pdf,.jpg,.jpeg,.png" widthVariant="half" />
      </Box>
    </RHFForm>
  );
}

UnitLedgerNewFormRHF.propTypes = {
  onSave: PropTypes.func,
  onClose: PropTypes.func,
  formId: PropTypes.string,
  unitId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  unitNamePreset: PropTypes.string,
  yearMonth: PropTypes.string,
  closingBalance: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  defaultDate: PropTypes.string,
  defaultType: PropTypes.string,
  defaultAmount: PropTypes.string,
  defaultPaymentMethod: PropTypes.string,
  defaultDescription: PropTypes.string,
  defaultComments: PropTypes.string,
  postToApi: PropTypes.bool,
};