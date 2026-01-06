import React, { useState, useEffect, useMemo } from 'react';
import api from '../api';
import NewUnitTransactionForm from '../components/forms/NewUnitTransactionForm';
import PageScaffold from '../components/layout/PageScaffold';

const Reports = () => {
  const [activeTab, setActiveTab] = useState('hoa');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedService, setSelectedService] = useState(''); // default blank
  const [reportGenerated, setReportGenerated] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState(null);
  const [tableRows, setTableRows] = useState([]);
  const [autoFetchEnabled, setAutoFetchEnabled] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [showPreview, setShowPreview] = useState(false);


  // Fetch expected payments report from new endpoint
  const fetchReport = async () => {
    try {
      const response = await api.get('/api/reports/expected-payments', {
        params: { service: selectedService, month: selectedMonth, year: selectedYear },
      });
      const data = response.data || {};
      // API Platform JSON-LD can wrap collections; handle both plain and JSON-LD
      const top = Array.isArray(data) ? (data[0] || {}) : data;
      // Prefer JSON-LD member array, else plain .items
      const payload = Array.isArray(top.member) ? (top.member[0] || {}) : top;
      const items = Array.isArray(payload.items) ? payload.items : [];
      // Optional: sort by sortTs ascending if present
      const sorted = items.slice().sort((a, b) => (a.sortTs ?? 0) - (b.sortTs ?? 0));
      setTableRows(sorted);
      setReportGenerated(true);
    } catch (error) {
      console.error('Error fetching expected payments report:', error);
    }
  };

  const buildPreviewHtml = () => {
    const svc = (selectedService || '').toUpperCase();
    const title = `Expected Payments – ${selectedService || ''}`;
    const period = `${selectedMonth}/${selectedYear}`;
    const logoUrl = 'http://13.58.201.248/img/company-logo.png';
    const escape = (v) => (v == null ? '' : String(v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;'));

    const ths = [
      '<th>Unit</th>',
      ...(svc === 'HOA' ? ['<th>Banco</th>','<th>Nombre</th>','<th>Cuenta</th>','<th>Monto</th>'] : []),
      ...(svc === 'INTERNET' || svc === 'CFE' ? ['<th>Proveedor</th>','<th>Referencia</th>'] : []),
      ...(svc === 'INTERNET' ? ['<th>Monto</th>'] : []),
      ...(svc === 'AGUAKAN' ? ['<th>Referencia</th>'] : []),
      ['<th>Fecha de Pago</th>']
    ].flat().join('');

    const trs = (tableRows || []).map((row) => {
      const tds = [
        `<td>${escape(row.unitName)}</td>`,
        ...(svc === 'HOA' ? [
          `<td>${escape(row.banco)}</td>`,
          `<td>${escape(row.nombre)}</td>`,
          `<td>${escape(row.cuenta)}</td>`,
          `<td>${escape(row.hoa_amount)}</td>`,
        ] : []),
        ...(svc === 'INTERNET' || svc === 'CFE' ? [
          `<td>${escape(row.banco ?? row.proveedor)}</td>`,
          `<td>${escape(row.nombre ?? row.referencia)}</td>`,
        ] : []),
        ...(svc === 'INTERNET' ? [
          `<td>${escape(row.monto)}</td>`,
        ] : []),
        ...(svc === 'AGUAKAN' ? [
          `<td>${escape(row.nombre)}</td>`,
        ] : []),
        `<td>${escape(row.fechaPago ?? row.fechaPagoIso)}</td>`,
      ].flat().join('');
      return `<tr>${tds}</tr>`;
    }).join('');

    const emptyRow = `<tr><td colspan="8" style="text-align:center;color:#666">No data</td></tr>`;

    const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escape(title)} – ${escape(period)}</title>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin:24px;color:#111}
  h1{margin:0 0 8px 0;font-size:20px}
  .meta{margin:0 0 16px 0;color:#666}
  table{width:100%;border-collapse:collapse}
  th,td{border-bottom:1px solid #e5e5e5;padding:8px;text-align:left;font-size:12px}
  thead th{border-bottom:2px solid #ccc}
  @media print {
    @page { margin: 12mm; }
  }
  header.report-header { display:flex; align-items:center; gap:12px; margin-bottom:16px; }
  header.report-header img { height: 28px; }
  header.report-header .meta { color:#666; font-size:12px; }
</style>
</head>
<body>
  <header class="report-header">
    <img src="${logoUrl}" alt="Logo" />
    <div>
      <h1 style="margin:0 0 4px 0;font-size:20px">${escape(title)}</h1>
      <div class="meta">Period: ${escape(period)}</div>
    </div>
  </header>
  <table>
    <thead><tr>${ths}</tr></thead>
    <tbody>${trs || emptyRow}</tbody>
  </table>
</body>
</html>`;
    return html;
  };

  const handlePreview = () => {
    if (!selectedService) return;
    // Build absolute backend URL (avoid the React dev server port 3000)
    const backendBase = (process.env.REACT_APP_BACKEND_BASE && process.env.REACT_APP_BACKEND_BASE.trim())
      ? process.env.REACT_APP_BACKEND_BASE.trim().replace(/\/$/, '')
      : `${window.location.protocol}//${window.location.hostname}`; // e.g. http://13.58.201.248

    const url = `${backendBase}/reports/expected-payments/export.pdf?service=${encodeURIComponent(selectedService)}&month=${selectedMonth}&year=${selectedYear}`;
    setPreviewUrl(url);
    setShowPreview(true);
  };

  const closePreview = () => {
    try {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    } catch (_) {}
    setShowPreview(false);
    setPreviewUrl('');
  };

  const handlePrint = () => {
    // Prefer opening the current preview URL in a new tab (browser PDF viewer → Print)
    if (previewUrl) {
      window.open(previewUrl, '_blank', 'noopener');
      return;
    }
    if (!selectedService) return;

    // Build absolute backend URL (avoid the React dev server port 3000)
    const backendBase = (process.env.REACT_APP_BACKEND_BASE && process.env.REACT_APP_BACKEND_BASE.trim())
      ? process.env.REACT_APP_BACKEND_BASE.trim().replace(/\/$/, '')
      : `${window.location.protocol}//${window.location.hostname}`; // e.g. http://13.58.201.248

    const url = `${backendBase}/reports/expected-payments/export.pdf?service=${encodeURIComponent(selectedService)}&month=${selectedMonth}&year=${selectedYear}`;
    window.open(url, '_blank', 'noopener');
  };




  // Auto refresh when the user changes Service/Month/Year (but not on initial load)
  useEffect(() => {
    if (autoFetchEnabled) {
      fetchReport();
    }
  }, [selectedService, selectedMonth, selectedYear, autoFetchEnabled]);

  // Lock body scroll when preview is open
  useEffect(() => {
    if (showPreview) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [showPreview]);


  const openDrawerForRow = (row) => {
    setSelectedRow(row);
    setDrawerOpen(true);
  };
  const handlePaymentSaved = () => {
    setTableRows(prev =>
      prev.filter(r =>
        !(
          r.unitId === (selectedRow?.unitId) &&
          r.servicio === (selectedRow?.servicio) &&
          r.fechaPagoIso === (selectedRow?.fechaPagoIso)
        )
      )
    );
    setDrawerOpen(false);
    setSelectedRow(null);
  };

  const actionsHeader = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      {/* Tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 8 }}>
        <button onClick={() => setActiveTab('hoa')} className="btn btn-secondary">Services Payments</button>
        <button onClick={() => setActiveTab('client')} className="btn btn-secondary">Client Earnings</button>
        <button onClick={() => setActiveTab('ops')} className="btn btn-secondary">Owners2 Operations</button>
      </div>
      {/* Divider dot */}
      <span style={{ opacity: 0.35, userSelect: 'none' }}>•</span>
      {/* Filters */}
      <label style={{ marginRight: 4 }}>Service:</label>
      <select value={selectedService} onChange={e => { setSelectedService(e.target.value); setAutoFetchEnabled(true); }}>
        <option value="">-- Select Service --</option>
        {['Aguakan', 'CFE', 'HOA', 'Internet'].map(service => (
          <option key={service} value={service}>{service}</option>
        ))}
      </select>
      <label style={{ margin: '0 4px 0 8px' }}>Month:</label>
      <select value={selectedMonth} onChange={e => { setSelectedMonth(Number(e.target.value)); setAutoFetchEnabled(true); }}>
        {[
          'January', 'February', 'March', 'April', 'May', 'June',
          'July', 'August', 'September', 'October', 'November', 'December'
        ].map((m, idx) => (
          <option key={m} value={idx + 1}>{m}</option>
        ))}
      </select>
      <label style={{ margin: '0 4px 0 8px' }}>Year:</label>
      <select value={selectedYear} onChange={e => { setSelectedYear(Number(e.target.value)); setAutoFetchEnabled(true); }}>
        {[2022, 2023, 2024, 2025, 2026].map(y => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
      <button onClick={handlePreview} className="btn btn-primary" style={{ marginLeft: 8 }} disabled={tableRows.length === 0 || !selectedService}>
        Preview
      </button>
    </div>
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'hoa':
        return (
          <div>
            <h2>🏢 Services Payments</h2>
            <div style={{ marginTop: '1rem' }}>
              <h3>
                {selectedService === 'Internet'
                  ? 'Pagos de Internet'
                  : 'Expected Payments'}
                {' — '}
                {new Date(selectedYear, selectedMonth - 1, 1).toLocaleString(undefined, { month: 'long', year: 'numeric' })}
              </h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #ddd' }}>Unit Name</th>
                      {selectedService === 'Internet' && (
                        <>
                          <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #ddd' }}>Proveedor</th>
                          <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #ddd' }}>Referencia</th>
                        </>
                      )}
                      {(selectedService === 'Aguakan' || selectedService === 'CFE') && (
                        <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #ddd' }}>Referencia</th>
                      )}
                      {selectedService !== 'Internet' && selectedService !== 'Aguakan' && selectedService !== 'CFE' && (
                        <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #ddd' }}>Servicio</th>
                      )}
                      {selectedService === 'HOA' && (
                        <>
                          <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #ddd' }}>Banco</th>
                          <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #ddd' }}>Nombre</th>
                          <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #ddd' }}>Cuenta</th>
                          <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #ddd' }}>Monto</th>
                        </>
                      )}
                      <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #ddd' }}>Fecha de pago</th>
                      <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #ddd' }}>Pago</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.length === 0 ? (
                      <tr>
                        <td colSpan={
                          selectedService === 'Internet' ? 6 :
                          selectedService === 'HOA' ? 8 :
                          (selectedService === 'Aguakan' || selectedService === 'CFE') ? 4 : 4
                        } style={{ padding: '12px', textAlign: 'center', color: '#666' }}>No data</td>
                      </tr>
                    ) : (
                      tableRows.map((row) => (
                        <ExpectedPaymentRow
                          key={`${row.unitId || 'u'}-${row.servicio || 'svc'}-${row.fechaPagoIso || 'date'}`}
                          row={row}
                          selectedService={selectedService}
                          onOpenDrawer={openDrawerForRow}
                        />
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            {drawerOpen && (
              <>
                <div
                  onClick={() => { setDrawerOpen(false); setSelectedRow(null); }}
                  style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0,0,0,0.25)',
                    zIndex: 999
                  }}
                />
                <div
                  style={{
                    position: 'fixed',
                    top: 0,
                    right: 0,
                    width: 420,
                    height: '100vh',
                    background: '#fff',
                    boxShadow: 'rgba(0,0,0,0.2) -4px 0 12px',
                    zIndex: 1000,
                    display: 'flex',
                    flexDirection: 'column'
                  }}
                >
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong>Registrar pago</strong>
                    <button onClick={() => { setDrawerOpen(false); setSelectedRow(null); }}>✕</button>
                  </div>
                  <div style={{ padding: 16, overflowY: 'auto' }}>
                    <NewUnitTransactionForm
                      stayOnPage
                      unitId={selectedRow?.unitId}
                      defaultAmount={selectedRow?.hoa_amount ?? selectedRow?.monto}
                      defaultService={selectedRow?.servicio}
                      defaultDate={selectedRow?.fechaPagoIso}
                      onCancel={() => { setDrawerOpen(false); setSelectedRow(null); }}
                      onClose={() => { setDrawerOpen(false); setSelectedRow(null); }}
                      onSave={handlePaymentSaved}
                      onSaved={handlePaymentSaved}
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        );
      case 'client':
      case 'ops':
        return <div>🧾 Owners2 Operational Report (coming soon)</div>;
      default:
        return null;
    }
  };

  return (
    <PageScaffold
      layout="table"
      withCard
      title="Reports"
      stickyHeader={actionsHeader}
      headerPlacement="inside"
    >
      <div>{renderContent()}</div>
      {showPreview && previewUrl && (
        <div aria-modal="true" role="dialog" style={{ position: 'fixed', inset: 0, zIndex: 2000 }}>
          {/* Backdrop */}
          <div onClick={closePreview} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(1px)' }} />
          {/* Modal container */}
          <div style={{ position: 'relative', margin: '5vh auto', width: '92vw', maxWidth: 1200, height: '90vh', background: '#fff', borderRadius: 8, boxShadow: '0 10px 30px rgba(0,0,0,0.35)', overflow: 'hidden', border: '1px solid #ccc' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderBottom: '1px solid #eee', background: '#fafafa' }}>
              <strong>Report Preview</strong>
              <div>
                <button className="btn btn-primary" onClick={handlePrint} style={{ marginRight: 8 }}>Print</button>
                <button
                  className="btn btn-secondary"
                  onClick={closePreview}
                  aria-label="Close preview"
                  title="Close"
                  style={{ color: '#666', borderColor: '#ccc' }}
                >
                  X
                </button>
              </div>
            </div>
            <iframe
              title="report-preview"
              src={previewUrl}
              type="application/pdf"
              style={{ width: '100%', height: 'calc(100% - 44px)', border: '1px solid #eee', borderLeft: 0, borderRight: 0, borderBottom: 0 }}
            />
          </div>
        </div>
      )}
    </PageScaffold>
  );
};

export default Reports;
// Small functional component for rendering one expected payment row
const ExpectedPaymentRow = ({ row, selectedService, onOpenDrawer }) => (
  <tr style={{ backgroundColor: undefined }} data-component="ExpectedPaymentRow">
    <td style={{ padding: '8px', borderBottom: '1px solid #f0f0f0' }}>{row.unitName}</td>
    {selectedService === 'Internet' && (
      <>
        <td style={{ padding: '8px', borderBottom: '1px solid #f0f0f0' }}>{row.banco ?? row.proveedor ?? ''}</td>
        <td style={{ padding: '8px', borderBottom: '1px solid #f0f0f0' }}>{row.nombre ?? row.referencia ?? ''}</td>
      </>
    )}
    {(selectedService === 'Aguakan' || selectedService === 'CFE') && (
      <td style={{ padding: '8px', borderBottom: '1px solid #f0f0f0' }}>{row.nombre || ''}</td>
    )}
    {selectedService !== 'Internet' && selectedService !== 'Aguakan' && selectedService !== 'CFE' && (
      <td style={{ padding: '8px', borderBottom: '1px solid #f0f0f0' }}>{row.servicio}</td>
    )}
    {selectedService === 'HOA' && (
      <>
        <td style={{ padding: '8px', borderBottom: '1px solid #f0f0f0' }}>{row.banco || ''}</td>
        <td style={{ padding: '8px', borderBottom: '1px solid #f0f0f0' }}>{row.nombre || ''}</td>
        <td style={{ padding: '8px', borderBottom: '1px solid #f0f0f0' }}>{row.cuenta || ''}</td>
        <td style={{ padding: '8px', borderBottom: '1px solid #f0f0f0' }}>{row.hoa_amount || ''}</td>
      </>
    )}
    <td style={{ padding: '8px', borderBottom: '1px solid #f0f0f0' }}>{row.fechaPago}</td>
    <td style={{ padding: '8px', borderBottom: '1px solid #f0f0f0' }}>
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => onOpenDrawer(row)}
        aria-label="Registrar pago"
      >
        Pagar
      </button>
    </td>
  </tr>
);
ExpectedPaymentRow.displayName = 'ExpectedPaymentRow';