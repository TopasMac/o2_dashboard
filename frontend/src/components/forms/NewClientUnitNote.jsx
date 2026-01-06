import React, { useEffect, useMemo, useState } from 'react';
import FormLayout from '../layouts/FormLayout';
import { Autocomplete, TextField } from '@mui/material';

/**
 * NewClientUnitNote
 * A small form to create a note for a Unit. Supports two entry types:
 *  - REPORT: requires yearMonth (YYYY-MM)
 *  - LOG:    no yearMonth
 *
 * Props:
 *  - unitId (number, required): target unit id
 *  - defaultYearMonth (string, optional): preselect YYYY-MM when entryType is REPORT
 *  - defaultType ("REPORT"|"LOG", optional): default note type (default: 'REPORT')
 *  - onSaved (function, optional): callback(noteJson) after successful save
 *  - onCancel (function, optional): cancel handler
 */
export default function NewClientUnitNote({
  unitId,
  defaultYearMonth = '',
  defaultType = 'REPORT',
  onSaved,
  onCancel,
}) {
  const [entryType, setEntryType] = useState(defaultType);
  const [yearMonth, setYearMonth] = useState(defaultYearMonth);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const [units, setUnits] = useState([]);
  const [selectedUnitId, setSelectedUnitId] = useState(unitId || '');
  const [unitInput, setUnitInput] = useState('');

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const token = localStorage.getItem('token') || localStorage.getItem('jwt') || '';
        const headers = {
          'Accept': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        };

        // Fetch units and clients in parallel
        const [unitsResp, clientsResp] = await Promise.all([
          fetch('/api/units?pagination=false', { headers }),
          fetch('/api/clients?pagination=false', { headers }),
        ]);

        const unitsJson = await unitsResp.json();
        const clientsJson = await clientsResp.json();

        const unitList = Array.isArray(unitsJson)
          ? unitsJson
          : (Array.isArray(unitsJson?.['hydra:member']) ? unitsJson['hydra:member'] : []);

        const clientList = Array.isArray(clientsJson)
          ? clientsJson
          : (Array.isArray(clientsJson?.['hydra:member']) ? clientsJson['hydra:member'] : []);

        // Build client language map by id
        const clientLangById = new Map();
        for (const c of clientList) {
          const cid = c.id ?? c['@id']?.split('/').pop();
          const lang = (c.language ?? c.lang ?? c.preferredLanguage ?? c.preferred_language ?? '').toString().toLowerCase();
          if (cid) clientLangById.set(String(cid), lang);
        }

        // Map units and attach client id + client language (if available)
        const mapped = unitList.map(u => {
          const id = u.id ?? u['@id']?.split('/').pop();
          // Try to resolve client id from various shapes
          const clientIri = (typeof u.client === 'string') ? u.client : (u.client?.['@id'] || u.client?._iri || u.client?._id || u.client_id || u.clientId);
          const clientId = clientIri && typeof clientIri === 'string' && clientIri.includes('/api/clients/')
            ? clientIri.split('/').pop()
            : (typeof u.client?.id !== 'undefined' ? u.client.id : (typeof u.client_id !== 'undefined' ? u.client_id : undefined));
          const clientLang = clientId ? (clientLangById.get(String(clientId)) || '') : '';

          return {
            id,
            label: u.unitName || u.unit_name || u.name || u.title || `Unit ${id ?? ''}`,
            city: u.city || u.cityName || u.location || u.condoCity || u.condo_city || '',
            clientId: clientId ? String(clientId) : '',
            clientLang: (clientLang || '').toLowerCase(),
          };
        }).filter(u => u.id);

        const withVirtual = [
          ...mapped,
          { id: 'All_Units',    label: 'All – All Units (bulk)',                 __bulk: true },
          { id: 'All_English',  label: 'All (Eng) – Owners language = en (bulk)', __bulk: true },
          { id: 'All_Spanish',  label: 'All (Esp) – Owners language = es (bulk)', __bulk: true },
        ];

        if (isMounted) setUnits(withVirtual);
      } catch (e) {
        console.error('Failed to load units/clients', e);
      }
    })();
    return () => { isMounted = false; };
  }, []);

  const canSubmit = useMemo(() => {
    if (!selectedUnitId) return false;
    if (!comment.trim()) return false;
    if (entryType === 'REPORT') {
      return /^\d{4}-\d{2}$/.test(yearMonth || '');
    }
    return true;
  }, [selectedUnitId, comment, entryType, yearMonth]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit || saving) return;
    setSaving(true);
    setError(null);

    const token = localStorage.getItem('token') || localStorage.getItem('jwt') || '';
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    try {
      // Detect bulk option
      const selected = units.find(u => String(u.id) === String(selectedUnitId));
      const isBulk = !!selected?.__bulk;

      if (isBulk) {
        // Gather targets
        let targets = [];
        if (selected.id === 'All_Units') {
          targets = units.filter(u => !u.__bulk);
        } else if (selected.id === 'All_English') {
          targets = units.filter(u => !u.__bulk && (u.clientLang === 'en' || u.clientLang === 'en-us' || u.clientLang === 'en_gb' || u.clientLang === 'english'));
        } else if (selected.id === 'All_Spanish') {
          targets = units.filter(u => !u.__bulk && (u.clientLang === 'es' || u.clientLang === 'es-mx' || u.clientLang === 'es_es' || u.clientLang === 'spanish'));
        } else {
          // Fallback (should not be used anymore)
          targets = units.filter(u => !u.__bulk);
        }

        if (targets.length === 0) {
          const scope = selected.id === 'All_Units' ? 'all units' : (selected.id === 'All_English' ? 'owners with language=en' : (selected.id === 'All_Spanish' ? 'owners with language=es' : 'selection'));
          throw new Error(`No units found for ${scope}`);
        }

        // Fan out
        const bodies = targets.map(u => ({
          unit: `/api/units/${u.id}`,
          entryType,
          yearMonth: entryType === 'REPORT' ? yearMonth : null,
          comment: comment.trim(),
        }));

        const results = await Promise.allSettled(bodies.map(body => (
          fetch('/api/client_unit_notes', {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
          })
          .then(async (resp) => {
            if (!resp.ok) throw new Error(await resp.text());
            return resp.json();
          })
        )));

        const fulfilled = results.filter(r => r.status === 'fulfilled').map(r => r.value);
        const rejected  = results.filter(r => r.status === 'rejected');

        if (rejected.length > 0 && fulfilled.length === 0) {
          throw new Error(`Failed to save notes: ${rejected[0].reason || 'Unknown error'}`);
        }

        if (onSaved) {
          onSaved({ bulk: true, city: selected.city, count: fulfilled.length, items: fulfilled });
        }
      } else {
        // Single unit flow (unchanged)
        const body = {
          unit: `/api/units/${selectedUnitId}`,
          entryType,
          yearMonth: entryType === 'REPORT' ? yearMonth : null,
          comment: comment.trim(),
        };

        const resp = await fetch('/api/client_unit_notes', {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        });

        if (!resp.ok) {
          const text = await resp.text();
          throw new Error(text || `Request failed with ${resp.status}`);
        }
        const json = await resp.json();
        if (onSaved) onSaved(json);
      }
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to save note');
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormLayout
      title="New Note"
      description={
        entryType === 'REPORT'
          ? 'Report note for a specific month (appears on monthly reports).'
          : 'General log note for this unit (appears in the unit activity log).'
      }
      onSubmit={handleSubmit}
      renderSave
      showCancel
      onCancel={onCancel}
      saveLabel={saving ? 'Saving…' : 'Save'}
      actionsAlign="left"
    >
      {/* Type selector */}
      <div className="form-row">
        <label htmlFor="entryType" className="form-label">Type</label>
        <select
          id="entryType"
          className="form-input"
          value={entryType}
          onChange={(e) => setEntryType(e.target.value)}
        >
          <option value="REPORT">Report</option>
          <option value="LOG">Log</option>
        </select>
      </div>

      {/* Year-Month for REPORT */}
      {entryType === 'REPORT' && (
        <div className="form-row">
          <label htmlFor="yearMonth" className="form-label">Year / Month</label>
          {/* input type="month" returns YYYY-MM in modern browsers */}
          <input
            id="yearMonth"
            type="month"
            className="form-input"
            value={yearMonth}
            onChange={(e) => setYearMonth(e.target.value)}
            placeholder="YYYY-MM"
          />
        </div>
      )}

      {/* Unit selector */}
      <div className="form-row">
        <label htmlFor="unitId" className="form-label">Unit</label>
        <div style={{ width: '100%' }}>
          <Autocomplete
            id="unitId"
            options={units}
            value={units.find(u => String(u.id) === String(selectedUnitId)) || null}
            inputValue={unitInput}
            onInputChange={(e, newInput) => setUnitInput(newInput)}
            onChange={(e, option) => setSelectedUnitId(option ? option.id : '')}
            getOptionLabel={(option) => (option?.label ?? '')}
            isOptionEqualToValue={(option, value) => String(option.id) === String(value.id)}
            renderInput={(params) => (
              <TextField
                {...params}
                placeholder="Select a unit…"
                size="small"
              />
            )}
          />
        </div>
      </div>

      {/* Comment */}
      <div className="form-row">
        <label htmlFor="comment" className="form-label">Comment</label>
        <textarea
          id="comment"
          className="form-input"
          rows={5}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={entryType === 'REPORT' ? 'Add a report note for this month…' : 'Add a log note for this unit…'}
        />
        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
          {entryType === 'REPORT'
            ? 'These notes can show on the monthly report for this unit.'
            : 'These notes appear in the unit activity log.'}
        </div>
      </div>

      {/* Client-side validation & errors */}
      {!canSubmit && (
        <div style={{ color: '#b45309', fontSize: 12 }}>
          {(!selectedUnitId) && 'Select a unit to continue.'}
          {(selectedUnitId && !comment.trim()) && ' Please enter a comment.'}
          {(selectedUnitId && comment.trim() && entryType === 'REPORT' && !/^\d{4}-\d{2}$/.test(yearMonth || '')) && ' Please select a valid Year-Month.'}
        </div>
      )}
      {error && (
        <div style={{ color: '#b91c1c', fontSize: 12 }}>{error}</div>
      )}
    </FormLayout>
  );
}