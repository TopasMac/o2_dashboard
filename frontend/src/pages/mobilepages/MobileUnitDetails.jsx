import api from '../../api';
import i18n from '../../i18n';
import useCurrentUserAccess from '../../hooks/useCurrentUserAccess';
import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Divider from '@mui/material/Divider';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';

/**
 * MobileUnitDetails
 * - Mobile shell with an inline UnitDetails view
 * - Autocomplete to pick a Unit; once selected, renders UnitDetails below
 * - Supports deep-linking via ?unitId=123
 */
export default function MobileUnitDetails() {
  const [copied, setCopied] = React.useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [units, setUnits] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [selected, setSelected] = React.useState(null); // { id, label, unitName, city }
  const [unitData, setUnitData] = React.useState(null);
  const [unitLoading, setUnitLoading] = React.useState(false);
  const [condoData, setCondoData] = React.useState(null);

  // User access info
  const { isAdmin, isManager, isSupervisor, employee } = useCurrentUserAccess();
  const employeeCity = employee?.city || null;
  const lockCityToEmployee = !!employeeCity && !isAdmin && !isManager && !isSupervisor;

  // --- i18n (mobile: employees default to Spanish; later clients can switch) ---
  const lang = (i18n?.language || 'en').toLowerCase().startsWith('es') ? 'es' : 'en';
  const L = React.useMemo(() => {
    const dict = {
      en: {
        selectUnit: 'Select Unit',
        searchUnit: 'Search unit...',
        quickAccess: 'Quick Access',
        doorNumber: 'Door number',
        unitFloor: 'Unit floor',
        accessType: 'Access type',
        accessCode: 'Access code',
        buildingCode: 'Building code',
        wifi: 'Wi‑Fi',
        wifiName: 'Name',
        wifiPassword: 'Password',
        copied: 'Copied ✓',
        loading: 'Loading…',
        others: 'Others',
        googleMaps: 'Google Maps',
        open: 'Open',
        parking: 'Parking',
        notes: 'Notes',
        chooseUnit: 'Choose a unit above to see its details.',
      },
      es: {
        selectUnit: 'Seleccionar unidad',
        searchUnit: 'Buscar unidad…',
        quickAccess: 'Acceso rápido',
        doorNumber: 'Número de puerta',
        unitFloor: 'Piso',
        accessType: 'Tipo de acceso',
        accessCode: 'Código de acceso',
        buildingCode: 'Código del edificio',
        wifi: 'Wi‑Fi',
        wifiName: 'Nombre',
        wifiPassword: 'Contraseña',
        copied: 'Copiado ✓',
        loading: 'Cargando…',
        others: 'Otros',
        googleMaps: 'Google Maps',
        open: 'Abrir',
        parking: 'Estacionamiento',
        notes: 'Notas',
        chooseUnit: 'Elige una unidad para ver sus detalles.',
      },
    };
    return dict[lang] || dict.en;
  }, [lang]);

  // Load units (minimal payload) once
  React.useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        const resp = await api.get('/api/units', { params: { pagination: false } });
        const data = resp?.data ?? {};
        const list = Array.isArray(data?.['hydra:member'])
          ? data['hydra:member']
          : (Array.isArray(data) ? data : []);

        const opts = list
          .map((u) => {
            const id = u.id ?? u['@id']?.split('/').pop();
            const unitName = u.unitName ?? u.name ?? `Unit #${id}`;
            const city = u.city ?? '';
            return {
              id: Number(id),
              label: city ? `${unitName} — ${city}` : unitName,
              unitName,
              city,
            };
          })
          .filter((o) => !lockCityToEmployee || o.city === employeeCity)
          .sort((a, b) => a.label.localeCompare(b.label));

        if (active) setUnits(opts);
      } catch (e) {
        console.error('[MobileUnitDetails] failed to fetch units', e);
        if (e?.response?.status === 401) {
          // Redirect to login preserving intent to return here
          window.location.href = '/login?redirect=/m/unit-details';
          return;
        }
        if (active) setUnits([]);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [lockCityToEmployee, employeeCity]);

  // If employee city becomes known after initial load (session loads async), re-filter the already-fetched list.
  React.useEffect(() => {
    if (!lockCityToEmployee || !employeeCity) return;
    setUnits((prev) => {
      const arr = Array.isArray(prev) ? prev : [];
      return arr.filter((u) => u && u.city === employeeCity);
    });
  }, [lockCityToEmployee, employeeCity]);

  // If ?unitId is present, preselect it once units are loaded
  React.useEffect(() => {
    const qp = searchParams.get('unitId');
    if (!qp || !units.length) return;
    const id = Number(qp);
    const found = units.find(u => u.id === id && (!lockCityToEmployee || u.city === employeeCity));
    if (found) {
      setSelected(found);
    }
  }, [searchParams, units]);

  const handleSelect = (event, value) => {
    setSelected(value || null);
    const next = new URLSearchParams(searchParams);
    if (value?.id) next.set('unitId', String(value.id));
    else next.delete('unitId');
    setSearchParams(next, { replace: true });
  };

  const v = (val) => {
    if (val == null) return '';
    const s = String(val).trim();
    return s;
  };

  const show = (val) => {
    const s = v(val);
    return s ? s : '—';
  };

  const copyToClipboard = async (text) => {
    const s = v(text);
    if (!s) return;
    try {
      await navigator.clipboard.writeText(s);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      // Fallback for older browsers
      try {
        const ta = document.createElement('textarea');
        ta.value = s;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch (e2) {}
    }
  };

  React.useEffect(() => {
    let active = true;
    if (!selected?.id) {
      setUnitData(null);
      return () => { active = false; };
    }
    if (lockCityToEmployee && selected?.city !== employeeCity) {
      setUnitData(null);
      return () => { active = false; };
    }
    (async () => {
      try {
        setUnitLoading(true);
        const resp = await api.get(`/api/units/${selected.id}`);
        if (!active) return;
        setUnitData(resp?.data ?? null);
      } catch (e) {
        console.error('[MobileUnitDetails] failed to fetch unit details', e);
        if (!active) return;
        setUnitData(null);
      } finally {
        if (active) setUnitLoading(false);
      }
    })();
    return () => { active = false; };
  }, [selected?.id]);

  React.useEffect(() => {
    let active = true;

    // Support both API Platform relation (unitData.condo) and lean/unit DTOs (unitData.condoId)
    const hasCondoRef = !!(unitData?.condo || unitData?.condoId);
    if (!hasCondoRef) {
      setCondoData(null);
      return () => { active = false; };
    }

    (async () => {
      try {
        let condoId = null;

        // 1) Prefer explicit condoId if present
        if (unitData?.condoId != null && String(unitData.condoId).trim() !== '') {
          condoId = String(unitData.condoId).trim();
        }

        // 2) Otherwise, derive from relation field
        if (!condoId) {
          try {
            const c = unitData.condo;
            if (typeof c === 'string') {
              condoId = c.split('/').pop();
            } else if (c && typeof c === 'object') {
              // API Platform may embed the relation as an object
              if (typeof c['@id'] === 'string') condoId = c['@id'].split('/').pop();
              else if (typeof c.id === 'number' || typeof c.id === 'string') condoId = String(c.id);
              else if (typeof c.condoId === 'number' || typeof c.condoId === 'string') condoId = String(c.condoId);
            }
          } catch {}
        }

        if (!condoId) {
          setCondoData(null);
          return;
        }

        const resp = await api.get(`/api/condos/${condoId}`);
        if (!active) return;
        setCondoData(resp?.data ?? null);
      } catch (e) {
        console.error('[MobileUnitDetails] failed to fetch condo', e);
        if (!active) return;
        setCondoData(null);
      }
    })();

    return () => { active = false; };
  }, [unitData?.condo, unitData?.condoId]);

  return (
    <>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box>
        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
          {L.selectUnit}
        </Typography>
          <Autocomplete
            value={selected}
            onChange={handleSelect}
            options={units}
            loading={loading}
            getOptionLabel={(o) => (typeof o === 'string' ? o : (o?.label ?? ''))}
            isOptionEqualToValue={(o, v) => o?.id === v?.id}
            renderInput={(params) => (
              <TextField
                {...params}
              placeholder={L.searchUnit}
                InputProps={{
                  ...params.InputProps,
                  endAdornment: (
                    <React.Fragment>
                      {loading ? <CircularProgress color="inherit" size={18} /> : null}
                      {params.InputProps.endAdornment}
                    </React.Fragment>
                  ),
                }}
              />
            )}
          />
        </Box>

        {selected ? (
          <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* Quick access (most-used fields for cleaning staff) */}
            <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
              <Box sx={{ px: 2, py: 1.5 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
                  {L.quickAccess}
                </Typography>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 2, mb: 1 }}>
                  <Typography variant="body2" color="text.secondary" sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {selected.unitName}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {v(unitData?.type) ? String(unitData?.type) : ''}
                  </Typography>
                </Box>

                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr', rowGap: 1 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                    <Typography variant="body2" color="text.secondary">{L.doorNumber}</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{show(unitData?.unitNumber ?? unitData?.doorNumber)}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                    <Typography variant="body2" color="text.secondary">{L.unitFloor}</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{show(unitData?.unitFloor)}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                    <Typography variant="body2" color="text.secondary">{L.accessType}</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{show(unitData?.accessType)}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: 'center' }}>
                    <Typography variant="body2" color="text.secondary">{L.accessCode}</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>{show(unitData?.accessCode)}</Typography>
                    </Box>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: 'center' }}>
                    <Typography variant="body2" color="text.secondary">{L.buildingCode}</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>{show(condoData?.doorCode ?? unitData?.doorCode ?? unitData?.buildingCode)}</Typography>
                    </Box>
                  </Box>
                </Box>

                <Divider sx={{ my: 1.5 }} />

                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                  {L.wifi}
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr', rowGap: 1 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                    <Typography variant="body2" color="text.secondary">{L.wifiName}</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{show(unitData?.wifiName)}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: 'center' }}>
                    <Typography variant="body2" color="text.secondary">{L.wifiPassword}</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexDirection: 'column', alignItems: 'flex-end' }}>
                      {v(unitData?.wifiPassword) ? (
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: 700,
                            color: '#1E6F68',
                            cursor: 'pointer',
                          }}
                          onClick={() => copyToClipboard(unitData?.wifiPassword)}
                        >
                          {show(unitData?.wifiPassword)}
                        </Typography>
                      ) : (
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          {show(unitData?.wifiPassword)}
                        </Typography>
                      )}
                      {copied && (
                        <Typography
                          variant="caption"
                          sx={{ color: '#1E6F68', fontSize: 11, mt: 0.25, textAlign: 'right' }}
                        >
                          {L.copied}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                </Box>

                {unitLoading ? (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                    {L.loading}
                  </Typography>
                ) : null}
              </Box>
            </Paper>

            {/* Others (less used, but still helpful) */}
            {(v(unitData?.googleMaps || condoData?.googleMaps) || v(unitData?.parking) || v(unitData?.notes)) ? (
              <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
                <Box sx={{ px: 2, py: 1.5 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
                    {L.others}
                  </Typography>

                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr', rowGap: 1 }}>
                    {(() => {
                      const mapsUrl = condoData?.googleMaps || unitData?.googleMaps;
                      if (!v(mapsUrl)) return null;
                      return (
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: 'center' }}>
                          <Typography variant="body2" color="text.secondary">{L.googleMaps}</Typography>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                            <a
                              href={String(mapsUrl)}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                fontSize: 13,
                                fontWeight: 600,
                                color: 'inherit',
                                textDecoration: 'underline',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                maxWidth: 180,
                              }}
                            >
                              {L.open}
                            </a>
                          </Box>
                        </Box>
                      );
                    })()}

                    {v(unitData?.parking) ? (
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                        <Typography variant="body2" color="text.secondary">{L.parking}</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{show(unitData?.parking)}</Typography>
                      </Box>
                    ) : null}

                    {v(unitData?.notes) ? (
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                        <Typography variant="body2" color="text.secondary">{L.notes}</Typography>
                        <Typography
                          variant="body2"
                          sx={{ fontWeight: 600, whiteSpace: 'pre-wrap' }}
                        >
                          {String(unitData?.notes)}
                        </Typography>
                      </Box>
                    ) : null}
                  </Box>
                </Box>
              </Paper>
            ) : null}

          </Box>
        ) : (
          <Typography variant="body2" color="text.secondary">
            {L.chooseUnit}
          </Typography>
        )}
      </Box>
    </>
  );
}