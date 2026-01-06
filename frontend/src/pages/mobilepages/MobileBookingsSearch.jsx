import React, { useEffect, useMemo, useState } from 'react';
import api from '../../api';
import FormLayout from '../../components/layouts/FormLayout';
import BookingEditFormRHF from '../../components/forms/BookingEditFormRHF';
import { Drawer, Autocomplete, TextField } from '@mui/material';

const PAGE_SIZE = 5;

// Map pill bucket to API status value
const bucketToApiStatus = (bucket) => {
  switch ((bucket || '').toLowerCase()) {
    case 'upcoming':
      return 'Upcoming';
    case 'ongoing':
      return 'Currently hosting';
    case 'past':
      return 'Past guest';
    case 'cancelled':
    case 'canceled':
      return 'Canceled';
    default:
      return '';
  }
};

// Date formatters
const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};
const fmtDateRange = (checkIn, checkOut) => {
  const a = fmtDate(checkIn);
  const b = fmtDate(checkOut);
  return a && b ? `${a}–${b}` : (a || b || '');
};

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'Confirmed', label: 'Confirmed' },
  { value: 'Currently hosting', label: 'Currently hosting' },
  { value: 'Past guest', label: 'Past guest' },
  { value: 'Canceled by guest', label: 'Canceled by guest' },
  { value: 'Canceled', label: 'Canceled' },
];

// Bucketed status mapping for pills
const STATUS_PILLS = [
  { bucket: 'past', label: 'Past', match: ['past guest', 'past', 'checked out', 'checked-out', 'completed', 'complete', 'history'] },
  { bucket: 'ongoing', label: 'Ongoing', match: ['currently hosting', 'ongoing', 'in house', 'in-house', 'checked in', 'checked-in'] },
  { bucket: 'upcoming', label: 'Upcoming', match: ['confirmed', 'upcoming', 'booked', 'reservation confirmed'] },
  { bucket: 'cancelled', label: 'Cancelled', match: ['canceled', 'canceled by guest', 'cancelled', 'cancelled by guest'] },
];

const matchesBucket = (statusStr, bucket) => {
  if (!bucket) return true; // no filter
  const s = String(statusStr || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim();
  const pill = STATUS_PILLS.find(p => p.bucket === bucket);
  if (!pill) return true;
  return pill.match.some(m => s.includes(m));
};

const extractNumericId = (val) => {
  if (val == null) return null;
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    // Try to parse from IRI like "/api/units/2" or plain "2"
    const iriMatch = val.match(/\/(\d+)(?:$|[^0-9])/);
    if (iriMatch) return Number(iriMatch[1]);
    const n = Number(val);
    return Number.isNaN(n) ? null : n;
  }
  if (typeof val === 'object') {
    if (typeof val.id !== 'undefined') {
      const n = Number(val.id);
      if (!Number.isNaN(n)) return n;
    }
    if (typeof val['@id'] === 'string') {
      const iriMatch = val['@id'].match(/\/(\d+)(?:$|[^0-9])/);
      if (iriMatch) return Number(iriMatch[1]);
    }
  }
  return null;
};

const normalize = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const getUnitName = (row) => {
  if (row.unit_name) return row.unit_name;
  if (row.unitName) return row.unitName;
  if (row.unit && typeof row.unit === 'object') {
    return row.unit.unitName ?? row.unit.unit_name ?? row.unit.name ?? '';
  }
  return '';
};
const getDates = (row) => fmtDateRange(row.checkIn ?? row.check_in, row.checkOut ?? row.check_out);

const getUnitIdFromRow = (row) => {
  // Prefer explicit fields, then parse from possible IRI/object in `unit`
  const direct = row.unitId ?? row.unit_id ?? null;
  if (direct != null) return Number(direct);
  if (row.unit != null) return extractNumericId(row.unit);
  return null;
};

const getNotes = (row) => row.notes ?? row.note ?? '';
const getCheckInNotes = (row) => row.checkInNotes ?? row.check_in_notes ?? row.check_in_note ?? '';
const getCheckOutNotes = (row) => row.checkOutNotes ?? row.check_out_notes ?? row.check_out_note ?? '';

export default function MobileBookingsSearch() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Units for autocomplete
  const [units, setUnits] = useState([]);
  const [unitsLoading, setUnitsLoading] = useState(false);

  // Filters
  const [code, setCode] = useState('');
  const [unit, setUnit] = useState('');        // input text shown in Autocomplete
  const [unitId, setUnitId] = useState(null);  // selected unit id (when chosen from list)
  const [status, setStatus] = useState('');

  // Applied filters (updated only when user taps "Show")
  const [applied, setApplied] = useState({ code: '', unit: '', unitId: null, status: '' });

  // Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);

  // Controls whether to display results
  const [showResults, setShowResults] = useState(false);
  const [page, setPage] = useState(0);

  const fetchUnits = async () => {
    setUnitsLoading(true);
    try {
      // Use the same endpoint as NewBookingForm
      const res = await api.get('/api/unit-list/active');
      const data = Array.isArray(res.data) ? res.data : res.data['hydra:member'] ?? [];
      if (Array.isArray(data) && data.length) {
        const mapped = data
          .map((u) => ({
            id: u.id ?? null,
            name: u.unit_name ?? u.unitName ?? u.name ?? '',
          }))
          .filter((u) => u.id !== null && u.name);
        setUnits(mapped);
        return;
      }
    } catch (e) {
      console.warn('[Units] /api/unit-list/active failed, falling back', e?.response?.status);
      // continue to fallback below
    } finally {
      setUnitsLoading(false);
    }
  
    // Fallback: derive from bookings if API not available
    const derived = Array.from(
      new Map(
        bookings
          .map((b) => {
            const id = b.unitId ?? b.unit_id ?? null;
            const name = b.unitName ?? b.unit_name ?? '';
            if (!name) return null;
            return [id ?? name, { id, name }];
          })
          .filter(Boolean)
      ).values()
    );
    setUnits(derived);
  };
  
  const unitOptions = useMemo(() => units, [units]);

  const fetchBookings = async ({ code: qCode = '', unitId: qUnitId = null, unitName: qUnitName = '', statusBucket: qBucket = '' } = {}) => {
    setLoading(true);
    setError(null);

    const collectFromUnknownShape = (d) => {
      if (Array.isArray(d)) return d;
      if (d && Array.isArray(d['hydra:member'])) return d['hydra:member'];
      if (d && Array.isArray(d.data)) return d.data;
      if (d && Array.isArray(d.items)) return d.items;
      if (d && Array.isArray(d.results)) return d.results;
      if (d && typeof d === 'object') {
        const firstArray = Object.values(d).find((v) => Array.isArray(v));
        if (firstArray) return firstArray;
      }
      return [];
    };

    try {
      const params = { itemsPerPage: 500 };
      const statusVal = bucketToApiStatus(qBucket);
      if (statusVal) params.status = statusVal;
      if (qCode) params.confirmationCode = qCode;
      if (qUnitId != null && qUnitId !== '') params.unitId = qUnitId;
      else if (qUnitName) params.unitName = qUnitName;
      // If status is "upcoming", set ordering by checkIn ascending
      if (qBucket && qBucket.toLowerCase() === 'upcoming') {
        params['order[checkIn]'] = 'asc';
      }

      const res = await api.get('/api/all_bookings', { params });
      const arr = collectFromUnknownShape(res.data);
      console.log('[MobileBookingsSearch] Server-filtered load:', { count: arr.length, params });
      setBookings(arr);
    } catch (e) {
      console.error(e);
      setError('Failed to load bookings');
      setBookings([]);
    } finally {
      setLoading(false);
    }
  };

  // (Initial fetch on mount removed)

  useEffect(() => {
    // Try to load units after bookings are available too (for fallback)
    fetchUnits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookings.length]);

  const filtered = useMemo(() => {
    const codeNeedle = applied.code.trim().toLowerCase();
    const unitNeedle = applied.unit.trim().toLowerCase();
    const wantedBucket = (applied.status || '').trim().toLowerCase();
    const wantedUnitId = applied.unitId;

    const selectedUnitName =
      wantedUnitId != null
        ? (units.find(u => Number(u.id) === Number(wantedUnitId))?.name || '')
        : '';

    const selectedUnitNameNorm = normalize(selectedUnitName || applied.unit);

    return bookings.filter((b) => {
      const codeOk = !codeNeedle || String(b.confirmationCode ?? '').toLowerCase().includes(codeNeedle);
      const rawStatus = String(b.status ?? '');
      const statusVal = rawStatus.toLowerCase();
      let statusOk = matchesBucket(statusVal, wantedBucket);
      // Fallback: allow case-insensitive exact/contains match on the bucket term itself
      if (!statusOk && wantedBucket) {
        if (new RegExp(`^${wantedBucket}$`, 'i').test(rawStatus) || statusVal.includes(wantedBucket)) {
          statusOk = true;
        }
      }

      // Unit check:
      // 1) If a unitId is selected, try exact id match.
      // 2) If the row has no id, fall back to matching by the selected unit's name.
      // 3) If no unitId is selected but there's typed text, do a name contains match.
      let unitOk = true;
      if (wantedUnitId !== null && wantedUnitId !== '' && typeof wantedUnitId !== 'undefined') {
        const rowIdRaw = getUnitIdFromRow(b);
        const rowIdNum = rowIdRaw != null ? Number(rowIdRaw) : NaN;
        const wantedIdNum = Number(wantedUnitId);
        if (!Number.isNaN(rowIdNum) && !Number.isNaN(wantedIdNum)) {
          unitOk = rowIdNum === wantedIdNum;
        } else {
          // Fallback: compare normalized names (ignoring spaces/underscores)
          const rowNameNorm = normalize(getUnitName(b));
          unitOk = !!selectedUnitNameNorm && (rowNameNorm === selectedUnitNameNorm || rowNameNorm.includes(selectedUnitNameNorm));
        }
      } else if (unitNeedle) {
        const needleNorm = normalize(unitNeedle);
        const rowNameNorm = normalize(getUnitName(b));
        unitOk = rowNameNorm.includes(needleNorm);
      }

      return codeOk && unitOk && statusOk;
    });
  }, [bookings, applied, units]);

  const handleOpen = (b) => {
    setSelectedBooking(b);
    setDrawerOpen(true);
  };

  const handleClose = () => {
    setDrawerOpen(false);
    setSelectedBooking(null);
    fetchBookings(); // refresh list
  };

  const applyFilters = async () => {
    setPage(0);
    console.log('[MobileBookingsSearch] Apply filters', { code, unit, unitId, status });
    await fetchBookings({ code, unitId, unitName: unit, statusBucket: status });
    setApplied({ code, unit, unitId, status });
    setShowResults(true);
  };

  const clearFilters = () => {
    console.log('[MobileBookingsSearch] Clear filters');
    setPage(0);
    setCode('');
    setUnit('');
    setUnitId(null);
    setStatus('');
    setApplied({ code: '', unit: '', unitId: null, status: '' });
    setBookings([]);
    setShowResults(false);
  };

  // Friendly labels for the applied filters (for the small title above results)
  const appliedUnitName =
    applied.unitId != null
      ? (units.find((u) => Number(u.id) === Number(applied.unitId))?.name || applied.unit || 'All')
      : (applied.unit || 'All');
  const appliedStatusLabel =
    STATUS_PILLS.find((p) => p.bucket === applied.status)?.label || 'All';

  const paged = useMemo(() => {
    const start = page * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  const hasMore = useMemo(() => ((page + 1) * PAGE_SIZE) < filtered.length, [filtered.length, page]);

  return (
    <div className="mobile-search-page">
      <FormLayout title="Search bookings" onSubmit={(e) => { e.preventDefault(); applyFilters(); }}>
        <div className="form-row">
          <label htmlFor="code">Confirmation code</label>
          <input
            id="code"
            type="search"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. ABC123"
          />
        </div>

        <div className="form-row">
          <label htmlFor="unit">Unit name</label>
          <Autocomplete
            id="unit"
            freeSolo
            loading={unitsLoading}
            options={unitOptions}
            getOptionLabel={(opt) => (typeof opt === 'string' ? opt : opt?.name ?? '')}
            value={unitId ? unitOptions.find((u) => u.id === unitId) ?? null : null}
            inputValue={unit}
            onChange={(_, newVal) => {
              if (typeof newVal === 'string' || newVal === null) {
                setUnitId(null);
                setUnit(newVal ?? '');
              } else {
                setUnitId(newVal.id);
                setUnit(newVal.name);
              }
            }}
            clearOnBlur={false}
            onInputChange={(_, newInput, reason) => {
              // Avoid wiping text on blur/reset events that MUI fires internally
              if (reason === 'reset' || reason === 'blur') return;
              setUnit(newInput ?? '');
              if (!newInput) setUnitId(null);
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                placeholder="Start typing unit name"
                variant="outlined"
                size="small"
                fullWidth
              />
            )}
            noOptionsText={unitsLoading ? 'Loading…' : 'No units'}
          />
        </div>

        <div className="form-row">
          <label>Status</label>
          <div className="status-pills">
            {STATUS_PILLS.map((p) => {
              const active = status === p.bucket;
              return (
                <button
                  type="button"
                  key={p.bucket}
                  className={`status-pill ${p.bucket} ${active ? 'active' : ''}`}
                  onClick={() => setStatus(active ? '' : p.bucket)}
                  aria-pressed={active}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="form-actions actions-inline">
          <button
            type="button"
            className="btn btn-primary"
            data-testid="show-filters"
            onClick={(e) => {
              e.stopPropagation();
              applyFilters();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                applyFilters();
              }
            }}
          >
            Show
          </button>
          <button type="button" className="btn btn-secondary" data-testid="clear-filters" onClick={clearFilters}>
            Clear
          </button>
        </div>
      </FormLayout>

      {/* Results summary and applied filters */}
      {showResults && (
        <div className="results-summary" style={{ marginTop: '0.5rem', marginBottom: '0.25rem', fontSize: '13px', color: '#334' }}>
          <h3>
            Unit: {applied.unit || 'All'}  Status:{' '}
            {appliedStatusLabel !== 'All' ? (
              <span className={`status-text ${appliedStatusLabel.toLowerCase()}`}>
                {appliedStatusLabel.charAt(0).toUpperCase() + appliedStatusLabel.slice(1)}
              </span>
            ) : 'All'}
          </h3>
          <div style={{ fontWeight: 600, marginTop: '0.25rem' }}>Results</div>
        </div>
      )}

      <div className="search-results">
        {loading && <p>Loading…</p>}
        {error && <p className="error">{error}</p>}

        {showResults && !loading && !error && filtered.length === 0 && (
          <p>No matches.</p>
        )}

        {showResults && !loading && !error && filtered.length > 0 && (
          <ul className="results-list">
            {paged.map((row) => (
              <li key={row.id} className="result-item" onClick={() => handleOpen(row)}>
                <div className="line1">
                  <button
                    type="button"
                    className="code-link"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleOpen(row); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        handleOpen(row);
                      }
                    }}
                    aria-label={`Open booking ${row.confirmationCode} for editing`}
                    style={{ all: 'unset', cursor: 'pointer', fontWeight: 700, color: 'var(--color-teal)' }}
                  >
                    {row.confirmationCode}
                  </button>
                </div>
                <div className="line2">
                  <span className="guest">{row.guestName}</span>
                  {(!applied.unitId && !String(applied.unit || '').trim()) && (
                    <>
                      <span className="sep">•</span>
                      <span className="unit">{getUnitName(row)}</span>
                    </>
                  )}
                </div>
                <div className="line3">{getDates(row)}</div>
                {(() => {
                  const n = getNotes(row);
                  return n ? <div className="line-notes"><strong>Notes:</strong> {n}</div> : null;
                })()}
                {(() => {
                  const cin = getCheckInNotes(row);
                  return cin ? <div className="line-checkin"><strong>Check-in notes:</strong> {cin}</div> : null;
                })()}
                {(() => {
                  const cout = getCheckOutNotes(row);
                  return cout ? <div className="line-checkout"><strong>Check-out notes:</strong> {cout}</div> : null;
                })()}
              </li>
            ))}
          </ul>
        )}
        {showResults && !loading && !error && filtered.length > 0 && hasMore && (
          <div style={{ textAlign: 'center', marginTop: '0.5rem' }}>
            <button
              type="button"
              className="link-button load-more"
              onClick={(e) => { e.preventDefault(); setPage((p) => p + 1); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setPage((p) => p + 1);
                }
              }}
              aria-label="Load next page of results"
              style={{ all: 'unset', cursor: 'pointer', color: 'var(--color-teal)', fontWeight: 600 }}
            >
              Load more
            </button>
          </div>
        )}
      </div>

      <Drawer
        anchor="right"
        open={drawerOpen}
        onClose={handleClose}
      >
        {selectedBooking && (
          <div style={{ width: 420, maxWidth: '100vw', padding: 16, boxSizing: 'border-box' }}>
            <BookingEditFormRHF
              booking={selectedBooking}
              onClose={handleClose}
            />
          </div>
        )}
      </Drawer>
    </div>
  );
}