import React from 'react';
import { useEffect, useState } from 'react';
import MobileYearMonthPicker from './mobileComponents/MobileYearMonthPicker';
import { Box, Typography, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useCurrentUserAccess } from '../../hooks/useCurrentUserAccess';
import AddIcon from '@mui/icons-material/Add';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import { useNavigate } from 'react-router-dom';

export default function MobileEmployeeCash() {
  const {
    isLoading,
    isSupervisor,
    isManager,
    isAdmin,
    employee,
  } = useCurrentUserAccess();

  const navigate = useNavigate();

  const [balance, setBalance] = useState(0);
  const [entries, setEntries] = useState([]);
  const [yearMonth, setYearMonth] = useState(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  });
  const [previewAttachments, setPreviewAttachments] = useState(null);

  // Use row.date (YYYY-MM-DD or YYYY-MM-DD HH:MM:SS) as the only reference for filtering
  const getRowDate = (row) => {
    const raw = row.date;
    if (!raw) return null;
    const iso = raw.slice(0, 10); // YYYY-MM-DD
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  useEffect(() => {
    if (!employee?.id || !token) return;

    // Fetch entries
    fetch('/api/employee-cash-ledger', {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.rows)) {
          // Sort rows by date (desc). Prefer 'date', fallback to 'createdAt'
          const sorted = [...data.rows].sort((a, b) => {
            const da = a.date || a.createdAt;
            const db = b.date || b.createdAt;
            if (!da || !db) return 0;
            return db.localeCompare(da); // newest first
          });

          setEntries(sorted);
        }
      })
      .catch(() => {});
  }, [employee, token]);

useEffect(() => {
    if (!entries || entries.length === 0) {
      setBalance(0);
      return;
    }

    const latest = entries[0];
    const latestBalance =
      latest && latest.balance != null ? Number(latest.balance) : 0;

    setBalance(Number.isFinite(latestBalance) ? latestBalance : 0);
  }, [entries]);


  const filteredEntries = React.useMemo(() => {
    if (!entries || entries.length === 0) return [];

    const [y, m] = (yearMonth || '').split('-').map(Number);
    if (!y || !m) return entries;

    return entries.filter((row) => {
      const d = getRowDate(row);
      if (!d) return false;
      return (
        d.getFullYear() === y &&
        d.getMonth() + 1 === m
      );
    });
  }, [entries, yearMonth]);

  // Access guard AFTER all hooks
  if (isLoading) return null;
  if (!isSupervisor && !isManager && !isAdmin) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography color="text.secondary">Sin acceso al registro de gastos.</Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >


        {/* Main card: full-height with internal scroll */}
        <Box
          sx={{
            flex: 1,
            flexGrow: 1,
            px: 1,
            pb: 1,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}
        >
          <Box
            sx={{
              // Keep a stable card height so it doesn't collapse when few rows are visible.
              // The inner list already scrolls.
              height: 'calc(100vh - 170px)',
              maxHeight: 'calc(100vh - 170px)',
              minHeight: 420,

              background: '#fff',
              borderRadius: 2,
              border: '1px solid #E0E6E8',
              display: 'flex',
              flexDirection: 'column',
              width: '100%',
              maxWidth: '100%',
              overflow: 'hidden',
            }}
          >
            <Box
              sx={{
                flex: 1,
                minHeight: 0,
                height: '100%',
                overflowY: 'auto',
                overflowX: 'hidden',
                WebkitOverflowScrolling: 'touch',
                pb: 8,
              }}
            >
              {/* Sticky: Balance + Month selector */}
              <Box
                sx={{
                  position: 'sticky',
                  top: 0,
                  zIndex: 6,
                  px: 2,
                  py: 1.5,
                  backgroundColor: '#ffffff',
                  borderBottom: '1px solid #E0E6E8',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
                }}
              >
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 2,
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body1" sx={{ fontWeight: 600 }}>
                      Saldo:
                    </Typography>
                    <Typography
                      variant="body1"
                      sx={{
                        fontWeight: 600,
                        color: balance >= 0 ? '#1E6F68' : '#c62828',
                      }}
                    >
                      ${balance.toFixed(2)}
                    </Typography>
                  </Box>

                  <Box sx={{ flexShrink: 0 }}>
                    <MobileYearMonthPicker value={yearMonth} onChange={setYearMonth} />
                  </Box>
                </Box>
              </Box>

              {/* Sticky header */}
              <Box
                sx={{
                  position: 'sticky',
                  top: 56,
                  zIndex: 5,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  px: 2,
                  py: 1,
                  backgroundColor: '#ffffff',
                  borderBottom: '1px solid #E0E6E8',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
                }}
              >
                <Box sx={{ display: 'flex', flex: 1 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 600,
                      width: '100px',
                      minWidth: '100px',
                      color: '#444',
                    }}
                  >
                    Fecha
                  </Typography>

                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 600,
                      flex: 1,
                      color: '#444',
                    }}
                  >
                    Tipo
                  </Typography>

                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 600,
                      width: '80px',
                      minWidth: '80px',
                      textAlign: 'right',
                      whiteSpace: 'nowrap',
                      color: '#444',
                    }}
                  >
                    Monto
                  </Typography>
                </Box>
              </Box>

              {filteredEntries.length === 0 ? (
                <Typography color="text.secondary" sx={{ p: 2 }}>
                  Sin registros.
                </Typography>
              ) : (
                filteredEntries.map((row) => {
                  const rawAmount = Number(row.amount || 0);
                  let signedAmount = rawAmount;
                  const t = row.type;
                  if (t === 'CashAdvance' || t === 'GuestPayment') {
                    signedAmount = rawAmount;
                  } else if (t === 'CashReturn' || t === 'Expense') {
                    signedAmount = -rawAmount;
                  }

                  const sign = signedAmount < 0 ? '-' : '+';
                  const absAmount = Math.abs(signedAmount).toFixed(2);
                  const TYPE_LABELS_ES = {
                    GuestPayment: 'Pago Huésped',
                    CashReturn: 'Entrega de Efectivo',
                    Expense: 'Gasto',
                  };

                  const mainLabel = TYPE_LABELS_ES[row.type] || row.type || 'Entry';
                  const rawStatus = row.status || '';
                  const isSupervisorApprovedLocked =
                    isSupervisor && (rawStatus === 'Approved' || rawStatus === 'Allocated');
                  const displayStatus =
                    isSupervisorApprovedLocked && rawStatus === 'Allocated'
                      ? 'Approved'
                      : rawStatus;
                  const isSupervisorCashAdvanceLocked = isSupervisor && row.type === 'CashAdvance';
                  const isRowLocked = isSupervisorApprovedLocked || isSupervisorCashAdvanceLocked;
                  const dateLabel = row.date || row.createdAt || row.allocatedAt || '';

                  // Format date as dd-mm-yyyy (use first 10 chars YYYY-MM-DD)
                  const formattedDate = dateLabel
                    ? dateLabel.slice(0, 10).split('-').reverse().join('-')
                    : '';

                  return (
                    <Box
                      key={row.id}
                      onClick={() => {
                        if (!isRowLocked) {
                          navigate(`/m/employee-cash/edit/${row.id}`);
                        }
                      }}
                      sx={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        px: 2,
                        py: 1.25,
                        borderBottom: '1px solid #F1F4F5',
                        cursor: isRowLocked ? 'default' : 'pointer',
                      }}
                    >
                      {/* Date column: date (top) + status (bottom) */}
                      <Box sx={{ width: '100px', minWidth: '100px', pr: 1, flexShrink: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {formattedDate || '-'}
                        </Typography>
                        {displayStatus && (
                          <Typography
                            variant="caption"
                            sx={{
                              fontWeight: 600,
                              color:
                                displayStatus === 'Approved'
                                  ? '#1E6F68' // teal
                                  : displayStatus === 'Pending'
                                  ? '#d4a017' // yellow
                                  : displayStatus === 'Rejected'
                                  ? '#c62828' // red
                                  : 'text.secondary',
                            }}
                          >
                            {displayStatus}
                          </Typography>
                        )}
                      </Box>

                      {/* Type column: type (top) + notes (bottom) */}
                      <Box sx={{ flex: 1, pr: 1, minWidth: 0 }}>
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: 600,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {mainLabel}
                        </Typography>
                        {row.notes && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              display: 'block',
                            }}
                          >
                            {row.notes}
                          </Typography>
                        )}
                      </Box>

                      {/* Amount column: amount (top) + attachment icon (bottom, if any) */}
                      <Box
                        sx={{
                          width: '80px',
                          minWidth: '80px',
                          flexShrink: 0,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'flex-end',
                          justifyContent: 'center',
                          gap: 0.25,
                        }}
                      >
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: 600,
                            color: signedAmount < 0 ? 'red' : 'green',
                            whiteSpace: 'nowrap',
                            textAlign: 'right',
                          }}
                        >
                          {sign}
                          {new Intl.NumberFormat('de-DE', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          }).format(Number(absAmount))}
                        </Typography>

                        {Array.isArray(row.attachments) && row.attachments.length > 0 && (
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 0.5,
                              mt: 0.25,
                            }}
                          >
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation(); // prevent triggering row click / edit
                                const valid = row.attachments.filter(
                                  (att) => att && att.url,
                                );
                                if (!valid.length) return;
                                // Add cache-busting to each URL
                                const urls = valid.map((att) => `${att.url}?v=${Date.now()}`);
                                setPreviewAttachments(urls);
                              }}
                              sx={{
                                padding: 0,
                                color: '#1E6F68',
                              }}
                            >
                              <AttachFileIcon sx={{ fontSize: 18 }} />
                            </IconButton>
                            {row.attachments.length > 1 && (
                              <Typography
                                variant="caption"
                                sx={{ fontSize: '0.7rem', color: '#555' }}
                              >
                                x{row.attachments.length}
                              </Typography>
                            )}
                          </Box>
                        )}
                      </Box>
                    </Box>
                  );
                })
              )}
            </Box>
          </Box>
        </Box>
      </Box>
      {Array.isArray(previewAttachments) && previewAttachments.length > 0 && (
        <Box
          sx={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.8)',
            zIndex: 1300,
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            overflow: 'hidden',
          }}
          onClick={() => setPreviewAttachments(null)}
        >
          <Box
            sx={{
              position: 'relative',
              flex: 1,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              p: 0,
              width: '100vw',
              height: '100%',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()} // prevent closing when interacting with content
          >
            {/* Floating close "X" on top-right of the image(s) */}
            <IconButton
              onClick={() => setPreviewAttachments(null)}
              sx={{
                position: 'absolute',
                top: 12,
                right: 12,
                backgroundColor: 'rgba(0,0,0,0.6)',
                color: '#ffffff',
                zIndex: 1400,
                '&:hover': {
                  backgroundColor: 'rgba(0,0,0,0.8)',
                },
              }}
              size="small"
            >
              <CloseIcon />
            </IconButton>

            <Box
              sx={{
                maxWidth: '100%',
                maxHeight: '100%',
                width: '100%',
                height: '100%',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 1,
                p: 1,
              }}
            >
              {previewAttachments.map((url, idx) => (
                <Box
                  key={idx}
                  component="img"
                  src={url}
                  alt={`Attachment ${idx + 1}`}
                  sx={{
                    maxWidth: '100%',
                    maxHeight: '80vh',
                    objectFit: 'contain',
                    borderRadius: 0,
                  }}
                />
              ))}
            </Box>
          </Box>
          <Box
            sx={{
              p: 1.5,
              textAlign: 'center',
              backgroundColor: '#ffffff',
              cursor: 'pointer',
            }}
            onClick={() => setPreviewAttachments(null)}
          >
            <Typography
              variant="button"
              sx={{ fontWeight: 600, color: '#1E6F68' }}
            >
              Cerrar
            </Typography>
          </Box>
        </Box>
      )}
      <Box
        sx={{
          position: 'fixed',
          right: 16,
          bottom: 16,
          zIndex: 1200,
        }}
      >
        <IconButton
          onClick={() => navigate('/m/employee-cash/new')}
          sx={{
            background: '#1E6F68',
            color: 'white',
            width: 56,
            height: 56,
            borderRadius: '50%',
            boxShadow: '0 3px 8px rgba(0,0,0,0.25)',
            '&:hover': {
              background: '#185b56',
            },
          }}
        >
          <AddIcon />
        </IconButton>
      </Box>
    </Box>
  );
}