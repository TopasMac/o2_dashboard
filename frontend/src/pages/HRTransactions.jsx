import React, { useEffect, useState } from "react";
import { Box, Button, Typography, CircularProgress, Alert, Stack } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import TableLite from "../components/layout/TableLite";
import api from "../api";
import AppDrawer from "../components/common/AppDrawer";
import HRTransactionsNewFormRHF from "../components/forms/HRTransactionsNewFormRHF";
import HRTransactionsEditFormRHF from "../components/forms/HRTransactionsEditFormRHF";
import HRPaymentDrawer from "../components/common/HRPaymentDrawer";
import PageScaffold from "../components/layout/PageScaffold";

function formatDate(dateStr) {
  if (!dateStr) return "";
  if (typeof dateStr === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split("-");
    return `${d}-${m}-${y}`;
  }
  // Fallback for unexpected inputs
  try {
    const dt = new Date(dateStr);
    if (isNaN(dt)) return "";
    const day = String(dt.getDate()).padStart(2, "0");
    const month = String(dt.getMonth() + 1).padStart(2, "0");
    const year = dt.getFullYear();
    return `${day}-${month}-${year}`;
  } catch {
    return "";
  }
}

function formatAmount(amount) {
  if (amount === null || amount === undefined) return "";
  const n = typeof amount === "number" ? amount : parseFloat(String(amount));
  if (Number.isNaN(n)) return "";
  return n
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".")
    .replace(".", ",");
}

const HRTransactions = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [paymentDrawerOpen, setPaymentDrawerOpen] = useState(false);
  const [editDrawerOpen, setEditDrawerOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState(null);

  const columns = [
    {
      header: "Code",
      accessor: "code",
      cell: (row) => (
        <span
          style={{
            color: "#1E6F68",
            cursor: "pointer",
          }}
          onMouseEnter={(e) => (e.target.style.color = "#D9822B")}
          onMouseLeave={(e) => (e.target.style.color = "#1E6F68")}
          onClick={() => {
            setSelectedRow(row);
            setEditDrawerOpen(true);
          }}
        >
          {row.code}
        </span>
      ),
    },
    {
      header: "Name",
      accessor: "shortName",
      filter: {
        type: "autocomplete",
      },
    },
    { header: "Division", accessor: "division", filterable: true, filterType: "select" },
    { header: "Cost Centre", accessor: "costCentre", filterable: true, filterType: "select" },
    { header: "Type", accessor: "type", filterable: true, filterType: "select", cell: (row) => row?.type ? row.type.charAt(0).toUpperCase() + row.type.slice(1).toLowerCase() : "" },
    { header: "Amount", accessor: "amount", cell: (row) => formatAmount(row?.amount) },
    { header: "From", accessor: "periodStart", filterable: true, filterType: "monthYear", cell: (row) => formatDate(row?.periodStart) },
    { header: "To", accessor: "periodEnd", cell: (row) => formatDate(row?.periodEnd) },
    { header: "Notes", accessor: "notes" },
  ];

  const exportLedger = () => {
    // Placeholder for exporting functionality
    // Similar to Owners2UnitTransactions
    alert("Export functionality coming soon.");
  };

  const fetchData = () => {
    setLoading(true);
    setError(null);
    api
      .get("/api/employee-ledger")
      .then((res) => {
        const payload = res.data || {};
        const list = Array.isArray(payload) ? payload : (payload.rows || []);
        const mapped = list.map((item, idx) => ({
          id: item.id ?? idx,
          code: item.code,
          shortName: item.shortName ?? item.employee?.shortName ?? item.employeeShortName ?? "",
          division: item.division,
          costCentre: item.costCentre,
          type: item.type,
          amount: item.amount,
          periodStart: item.periodStart,
          periodEnd: item.periodEnd,
          notes: item.notes,
          createdAt: item.createdAt,
        }));
        // Sort rows by "From" (periodStart) — latest first
        const sorted = mapped.sort((a, b) => {
          const da = new Date(a.periodStart || 0);
          const db = new Date(b.periodStart || 0);
          return db - da; // newest first
        });
        setRows(sorted);
      })
      .catch(() => setError("Failed to load employee ledger data."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDelete = async () => {
    if (!selectedRow?.id) return;
    // eslint-disable-next-line no-alert
    const confirmed = window.confirm(
      `Are you sure you want to delete transaction "${selectedRow.code}"?`
    );
    if (!confirmed) return;
    try {
      await api.delete(`/api/employee-ledger/${selectedRow.id}`);
      setEditDrawerOpen(false);
      fetchData();
    } catch (e) {
      // eslint-disable-next-line no-alert
      alert(e?.response?.data?.message || "Failed to delete HR transaction");
    }
  };

  const stickyHeader = (
    <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ flexWrap: "wrap" }}>
      <Button
        variant="outlined"
        color="primary"
        startIcon={<AddIcon />}
        onClick={() => setDrawerOpen(true)}
        sx={{
          textTransform: "none",
          borderColor: "#4E8379",
          color: "#4E8379",
          "&:hover": { backgroundColor: "rgba(78,131,121,0.08)", borderColor: "#4E8379" },
        }}
      >
        + Add
      </Button>
      <Button
        variant="outlined"
        color="error"
        sx={{
          textTransform: "none",
          borderColor: "#E57373",
          color: "#E57373",
          "&:hover": { backgroundColor: "rgba(229,115,115,0.08)", borderColor: "#E57373" },
        }}
        onClick={() => { fetchData(); }}
      >
        Reset filters
      </Button>
      <Button
        variant="contained"
        color="primary"
        sx={{
          textTransform: "none",
          backgroundColor: "#4E8379",
          "&:hover": { backgroundColor: "#3c685f" },
        }}
        onClick={() => setPaymentDrawerOpen(true)}
      >
        Request Payment
      </Button>
    </Stack>
  );

  return (
    <PageScaffold
      title="HR Transactions"
      sectionKey="transactions"
      currentPath="/hr-transactions"
      layout="table"
      stickyHeader={stickyHeader}
    >
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 5 }}>
          <CircularProgress />
        </Box>
      ) : (
        <TableLite
          rows={rows}
          columns={columns}
          enableFilters
          autoFilter
          optionsSourceRows={rows}
        />
      )}
      <AppDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="New HR Transaction"
        width={420}
        showActions
        formId="hr-ledger-new-form"
      >
        <HRTransactionsNewFormRHF
          onSubmit={async (payload) => {
            try {
              setSaving(true);
              await api.post('/api/employee-ledger', payload);
              setDrawerOpen(false);
              fetchData();
            } catch (e) {
              // eslint-disable-next-line no-alert
              alert(e?.response?.data?.message || 'Failed to create HR transaction');
            } finally {
              setSaving(false);
            }
          }}
        />
        {saving && (
          <Typography variant="caption" sx={{ mt: 1, display: 'block' }}>
            Saving…
          </Typography>
        )}
      </AppDrawer>
      <AppDrawer
        open={editDrawerOpen}
        onClose={() => setEditDrawerOpen(false)}
        title="Edit HR Transaction"
        width={420}
        showActions
        formId="hr-ledger-edit-form"
        actions={{ showDelete: true }}
        onDelete={handleDelete}
      >
        {selectedRow && (
          <HRTransactionsEditFormRHF
            defaultValues={selectedRow}
            onSubmit={async (payload) => {
              try {
                await api.put(`/api/employee-ledger/${selectedRow.id}`, payload);
                setEditDrawerOpen(false);
                fetchData();
              } catch (e) {
                // eslint-disable-next-line no-alert
                alert(e?.response?.data?.message || "Failed to update HR transaction");
              }
            }}
          />
        )}
      </AppDrawer>
      <HRPaymentDrawer
        open={paymentDrawerOpen}
        onClose={() => setPaymentDrawerOpen(false)}
        onExport={({ division, employees, selectedAmounts }) => {
          try {
            // Build CSV content (semicolon-separated)
            const headers = [
              'employee_code',
              'bank_holder',
              'bank_name',
              'bank_account',
              'amount',
            ];

            // Map selected ids to rows
            const rows = Object.entries(selectedAmounts || {})
              .filter(([, amt]) => amt !== null && amt !== undefined && String(amt).trim() !== '' && !isNaN(Number(amt)))
              .map(([empId, amt]) => {
                const emp = (employees || []).find((e) => String(e.id) === String(empId)) || {};
                const employeeCode = emp.code || '';
                const bankHolder = emp.bankHolder || emp.name || emp.fullName || '';
                const bankName = emp.bankName || '';
                const bankAccount = emp.bankAccount || '';
                const amount = Number(amt).toFixed(2);
                // Escape semicolons or line breaks if ever present
                const safe = (v) => String(v).replace(/[\n\r]/g, ' ').replace(/;/g, ',');
                return [employeeCode, bankHolder, bankName, bankAccount, amount].map(safe).join(';');
              });

            const csv = [headers.join(';'), ...rows].join('\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const now = new Date();
            const y = now.getFullYear();
            const m = String(now.getMonth() + 1).padStart(2, '0');
            const d = String(now.getDate()).padStart(2, '0');
            a.href = url;
            a.download = `hr_payment_request_${division || 'all'}_${y}${m}${d}.csv`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
          } catch (err) {
            // eslint-disable-next-line no-alert
            alert('Failed to export CSV');
          }
        }}
      />
    </PageScaffold>
  );
};

export default HRTransactions;
