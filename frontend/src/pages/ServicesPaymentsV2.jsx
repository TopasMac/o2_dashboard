import React, { useMemo, useState, useEffect } from 'react';
import { Stack, FormControl, InputLabel, Select, MenuItem, Grid, Button } from '@mui/material';
import ServicePaymentsTable from '../components/common/ServicePaymentsTable';
import api from '../api';
import AppDrawer from '../components/common/AppDrawer';
import EmailSendDrawer from '../components/common/EmailSendDrawer';
import UnitTransactionNewFormRHF from '../components/forms/UnitTransactionNewFormRHF';
import PreviewOverlay from '../components/layouts/PreviewOverlay';
import PageScaffold from '../components/layout/PageScaffold';
import YearMonthPicker from '../components/layout/components/YearMonthPicker';

/**
 * ServicesPaymentsV2
 * Step 1 scaffold: render four service sections using the reusable ServicePaymentsTable.
 * - Static rows only (no API yet)
 * - Shared columns definition
 * - Simple handlers for Mark Paid / Send Email (to be wired next)
 */
export default function ServicesPaymentsV2() {
  // --- Local state for future drawer/modals (placeholder for now) ---
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [actionState, setActionState] = useState({ open: false, action: null, serviceKey: null, row: null });

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [formPrefill, setFormPrefill] = useState(null);
  const [statusRefreshTick, setStatusRefreshTick] = useState(0);
  // Email drawer state
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailDefaults, setEmailDefaults] = useState(null);
  const [emailDrawerKey, setEmailDrawerKey] = useState(0);


  const [svcCategoryId, setSvcCategoryId] = useState(null);

  useEffect(() => {
    let ignore = false;
    const fetchCategories = async () => {
      try {
        const { data } = await api.get('/api/transaction_categories?pagination=false');
        if (!ignore && data && Array.isArray(data)) {
          const found = data.find(item => (item.label || item.name || '').toString().toLowerCase() === 'pago de servicios');
          setSvcCategoryId(found ? found.id || found.value || null : null);
        }
      } catch {
        if (!ignore) setSvcCategoryId(null);
      }
    };
    fetchCategories();
    return () => { ignore = true; };
  }, []);

  const handleMarkPaid = (row, serviceKey) => {
    const svcLabel = (row.service || serviceKey || '').toString().trim();
    const normalizedSvc =
      svcLabel.toLowerCase() === 'agua' || svcLabel.toLowerCase() === 'water' ? 'Aguakan' :
      svcLabel.toLowerCase() === 'cfe' ? 'CFE' :
      svcLabel.toLowerCase() === 'internet' ? 'Internet' :
      svcLabel.toLowerCase() === 'hoa' ? 'HOA' :
      (svcLabel || 'Service');

    const prefill = {
      unitId: row.unitId ?? '',
      defaultService: normalizedSvc,
      defaultAmount: (() => {
        const val = row.amount ?? row.monto ?? row.hoa_amount ?? null;
        return (val == null ? undefined : String(val));
      })(),
      defaultDate: (row.paymentDate || '').slice(0, 10) || undefined,
    };
    setFormPrefill(prefill);
    setDrawerOpen(true);
  };

  const handleSendEmail = async (row, serviceKey) => {
    try {
      // Compose basics
      const ym = `${year}-${String(month).padStart(2, '0')}`;
      const unitId = row.unitId ?? undefined;
      const serviceName = (row.serviceDisplay || row.service || serviceKey || '').toString();
      const transactionId = row.paidTransactionId || row.transaction_id || undefined;

      // Try to extract a known receipt URL for attachment preview (will still be resolved server-side if absent)
      const apiKeyForStatus = row.service === 'Aguakan' ? 'Water' : row.service;
      const s3UrlFromStatus =
        unitId && paymentStatus && paymentStatus[unitId] && paymentStatus[unitId][apiKeyForStatus]
          ? paymentStatus[unitId][apiKeyForStatus].s3_url || null
          : null;

      // Ask backend to render the exact subject/body (includes signature)
      const { data } = await api.post('/api/email-preview/service-payment', {
        unitId,
        clientId: undefined,
        transactionId,
        yearMonth: ym,
        serviceName,
        to: row.hoaEmail || undefined,
      });

      const preview = data?.preview || {};
      const to = preview.to || row.hoaEmail || '';
      const cc = preview.cc || '';
      const subject = preview.subject || '';
      const htmlBody = preview.htmlBody || '';

      const attachments = [];
      if (s3UrlFromStatus) {
        attachments.push({
          name: `Owners2_${unitId}_${ym}_service.pdf`,
          url: s3UrlFromStatus
        });
      }

      setEmailDefaults({
        category: 'SERVICE_PAYMENT',
        unitId,
        clientId: undefined,
        transactionId,
        yearMonth: ym,
        serviceName,
        to,
        toEmail: to,
        cc,
        ccEmail: cc,
        subject,
        htmlBody,
        attach: attachments.length > 0,
        attachments,
        s3_url: s3UrlFromStatus || undefined,
      });
      setEmailDrawerKey(k => k + 1);
      setEmailOpen(true);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('Failed to build service-payment email preview:', err);
    }
  };

  const handleEmailClose = () => { setEmailOpen(false); setEmailDefaults(null); };
  const handleEmailSent = () => {
    setEmailOpen(false);
    setEmailDefaults(null);
    setStatusRefreshTick(t => t + 1);
  };
  const handleEmailSubmit = async (values) => {
    try {
      const payload = {
        // Envelope
        to: values.to || values.toEmail || '',
        cc: values.cc || values.ccEmail || undefined,
        bcc: 'guest_services@owners2.com',
        subject: values.subject || '',
        // Identifiers
        unitId: values.unitId ?? emailDefaults?.unitId,
        clientId: values.clientId ?? emailDefaults?.clientId,
        transactionId: emailDefaults?.transactionId,
        yearMonth: emailDefaults?.yearMonth,
        serviceName: emailDefaults?.serviceName,
        // Category + behavior
        category: 'SERVICE_PAYMENT',
        attach: true,
        language: (values.language || 'es'),
        // Attachment hint (single) — backend will auto-resolve if missing
        s3_url: values.s3_url || (Array.isArray(values.attachments) && values.attachments[0]?.url) || emailDefaults?.s3_url || undefined,
        // IMPORTANT: do not send htmlBody or attachments array → let backend template + dispatcher handle it
      };

      await api.post('/api/service-payment/email', payload);
      handleEmailSent();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('Service payment email send failed:', err);
    }
  };

  const handleFormClose = () => {
    setDrawerOpen(false);
    setFormPrefill(null);
  };
  const handleFormSaved = () => {
    setDrawerOpen(false);
    setFormPrefill(null);
    setStatusRefreshTick(t => t + 1); // trigger status refetch
  };


  const handlePreviewClick = async () => {
    if (!canPreview) return;
    const svc = (serviceFilter || 'HOA').toString().toUpperCase();
    try {
      // Fetch PDF bytes
      const { data } = await api.get('/api/reports/services-payments/export.pdf', {
        params: { service: svc, month: String(month).padStart(2, '0'), year: String(year) },
        responseType: 'arraybuffer',
      });
      // Create/revoke blob URL
      const blob = new Blob([data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      // Revoke previous URL if any
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(url);
      setPreviewOpen(true);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('Failed to load services payments PDF:', err);
    }
  };
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  // --- Columns shared across sections ---
  const columns = useMemo(
    () => [
      { header: 'Unit', accessor: 'unitName', width: 120 },
      { header: 'Service', accessor: 'serviceDisplay', width: 180 },
      { header: 'Payment Date', accessor: 'paymentDate', type: 'date', width: 110 },
      { header: 'Reference', accessor: 'reference', width: 250 },
      { header: 'Amount', accessor: 'amount', type: 'currency', width: 90, align: 'center' },
    ],
    []
  );

  const cfeColumns = useMemo(() =>
    columns.map(col => col.accessor === 'unitName' ? { ...col, width: 120 } : col)
  , [columns]);

  const aguakanColumns = useMemo(() =>
    columns.map(col => col.accessor === 'unitName' ? { ...col, width: 120 } : col)
  , [columns]);

  const hoaColumns = useMemo(() =>
    columns.map(col => {
      if (col.accessor === 'unitName') return { ...col, width: 120 };
      if (col.accessor === 'reference') return { ...col, width: 250 };
      if (col.accessor === 'paymentDate') return { ...col, width: 110 };
      if (col.accessor === 'amount') return { ...col, width: 90 };
      return col;
    })
  , [columns]);

  // --- CFE rows (live via API) ---
  const [cfeRows, setCfeRows] = useState([]);

  // Default month/year = current month/year in local time
  const now = useMemo(() => new Date(), []);
  const defaultMonth = now.getMonth() + 1; // 1-12
  const defaultYear = now.getFullYear();

  const [year, setYear] = useState(defaultYear);
  const [month, setMonth] = useState(defaultMonth);
  const [serviceFilter, setServiceFilter] = useState('all'); // 'all' | 'CFE' | 'Aguakan' | 'HOA' | 'Internet'
  useEffect(() => {
    try {
      localStorage.setItem('svcFilter', serviceFilter);
    } catch {}
  }, [serviceFilter]);

  const canPreview = useMemo(
    () => serviceFilter === 'HOA' && Number.isInteger(month) && Number.isInteger(year),
    [serviceFilter, month, year]
  );

  // Helper: map API item → table row shape expected by ServicePaymentsTable
  const mapPaymentItem = (item) => {
    const serviceKey = (item.servicio || 'cfe').toString().toLowerCase();
    const ref = item.nombre || item.reference || '';
    const date = item.fechaPagoIso || item.fechaPago || item.paymentDate || '';
    const amtRaw =
      item.hoa_amount ??
      item.monto ??
      item.amount ??
      null;

    return {
      id: item.id || `${serviceKey}-${ref || Math.random().toString(36).slice(2, 8)}`,
      unitId: item.unitId || item.unit_id || undefined,
      unitName: item.unitName || item.unit_name || '',
      provider: item.provider || undefined,
      bank: item.banco || item.bank || undefined,
      account: item.cuenta || item.account || undefined,
      hoaEmail: item.hoaEmail || item.hoa_email || '',
      service: (item.service || item.servicio || undefined),
      serviceDisplay: (() => {
        const svc = (item.service || item.servicio || '').toString();
        const prov = (item.provider || item.banco || '').toString();
        if (!svc) return undefined;
        // Show provider only for Internet
        if (svc.toLowerCase() === 'internet') {
          return prov ? `${svc} · ${prov}` : svc;
        }
        return svc;
      })(),
      reference: ref,
      paymentDate: date,
      amount: amtRaw === null || amtRaw === undefined ? null : Number(amtRaw),
      // Backend enrichment (optional fields if provided by API)
      paid: Boolean(item.paid ?? item.isPaid ?? item.paidThisMonth),
      emailed: Boolean(item.emailed ?? item.isEmailed ?? false),
      paidTransactionId: item.paidTransactionId || item.transaction_id || undefined,
      paidDate: item.paidDate || item.paid_date || undefined,
    };
  };

  // --- Bulk expected payments (CFE, Aguakan, HOA, Internet) ---
  React.useEffect(() => {
    let ignore = false;
    const fetchAll = async () => {
      try {
        const ym = `${year}-${String(month).padStart(2, '0')}`;
        const { data } = await api.get('/api/services/expected-payments/bulk', { params: { yearMonth: ym } });
        const svc = data?.services || {};
        const cfe = Array.isArray(svc?.CFE?.items) ? svc.CFE.items : (Array.isArray(svc?.CFE) ? svc.CFE : []);
        const agua = Array.isArray(svc?.Water?.items) ? svc.Water.items : (Array.isArray(svc?.Water) ? svc.Water : []);
        const hoa = Array.isArray(svc?.HOA?.items) ? svc.HOA.items : (Array.isArray(svc?.HOA) ? svc.HOA : []);
        const internet = Array.isArray(svc?.Internet?.items) ? svc.Internet.items : (Array.isArray(svc?.Internet) ? svc.Internet : []);

        if (!ignore) {
          setCfeRows(cfe.map(mapPaymentItem));
          setAguakanRows(agua.map(mapPaymentItem));
          setHoaRows(hoa.map(mapPaymentItem));
          setInternetRows(internet.map(mapPaymentItem));
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('Failed to load expected payments (bulk):', err);
        if (!ignore) {
          setCfeRows([]); setAguakanRows([]); setHoaRows([]); setInternetRows([]);
        }
      }
    };
    fetchAll();
    return () => { ignore = true; };
  }, [month, year]);

  const [internetRows, setInternetRows] = useState([]);

  const [aguakanRows, setAguakanRows] = useState([]);

  const [hoaRows, setHoaRows] = useState([]);

  const [paymentStatus, setPaymentStatus] = useState({});

  useEffect(() => {
    let ignore = false;
    const fetchStatuses = async () => {
      try {
        const unitIds = new Set();
        [cfeRows, aguakanRows, hoaRows, internetRows].forEach(list => {
          list.forEach(r => { if (r.unitId) unitIds.add(r.unitId); });
        });
        const ids = Array.from(unitIds);
        if (ids.length === 0) {
          if (!ignore) setPaymentStatus({});
          return;
        }
        const ym = `${year}-${String(month).padStart(2, '0')}`;
        try {
          const { data } = await api.get('/api/service-payment-check/bulk', {
            params: { yearMonth: ym, unitId: ids.join(',') },
          });
          if (!ignore) {
            const map = {};
            if (data && typeof data === 'object') {
              ids.forEach((uid) => {
                const payload = data[String(uid)] || data[uid] || null;
                map[uid] = payload ? (payload.paidDetailsThisMonth || null) : null;
              });
            }
            setPaymentStatus(map);
          }
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn('bulk payment-check failed', e);
          if (!ignore) setPaymentStatus({});
        }
      } catch (e) {
        if (!ignore) setPaymentStatus({});
      }
    };
    fetchStatuses();
    return () => { ignore = true; };
  }, [cfeRows, aguakanRows, hoaRows, internetRows, month, year, statusRefreshTick]);

  const allRows = useMemo(() => {
    const tag = (rows, serviceLabel) =>
      rows.map(r => {
        const status = r.unitId ? paymentStatus[r.unitId] : null;
        const apiKey = serviceLabel === 'Aguakan' ? 'Water' : serviceLabel;
        const paidDetail = status ? status[apiKey] : null;
        const paid = (r.paid === true) || (!!paidDetail);
        const emailed = (r.emailed === true) || (paidDetail && Number(paidDetail.email_event_id) > 0);
        const statusRank = emailed ? 2 : (paid ? 1 : 0); // 0 unpaid → 1 paid-not-emailed → 2 emailed

        return {
          ...r,
          service: serviceLabel,
          serviceDisplay: r.serviceDisplay || serviceLabel,
          amount: (serviceLabel === 'CFE' || serviceLabel === 'Aguakan') ? undefined : r.amount,
          // Merge backend status
          paid,
          paidDate: r.paidDate ?? (paidDetail ? paidDetail.date : undefined),
          paidTransactionId: r.paidTransactionId ?? (paidDetail ? paidDetail.id : undefined),
          emailed,
          // UI hints for sorting only
          _statusRank: statusRank,
        };
      });
    const merged = [
      ...tag(cfeRows, 'CFE'),
      ...tag(aguakanRows, 'Aguakan'),
      ...tag(hoaRows, 'HOA'),
      ...tag(internetRows, 'Internet'),
    ];
    // Sort by _statusRank first, then Payment Date (assumes ISO-like or dd-mm-yyyy; handle both)
    const parse = (d) => {
      if (!d) return new Date(0);
      // try ISO first
      const iso = Date.parse(d);
      if (!Number.isNaN(iso)) return new Date(iso);
      // fallback dd-mm-yyyy
      const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(d);
      if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
      return new Date(0);
    };
    return merged.sort((a, b) => {
      const ra = a._statusRank ?? 0;
      const rb = b._statusRank ?? 0;
      if (ra !== rb) return ra - rb; // unpaid (0) → paid-not-emailed (1) → emailed (2)
      return parse(a.paymentDate) - parse(b.paymentDate);
    });
  }, [cfeRows, aguakanRows, hoaRows, internetRows, paymentStatus]);

  const filteredRows = useMemo(() => {
    if (serviceFilter === 'all') return allRows;
    return allRows.filter(r => r.service === serviceFilter);
  }, [allRows, serviceFilter]);

  const ymValue = useMemo(() => `${year}-${String(month).padStart(2, '0')}`, [year, month]);
  const handleYearMonthChange = (ym) => {
    if (!ym) return;
    const [nextYear, nextMonth] = ym.split('-');
    const yNum = Number(nextYear);
    const mNum = Number(nextMonth);
    if (Number.isInteger(yNum) && Number.isInteger(mNum)) {
      setYear(yNum);
      setMonth(mNum);
    }
  };

  const stickyHeader = (
    <Stack
      direction={{ xs: 'column', md: 'row' }}
      spacing={2}
      sx={{ flexWrap: 'wrap', alignItems: { md: 'center' }, pt: 1.8, pl: 2 }}
    >
      <FormControl size="small" sx={{ minWidth: 120, maxWidth: 200 }}>
        <InputLabel id="service-select-label">Service</InputLabel>
        <Select
          labelId="service-select-label"
          value={serviceFilter}
          label="Service"
          onChange={(e) => setServiceFilter(e.target.value)}
        >
          <MenuItem value="all">All</MenuItem>
          <MenuItem value="CFE">CFE</MenuItem>
          <MenuItem value="Aguakan">Aguakan</MenuItem>
          <MenuItem value="HOA">HOA</MenuItem>
          <MenuItem value="Internet">Internet</MenuItem>
        </Select>
      </FormControl>
      <YearMonthPicker
        value={ymValue}
        onChange={handleYearMonthChange}
        label="Period"
        sx={{ minWidth: 235 }}
      />
      <Button
        onClick={handlePreviewClick}
        disabled={!canPreview}
        variant="outlined"
        sx={{
          textTransform: 'none',
          borderWidth: 2,
          '&:hover': { borderWidth: 2 },
          color: (theme) => (canPreview ? '#1E6F68' : theme.palette.text.disabled),
          borderColor: (theme) => (canPreview ? '#1E6F68' : theme.palette.action.disabledBackground),
          backgroundColor: '#fff',
          height: 36,
        }}
      >
        Report Preview
      </Button>
    </Stack>
  );

  return (
    <PageScaffold
      sectionKey="transactions"
      currentPath="/services-payments"
      layout="standard"
      stickyHeader={stickyHeader}
    >
      <Stack spacing={3}>
        <Grid container spacing={3} sx={{ width: '100%' }}>
          <Grid item xs={12}>
            <ServicePaymentsTable
              title="Month Payments"
              serviceKey="all"
              rows={filteredRows}
              columns={columns}
              onMarkPaid={handleMarkPaid}
              onSendEmail={handleSendEmail}
              containerWidth="fit-content"
              widthScale={1}
              dense
              actionsWidth={90}
              actionsHeaderAlign="center"
              bodyMaxHeight="61vh"
            />
          </Grid>
        </Grid>
      </Stack>

      <AppDrawer
        open={drawerOpen}
        onClose={handleFormClose}
        title="Mark Service as Paid"
        showActions
        formId="unit-tx-form"
        actions={{ saveLabel: 'Save', cancelLabel: 'Cancel', showDelete: false }}
      >
        {drawerOpen && (
          <UnitTransactionNewFormRHF
            formId="unit-tx-form"
            unitId={formPrefill?.unitId}
            defaultService={formPrefill?.defaultService}
            defaultAmount={formPrefill?.defaultAmount}
            defaultDate={formPrefill?.defaultDate}
            transactionCategoryId={svcCategoryId}
            costCenter="Client"
            noDropdowns
            onSave={handleFormSaved}
            onCancel={handleFormClose}
            onClose={handleFormClose}
          />
        )}
      </AppDrawer>

      <PreviewOverlay
        open={previewOpen}
        onClose={() => { setPreviewOpen(false); }}
        title={`Services Payments PDF — ${serviceFilter || 'HOA'} ${String(month).padStart(2, '0')}/${year}`}
      >
        {previewOpen && previewUrl && (
          <iframe
            title="Services Payments PDF"
            src={previewUrl}
            style={{ width: '100%', height: '100%', border: 'none' }}
          />
        )}
      </PreviewOverlay>

      {/* Send Email Drawer for Service Payments */}
      <EmailSendDrawer
        key={emailDrawerKey}
        open={emailOpen}
        onClose={handleEmailClose}
        initialValues={emailDefaults}
        onSubmit={handleEmailSubmit}
      />
    </PageScaffold>
  );
}
