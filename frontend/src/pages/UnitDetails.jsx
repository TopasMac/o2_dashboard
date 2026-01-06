import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../api';
import ListPageLayout from '../components/layouts/ListPageLayout';
import { useIsMobile } from '../utils/breakpoints';
import { toJpeg } from 'html-to-image';
import { BuildingOfficeIcon, WifiIcon, MapPinIcon } from '@heroicons/react/24/solid';

// Helper to read either camelCase or snake_case
const pick = (obj, keys) => {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return undefined;
};

export default function UnitDetails({ unitId: unitIdProp }) {
  const params = useParams();
  const effectiveId = unitIdProp ?? (params ? params.id : undefined);
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [unit, setUnit] = useState(null);
  const [condo, setCondo] = useState(null);

  const cardRef = useRef(null);

  const googleMapsHref = useMemo(() => {
    const c = condo || {};
    return pick(c, ['googleMaps', 'google_maps']);
  }, [condo]);

  const handleShare = async () => {
    if (!cardRef.current) return;
    try {
      const dataUrl = await toJpeg(cardRef.current, { quality: 0.95, pixelRatio: 2 });
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      const file = new File([blob], 'unit-details.jpg', { type: 'image/jpeg' });

      const unitName = pick(unit || {}, ['unitName', 'unit_name']);
      const textParts = [];
      if (unitName) textParts.push(`Unit: ${unitName}`);
      if (googleMapsHref) textParts.push(`Google Maps: ${googleMapsHref}`);
      const shareText = textParts.join('\n');

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Unit Details', text: shareText });
      } else {
        // Fallback: download the image
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = 'unit-details.jpg';
        document.body.appendChild(a);
        a.click();
        a.remove();
        // WhatsApp Web fallback: open chat with the text so the link is clickable
        if (shareText) {
          const waUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
          window.open(waUrl, '_blank');
        }
      }
    } catch (err) {
      console.error('Share failed', err);
      alert('Unable to share on this device. The image will be downloaded instead.');
      try {
        const dataUrl = await toJpeg(cardRef.current, { quality: 0.95, pixelRatio: 2 });
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = 'unit-details.jpg';
        document.body.appendChild(a);
        a.click();
        a.remove();
        if (googleMapsHref) {
          const unitName = pick(unit || {}, ['unitName', 'unit_name']);
          const waText = `${unitName ? `Unit: ${unitName}\n` : ''}Google Maps: ${googleMapsHref}`;
          const waUrl = `https://wa.me/?text=${encodeURIComponent(waText)}`;
          window.open(waUrl, '_blank');
        }
      } catch (_) {}
    }
  };

  const buildShareText = () => {
    const unitName = pick(unit || {}, ['unitName', 'unit_name']);
    const parts = [];
    if (unitName) parts.push(`Unit: ${unitName}`);
    if (googleMapsHref) parts.push(`Google Maps: ${googleMapsHref}`);
    return parts.join('\n');
  };

  const handleShareWhatsApp = () => {
    const text = buildShareText();
    if (!text) return;
    const waUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(waUrl, '_blank');
  };

  // Derive condoId from unit payload in multiple shapes
  const condoId = useMemo(() => {
    if (!unit) return null;
    // Accept: unit.condo = IRI string "/api/condos/:id"
    const iri = pick(unit, ['condo', 'condoIri', 'condo_iri']);
    if (typeof iri === 'string' && iri.includes('/condos/')) {
      return iri.split('/').pop();
    }
    // Accept: embedded object with id or @id
    const condoObj = pick(unit, ['condo', 'condoName']);
    if (condoObj && typeof condoObj === 'object') {
      const viaId = pick(condoObj, ['id', 'condoId', 'condo_id']);
      if (viaId) return String(viaId);
      const viaIri = pick(condoObj, ['@id']);
      if (typeof viaIri === 'string' && viaIri.includes('/condos/')) return viaIri.split('/').pop();
    }
    // Accept: direct id fields
    const direct = pick(unit, ['condoId', 'condo_id']);
    return direct ? String(direct) : null;
  }, [unit]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        // 1) Load unit
        const uResp = await api.get(`/api/unit-details/${effectiveId}`);
        const uData = uResp.data || {};
        if (cancelled) return;
        setUnit(uData);

        // 2) Load condo if we can derive id
        let c = null;
        let cid = null;
        // Try to compute from fresh uData (not from state)
        const tryIri = pick(uData, ['condo', 'condoIri', 'condo_iri']);
        if (typeof tryIri === 'string' && tryIri.includes('/condos/')) {
          cid = tryIri.split('/').pop();
        } else {
          const cObj = pick(uData, ['condo', 'condoName']);
          if (cObj && typeof cObj === 'object') {
            cid = pick(cObj, ['id', 'condoId', 'condo_id']) || (typeof cObj['@id'] === 'string' && cObj['@id'].split('/').pop());
          } else {
            cid = pick(uData, ['condoId', 'condo_id']);
          }
        }
        if (cid) {
          try {
            const cResp = await api.get(`/api/condos/${cid}`);
            c = cResp.data || null;
          } catch (e) {
            // Fallback: try collection filter if direct fetch fails
            try {
              const list = await api.get('/api/condos', { params: { id: cid } });
              const col = Array.isArray(list.data) ? list.data : (list.data['hydra:member'] || []);
              c = col && col.length ? col[0] : null;
            } catch (_) {}
          }
        }
        if (!cancelled) setCondo(c);
      } catch (e) {
        if (!cancelled) {
          const apiMsg = e?.response?.data?.['hydra:description'] || e?.response?.data?.message;
          setError(apiMsg || 'Could not load unit details.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [effectiveId]);

  // Normalize fields for display
  const fields = useMemo(() => {
    const u = unit || {};
    const c = condo || {};
    return [
      { label: 'Type', value: pick(u, ['type']) },
      { label: 'Condo', value: pick(c, ['condoName', 'name', 'condo_name']) || pick(u, ['condoName', 'condo_name']) },
      { label: 'Door Number', value: pick(u, ['unitNumber', 'unit_number']) },
      { label: 'Unit Floor', value: pick(u, ['unitFloor', 'unit_floor']) },
      { label: 'Access Type', value: pick(u, ['accessType', 'access_type']) },
      { label: 'Access Code', value: pick(u, ['accessCode', 'access_code']) },
      { label: 'Building Code', value: pick(c, ['doorCode', 'door_code']) },
      { label: 'Parking', value: pick(u, ['parking']) },
      { label: 'Wi‑Fi Name', value: pick(u, ['wifiName', 'wifi_name']) },
      { label: 'Wi‑Fi Password', value: pick(u, ['wifiPassword', 'wifi_code', 'wifi_password']) },
      { label: 'Notes', value: pick(u, ['notes']) },
    ];
  }, [unit, condo]);

  const Title = (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <span>Unit Details</span>
      {unit && (
        <span style={{ marginTop: '6px', marginBottom: '1px', color: '#1E6F68', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
          {pick(unit, ['unitName', 'unit_name'])}
        </span>
      )}
    </div>
  );

  return (
    <>
      {isMobile && (
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Back"
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontSize: '0.95rem',
            color: '#1E6F68',
            padding: '6px 8px'
          }}
        >
          ← Back
        </button>
      )}
      <ListPageLayout
        title={Title}
        actions={(
          <div style={{ display: 'flex', gap: 8 }}>
            {/* Optional Edit shortcut (desktop only) */}
            {!isMobile && unit && (
              <Link
                to={`/units/edit/${effectiveId}`}
                className="btn btn-primary"
                style={{ textDecoration: 'none' }}
              >
                Edit
              </Link>
            )}
            {isMobile && unit && (
              <Link
                to={`/units/edit/${effectiveId}`}
                className="btn btn-primary"
                style={{ textDecoration: 'none' }}
              >
                Edit
              </Link>
            )}
          </div>
        )}
      >
        {loading && <div>Loading…</div>}
        {error && !loading && (
          <div style={{ color: 'red', marginBottom: 12 }}>{error}</div>
        )}

        {!loading && !error && (
          <div ref={cardRef} style={{
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            padding: 16,
            background: '#fff',
            marginTop: 0
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              {fields.map((f) => {
                let icon = '';
                switch (f.label) {
                  case 'Condo':
                    icon = <BuildingOfficeIcon style={{ width: 18, height: 18, color: '#1E6F68', display: 'inline-block', verticalAlign: 'middle', marginRight: 4 }} />;
                    break;
                  case 'Door Number':
                    icon = '🚪';
                    break;
                  case 'Access Type':
                    icon = '🔒 ';
                    break;
                  case 'Access Code':
                    icon = '🔓 ';
                    break;
                  case 'Parking':
                    icon = '🅿️ ';
                    break;
                  case 'Wi‑Fi Name':
                  case 'Wi‑Fi Password':
                    icon = <WifiIcon style={{ width: 18, height: 18, color: '#1E6F68', display: 'inline-block', verticalAlign: 'middle', marginRight: 4 }} />;
                    break;
                  default:
                    icon = '';
                }
                return (
                  <div key={f.label}>
                    <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, opacity: 0.6 }}>{f.label}</div>
                    <div style={{ marginTop: 4 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {icon}
                        {f.value || '—'}
                      </span>
                    </div>
                  </div>
                );
              })}
              <div>
                <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, opacity: 0.6 }}>Google Maps</div>
                <div style={{ marginTop: 4 }}>
                  {googleMapsHref ? (
                    <a href={googleMapsHref} target="_blank" rel="noopener noreferrer" title="Open in Google Maps" style={{ textDecoration: 'none' }}>
                      <MapPinIcon style={{ width: 20, height: 20, color: '#1E6F68', verticalAlign: 'middle' }} />
                    </a>
                  ) : '—'}
                </div>
              </div>
            </div>
          </div>
        )}
      </ListPageLayout>
    </>
  );
}
