import React, { useEffect, useState, useMemo } from 'react';
import DataTable from '../components/layouts/DataTable';
import AppDrawer from '../components/common/AppDrawer';
import FormDrawer from '../components/common/FormDrawer';
import NewReportCommentForm from '../components/forms/NewReportCommentForm';
import api from '../api';

const formatDateDisplay = (value) => {
  if (!value) return '';
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      // try YYYY-MM-DD
      return String(value);
    }
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  } catch {
    return String(value);
  }
};

const ReportComments = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterKey, setFilterKey] = useState(0);

  const [drawerOpen, setDrawerOpen] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      // API Platform default path; adjust if your route differs
      const resp = await api.get('/api/client_unit_notes');
      const body = resp && resp.data ? resp.data : [];
      const list =
        Array.isArray(body) ? body
        : Array.isArray(body['hydra:member']) ? body['hydra:member']
        : Array.isArray(body.member) ? body.member
        : Array.isArray(body.items) ? body.items
        : [];
      console.debug('ReportComments fetched', { raw: body, count: list.length });

      const normalized = list.map((it) => {
        const id = it.id ?? it.noteId ?? it.note_id ?? null;
        const createdAt = it.createdAt ?? it.created_at ?? it.date ?? null;
        // unit may be an IRI string like "/api/units/2"
        const unitIri = it.unit ?? it.unitId ?? it.unit_id ?? null;
        let unitId = null;
        if (typeof unitIri === 'string') {
          const m = unitIri.match(/\/units\/(\d+)/);
          unitId = m ? Number(m[1]) : null;
        } else if (unitIri && typeof unitIri === 'object') {
          unitId = unitIri.id ?? null;
        }
        const unitName = it.unitLabel ?? it.unit_name ?? '';
        const author = it.authorLabel ?? it.createdBy ?? it.created_by ?? '';
        const noteText = it.comment ?? it.note ?? it.text ?? '';
        const entryType = it.entryType ?? '';
        const yearMonth = it.yearMonth ?? '';

        return {
          id,
          createdAt,
          date: createdAt ? String(createdAt).split('T')[0] : '',
          unitId,
          unitName,
          clientName: '', // not provided by API; keep column for now
          author: typeof author === 'string' ? author : '',
          note: noteText,
          entryType,
          yearMonth,
          raw: it,
        };
      });

      // latest first
      normalized.sort((a, b) => {
        const da = new Date(a.createdAt || a.date || 0);
        const db = new Date(b.createdAt || b.date || 0);
        return db.getTime() - da.getTime(); // latest entry first
      });

      setRows(normalized);
    } catch (e) {
      console.error('Failed to load client unit notes', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const columns = useMemo(() => ([
    {
      header: 'ID',
      accessor: 'id',
      cell: (row) => (
        <span>{row.id}</span>
      ),
      width: 80,
      filterable: true,
    },
    {
      header: 'Date',
      accessor: 'date',
      width: 120, // reduce column width
      cell: (row) => (
        <div style={{ maxWidth: 120, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={formatDateDisplay(row.date || row.createdAt)}>
          {formatDateDisplay(row.date || row.createdAt)}
        </div>
      ),
    },
    {
      header: 'Unit',
      accessor: 'unitName',
      width: 140, // reduce column width
      filterable: true,
      cell: (row) => (
        <div style={{ maxWidth: 140, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={row.unitName || ''}>
          {row.unitName || ''}
        </div>
      ),
    },
    {
      header: 'Entry Type',
      accessor: 'entryType',
      width: 150,
      filterable: true,
      cell: (row) => (
        <div style={{ maxWidth: 150, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={row.entryType || ''}>
          {row.entryType || ''}
        </div>
      ),
    },
    {
      header: 'Comment',
      accessor: 'note',
      filterable: true,
    },
  ]), []);

  return (
    <div style={{ padding: 16 }}>
      <h2>Report Comments</h2>
      <div className="table-controls" style={{ marginBottom: 8 }}>
        <button
          className="btn btn-primary"
          onClick={() => {
            setDrawerOpen(true);
          }}
          style={{ marginRight: 8 }}
        >
          + Add Comment
        </button>
        <button
          className="btn btn-secondary"
          onClick={() => setFilterKey((k) => k + 1)}
        >
          Clear Filters
        </button>
      </div>
      <div>
        <DataTable
          key={filterKey}
          columns={columns}
          data={rows}
          loading={loading}
          pageSize={25}
        />
      </div>

      <FormDrawer
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
        }}
        title={'Add Comment'}
      >
        <NewReportCommentForm
          onSubmit={async (payload) => {
            const res = await api.post('/api/client_unit_notes', payload);
            return res?.data ?? payload;
          }}
          onSaved={(result) => {
            setDrawerOpen(false);
            fetchData();
            try {
              if (result?.id) {
                window.dispatchEvent(new CustomEvent('datatable:highlight', { detail: { id: result.id } }));
              }
            } catch {}
          }}
          onCancel={() => {
            setDrawerOpen(false);
          }}
        />
      </FormDrawer>
    </div>
  );
};

export default ReportComments;