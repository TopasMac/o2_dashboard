import React, { useEffect, useMemo, useState } from 'react';
import { Box, Button, Typography, IconButton } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import PencilSquareIcon from '@mui/icons-material/Edit';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import TableLite from '../../components/layout/TableLite';
import AppDrawer from '../../components/common/AppDrawer';
import CatalogItemNewForm from '../../components/forms/UnitInventoryPage/CatalogItemNewForm';
import CatalogItemEditForm from '../../components/forms/UnitInventoryPage/CatalogItemEditForm';

export default function ItemCatalogTab() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [editDrawerOpen, setEditDrawerOpen] = useState(false);

  // Helper to get JWT from storage
  const getJwtToken = () => {
    // Support a few common keys across the app
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
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    const res = await fetch(url, {
      ...options,
      headers,
      credentials: 'include',
    });

    return res;
  };

  const loadCatalog = () => {
    let mounted = true;
    setLoading(true);
    setError(null);

    authFetch('/api/purchase-catalog')
      .then(async (r) => {
        if (r.status === 401) {
          throw new Error('Unauthorized (JWT missing/expired)');
        }
        return r.json();
      })
      .then((json) => {
        if (!mounted) return;
        if (json?.ok) setRows(json.items || []);
        else setError('Failed to load catalog');
      })
      .catch((e) => mounted && setError(e?.message || 'Failed to load catalog'))
      .finally(() => mounted && setLoading(false));

    return () => {
      mounted = false;
    };
  };

  const handleDelete = async () => {
    if (!editItem?.id) return;
    // Simple confirm (can be replaced with a modal later)
    // eslint-disable-next-line no-alert
    const ok = window.confirm('Delete this catalog item?');
    if (!ok) return;

    try {
      const r = await authFetch(`/api/purchase-catalog/${encodeURIComponent(editItem.id)}`, {
        method: 'DELETE',
      });
      if (!r.ok) {
        let msg = `Delete failed (${r.status})`;
        try {
          const j = await r.json();
          msg = j?.error || j?.message || msg;
        } catch {}
        throw new Error(msg);
      }

      setEditDrawerOpen(false);
      setEditItem(null);
      loadCatalog();
    } catch (e) {
      setError(e?.message || 'Delete failed');
    }
  };

  useEffect(() => {
    const cleanup = loadCatalog();
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const columns = useMemo(
    () => [
      { header: 'Category', accessor: 'category', width: 150, filter: { type: 'select' } },
      {
        header: 'Name',
        accessor: (row) => {
          const name = row?.name || '';
          const bedSize = row?.bed_size;
          const label = bedSize
            ? `${name} ${bedSize.charAt(0).toUpperCase()}${bedSize.slice(1)}`
            : name;

          return (
            <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1, pr: 1 }}>
              <Box sx={{ minWidth: 0 }}>
                <Box
                  sx={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {label}
                </Box>
                {row?.purchase_source && (
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.5,
                      fontSize: 12,
                      color: 'text.secondary',
                      lineHeight: 1.2,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {row.purchase_source}
                    </Box>
                    {row?.purchase_url && (
                      <IconButton
                        size="small"
                        sx={{ p: 0.25 }}
                        component="a"
                        href={row.purchase_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <OpenInNewIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    )}
                  </Box>
                )}
              </Box>

              <IconButton
                size="small"
                sx={{ mt: '2px' }}
                onClick={(e) => {
                  e.stopPropagation();
                  setEditItem(row);
                  setEditDrawerOpen(true);
                }}
              >
                <PencilSquareIcon fontSize="small" />
              </IconButton>
            </Box>
          );
        },
        grow: 2,
        width: 300,
      },
      {
        header: 'Basis',
        accessor: (row) => {
          const basis = row?.qty_basis;
          if (!basis) return '';

          const bySize = row?.qty_per_bed_by_size;

          // Case 1: per-bed-size mapping
          if (bySize && typeof bySize === 'object') {
            const bedSize = row?.bed_size;

            // If the item is specific to a bed size and the mapping contains that key,
            // render a simple "X per Bed".
            if (bedSize && bySize[bedSize] !== undefined && bySize[bedSize] !== null && bySize[bedSize] !== '') {
              return `${bySize[bedSize]} per Bed`;
            }

            // Otherwise, show a compact summary of the mapping
            const entries = Object.entries(bySize)
              .filter(([, v]) => v !== undefined && v !== null && v !== '')
              .map(([k, v]) => `${k.charAt(0).toUpperCase()}${k.slice(1)}:${v}`);

            return entries.length ? entries.join(' ') : '';
          }

          // Case 2: simple qty per basis
          const qty = row?.qty_per_basis;
          if (qty === null || qty === undefined || qty === '') return '';

          const label = basis.charAt(0).toUpperCase() + basis.slice(1);
          return `${qty} per ${label}`;
        },
        width: 150,
      },
      {
        header: 'Cost',
        accessor: (row) => {
          const cost = row?.cost;
          const sell = row?.sell_price;

          const fmt = (v) => {
            if (v === null || v === undefined || v === '') return null;
            const n = Number(v);
            return Number.isFinite(n) ? n.toFixed(2) : String(v);
          };

          const costFmt = fmt(cost);
          const sellFmt = fmt(sell);

          if (!costFmt && !sellFmt) return '';

          return (
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'stretch',
                lineHeight: 1.2,
                rowGap: '4px', // match Name column visual rhythm
              }}
            >
              {costFmt && (
                <Box sx={{ display: 'flex', alignItems: 'baseline', width: '100%', minWidth: 0, gap: 2 }}>
                  <Box
                    component="span"
                    sx={{
                      color: 'text.secondary',
                      fontWeight: 500,
                      flex: '0 0 auto',
                      whiteSpace: 'nowrap',
                      marginLeft: '-2px',
                    }}
                  >
                    Cost:
                  </Box>
                  <Box
                    component="span"
                    sx={{
                      fontWeight: 700,
                      flex: '1 1 auto',
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {costFmt}
                  </Box>
                </Box>
              )}
              {sellFmt && (
                <Box sx={{ display: 'flex', alignItems: 'baseline', width: '100%', minWidth: 0, gap: 4, fontSize: 12 }}>
                  <Box
                    component="span"
                    sx={{
                      color: 'text.secondary',
                      fontWeight: 500,
                      flex: '0 0 auto',
                      whiteSpace: 'nowrap',
                      marginLeft: '-2px',
                    }}
                  >
                    Sell:
                  </Box>
                  <Box
                    component="span"
                    sx={{
                      color: 'text.primary',
                      fontWeight: 600,
                      flex: '1 1 auto',
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {sellFmt}
                  </Box>
                </Box>
              )}
            </Box>
          );
        },
        align: 'right',
        headerAlign: 'left',
        width: 130,
      },
      {
        header: 'Notes',
        accessor: (row) => row?.notes || '',
        grow: 2,
      },
    ],
    []
  );

  return (
    <Box sx={{ px: 2, pb: 2 }}>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 1.5,
        }}
      >
        <Typography variant="h6">Item Catalog</Typography>
        <Button
          size="small"
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setDrawerOpen(true)}
        >
          Add Item
        </Button>
      </Box>

      {error && (
        <Box sx={{ mb: 1, color: '#b91c1c' }}>
          {String(error)}
        </Box>
      )}

      <TableLite
        columns={columns}
        rows={rows}
        loading={loading}
        dense
        enableFilters
        height="calc(100vh - 280px)"
      />

      <AppDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Add Catalog Item"
        width={520}
        headerRight={
          <IconButton aria-label="Close" onClick={() => setDrawerOpen(false)} size="small">
            <CloseIcon />
          </IconButton>
        }
      >
        <CatalogItemNewForm
          onCancel={() => setDrawerOpen(false)}
          onCreated={() => {
            setDrawerOpen(false);
            loadCatalog();
          }}
        />
      </AppDrawer>

      <AppDrawer
        open={editDrawerOpen}
        onClose={() => {
          setEditDrawerOpen(false);
          setEditItem(null);
        }}
        title="Edit Catalog Item"
        width={520}
        mode="edit"
        formId={editItem ? `catalog-item-edit-${editItem.id}` : undefined}
        showActions={true}
        onDelete={handleDelete}
        headerRight={
          <IconButton
            aria-label="Close"
            onClick={() => {
              setEditDrawerOpen(false);
              setEditItem(null);
            }}
            size="small"
          >
            <CloseIcon />
          </IconButton>
        }
      >
        {editItem && (
          <CatalogItemEditForm
            item={editItem}
            formId={`catalog-item-edit-${editItem.id}`}
            onSaved={() => {
              setEditDrawerOpen(false);
              setEditItem(null);
              loadCatalog();
            }}
          />
        )}
      </AppDrawer>
    </Box>
  );
}