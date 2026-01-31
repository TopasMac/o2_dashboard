import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Typography,
  CircularProgress,
  Alert,
  Stack,
  Divider,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Tooltip,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import EditCalendarIcon from "@mui/icons-material/EditCalendar";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import TableLite from "../components/layout/TableLite";
import api from "../api";
import AppDrawer from "../components/common/AppDrawer";
import HRTransactionsNewFormRHF from "../components/forms/HRTransactionsNewFormRHF";
import HRTransactionsEditFormRHF from "../components/forms/HRTransactionsEditFormRHF";
import HRPaymentDrawer from "../components/common/HRPaymentDrawer";
import HRDiscountModal from "../components/modals/HRDiscountModal";
import BaseModal from "../components/common/BaseModal";
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

function buildDeductionNote(deductionRow) {
  if (!deductionRow) return "";

  // Try common field names for installment counters; fall back gracefully.
  const current =
    deductionRow.installmentCurrent ??
    deductionRow.installment_current ??
    deductionRow.installmentNumber ??
    deductionRow.installment_number ??
    deductionRow.part ??
    deductionRow.current ??
    null;

  const total =
    deductionRow.installmentTotal ??
    deductionRow.installment_total ??
    deductionRow.installmentsTotal ??
    deductionRow.installments_total ??
    deductionRow.total ??
    deductionRow.parts ??
    null;

  // Fallback: try to parse installment counters from notes like "Loan repayment 1/4 ..." or "1/4"
  let parsedCurrent = current;
  let parsedTotal = total;
  if ((!parsedCurrent || !parsedTotal) && typeof deductionRow.notes === "string") {
    const m = deductionRow.notes.match(/(\d+)\s*\/\s*(\d+)/);
    if (m) {
      parsedCurrent = parsedCurrent || parseInt(m[1], 10);
      parsedTotal = parsedTotal || parseInt(m[2], 10);
    }
  }

  // Ensure amount is formatted as positive and displayed as MXN-style: $1.500,00
  const rawAmt =
    typeof deductionRow.amount === "number" ? deductionRow.amount : parseFloat(String(deductionRow.amount));
  const amtNum = Number.isFinite(rawAmt) ? Math.abs(rawAmt) : NaN;
  const amt = (() => {
    if (!Number.isFinite(amtNum)) return "";
    const fixed = amtNum.toFixed(2); // 1500.00
    const [intPart, decPart] = fixed.split(".");
    const intFmt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return `$${intFmt},${decPart}`;
  })();

  if (parsedCurrent && parsedTotal) {
    return `Descuento ${parsedCurrent}/${parsedTotal} de ${amt} pesos`;
  }
  return `Descuento de ${amt} pesos`;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toYmd(dt) {
  const y = dt.getFullYear();
  const m = pad2(dt.getMonth() + 1);
  const d = pad2(dt.getDate());
  return `${y}-${m}-${d}`;
}

function todayYmd() {
  return toYmd(new Date());
}

function endOfMonthDate(year, monthIndex0) {
  // monthIndex0: 0-11
  return new Date(year, monthIndex0 + 1, 0);
}

function buildMonthOptions(pastCount = 3, futureCount = 2) {
  const now = new Date();
  const opts = [];
  for (let i = -pastCount; i <= futureCount; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const y = d.getFullYear();
    const m0 = d.getMonth();
    const value = `${y}-${pad2(m0 + 1)}`;
    const label = d.toLocaleString(undefined, { month: "long", year: "numeric" });
    opts.push({ value, label, year: y, monthIndex0: m0 });
  }
  return opts;
}

function computeHalfPeriods(year, monthIndex0) {
  const start1 = new Date(year, monthIndex0, 1);
  const end1 = new Date(year, monthIndex0, 15);
  const start2 = new Date(year, monthIndex0, 16);
  const end2 = endOfMonthDate(year, monthIndex0);
  return {
    h1: { periodStart: toYmd(start1), periodEnd: toYmd(end1) },
    h2: { periodStart: toYmd(start2), periodEnd: toYmd(end2) },
  };
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
  const [discountModalOpen, setDiscountModalOpen] = useState(false);
  const [discountRow, setDiscountRow] = useState(null);

  const theme = useTheme();
  const isXs = useMediaQuery(theme.breakpoints.down("sm"));

  // Payments helper (simple paid/unpaid tracking via salary rows)
  const monthOptions = useMemo(() => buildMonthOptions(3, 2), []);
  const [paymentsOpen, setPaymentsOpen] = useState(false);
  const openRequestPaymentFromPayments = () => {
    setPaymentsOpen(false);
    setPaymentDrawerOpen(true);
  };
  const [paymentsMonth, setPaymentsMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
  });
  const [employeesOpt, setEmployeesOpt] = useState([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentsError, setPaymentsError] = useState(null);
  const [salaryRows, setSalaryRows] = useState([]);
  const [deductionRows, setDeductionRows] = useState([]);

  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payTarget, setPayTarget] = useState(null); // { employee, halfKey: 'h1'|'h2', periodStart, periodEnd }
  const [payAmount, setPayAmount] = useState("");
  const [payNotes, setPayNotes] = useState("");
  const [payDate, setPayDate] = useState(todayYmd());
  const [paySaving, setPaySaving] = useState(false);

  const handlePaySave = async () => {
    if (!payTarget?.employeeId) return;
    const amt = String(payAmount || "").trim();
    if (!amt) {
      // eslint-disable-next-line no-alert
      alert("Please enter an amount.");
      return;
    }
    try {
      setPaySaving(true);
      await api.post("/api/employee-ledger", {
        employeeId: payTarget.employeeId,
        employee_id: payTarget.employeeId,
        type: "salary",
        date: payDate,
        amount: amt,
        period_start: payTarget.periodStart,
        period_end: payTarget.periodEnd,
        notes: payNotes || "",
      });
      setPayModalOpen(false);
      await loadPaymentsData();
      fetchData();
    } catch (e) {
      // eslint-disable-next-line no-alert
      alert(e?.response?.data?.message || "Failed to register payment");
    } finally {
      setPaySaving(false);
    }
  };

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
    {
      header: "Type",
      accessor: "type",
      filterable: true,
      filterType: "select",
      cell: (row) =>
        row?.type
          ? row.type.charAt(0).toUpperCase() + row.type.slice(1).toLowerCase()
          : "",
    },
    { header: "Amount", accessor: "amount", cell: (row) => formatAmount(row?.amount) },
    {
      header: "Granted",
      accessor: "date",
      cell: (row) => {
        if (row?.type === "advance" || row?.type === "salary") {
          return formatDate(row?.date || row?.createdAt);
        }
        return "";
      },
    },
    {
      header: "From",
      accessor: "periodStart",
      filterable: true,
      filterType: "monthYear",
      cell: (row) => formatDate(row?.periodStart),
    },
    { header: "To", accessor: "periodEnd", cell: (row) => formatDate(row?.periodEnd) },
    { header: "Notes", accessor: "notes" },
    {
      header: "",
      accessor: "_actions",
      cell: (row) =>
        row?.type === "deduction" ? (
          <EditCalendarIcon
            sx={{
              color: "#1E6F68",
              cursor: "pointer",
              "&:hover": { color: "#D9822B" },
            }}
            titleAccess="Edit deduction period"
            onClick={() => {
              console.debug('[HRTransactions] open HRDiscountModal row:', row);
              setDiscountRow(row);
              setDiscountModalOpen(true);
            }}
          />
        ) : null,
    },
  ];

  const selectedMonthMeta = useMemo(() => {
    const found = monthOptions.find((o) => o.value === paymentsMonth);
    return found || monthOptions[0] || null;
  }, [monthOptions, paymentsMonth]);

  const halfPeriods = useMemo(() => {
    if (!selectedMonthMeta) return null;
    return computeHalfPeriods(selectedMonthMeta.year, selectedMonthMeta.monthIndex0);
  }, [selectedMonthMeta]);

  const salaryIndex = useMemo(() => {
    // key: `${employeeId}|${periodStart}|${periodEnd}` -> row
    const idx = new Map();
    (salaryRows || []).forEach((r) => {
      const eid = r.employeeId ?? r.employee_id ?? r.employee?.id ?? r.employee?.id ?? null;
      const ps = r.periodStart || r.period_start || "";
      const pe = r.periodEnd || r.period_end || "";
      if (!eid || !ps || !pe) return;
      idx.set(`${eid}|${ps}|${pe}`, r);
    });
    return idx;
  }, [salaryRows]);

  const deductionIndex = useMemo(() => {
    // key: `${employeeId}|${periodStart}|${periodEnd}` -> row
    const idx = new Map();
    (deductionRows || []).forEach((r) => {
      const eid = r.employeeId ?? r.employee_id ?? r.employee?.id ?? null;
      const ps = r.periodStart || r.period_start || "";
      const pe = r.periodEnd || r.period_end || "";
      if (!eid || !ps || !pe) return;
      idx.set(`${eid}|${ps}|${pe}`, r);
    });
    return idx;
  }, [deductionRows]);

  const paymentsTableRows = useMemo(() => {
    const list = Array.isArray(employeesOpt) ? employeesOpt : [];
    return list.map((e, i) => {
      const eid = e.id ?? e.value ?? null;
      const shortName = e.shortName || e.label || e.name || "";
      const division = e.division || "";
      return {
        id: eid ?? `emp-${i}`,
        employeeId: eid,
        shortName,
        division,
        _employeeRaw: e,
      };
    });
  }, [employeesOpt]);

  // Hoisted openPayModal to ensure it's always up-to-date for paymentsColumns
  function openPayModal(employeeRow, halfKey) {
    if (!halfPeriods) return;
    const half = halfKey === "h2" ? halfPeriods.h2 : halfPeriods.h1;
    const employee = employeeRow?._employeeRaw || employeeRow;

    const employeeId = employeeRow?.employeeId ?? employee?.id ?? employee?.value ?? null;
    const k = `${employeeId}|${half.periodStart}|${half.periodEnd}`;
    const dedRow = deductionIndex.get(k);
    const dedNote = buildDeductionNote(dedRow);

    setPayTarget({
      employee,
      employeeId,
      employeeShortName: employeeRow?.shortName || employee?.shortName || employee?.label || "",
      halfKey,
      periodStart: half.periodStart,
      periodEnd: half.periodEnd,
      deductionRow: dedRow || null,
      deductionNote: dedNote || "",
    });
    const rawSalary =
      employeeRow?.current_salary ??
      employee?.current_salary ??
      employeeRow?.currentSalary ??
      employee?.currentSalary ??
      null;

    const salaryNum = rawSalary === null || rawSalary === undefined ? NaN : parseFloat(String(rawSalary));
    const halfSalary = Number.isFinite(salaryNum) ? (salaryNum / 2).toFixed(2) : "";

    // If there is a deduction for this same period, default the payment Amount to net-to-transfer.
    // Deductions are stored as negative amounts; subtract the absolute value from the gross half-salary.
    const grossNum = halfSalary ? parseFloat(String(halfSalary)) : NaN;
    const dedNumRaw = dedRow?.amount === undefined || dedRow?.amount === null ? NaN : parseFloat(String(dedRow.amount));
    const dedAbs = Number.isFinite(dedNumRaw) ? Math.abs(dedNumRaw) : 0;

    if (dedRow && Number.isFinite(grossNum)) {
      const net = Math.max(grossNum - dedAbs, 0);
      setPayAmount(net.toFixed(2));
    } else {
      setPayAmount(halfSalary);
    }
    setPayNotes(dedNote || "");
    setPayDate(todayYmd());
    setPayModalOpen(true);
  }

  const paymentsColumns = useMemo(() => {
    const renderPaidCell = (halfKey) => (r) => {
      if (!halfPeriods) return null;
      const half = halfKey === "h2" ? halfPeriods.h2 : halfPeriods.h1;
      const k = `${r.employeeId}|${half.periodStart}|${half.periodEnd}`;
      const paidRow = salaryIndex.get(k);
      const isPaid = !!paidRow;
      const Icon = isPaid ? CheckCircleIcon : RadioButtonUncheckedIcon;
      const color = isPaid ? "#1E6F68" : "#9aa7a6";
      const title = isPaid ? `Paid (${paidRow.code || paidRow.id})` : "Not paid — click to register";
      return (
        <Tooltip title={title}>
          <span>
            <Icon
              sx={{ color, cursor: isPaid ? "default" : "pointer" }}
              onClick={() => {
                if (!isPaid) openPayModal(r, halfKey);
              }}
            />
          </span>
        </Tooltip>
      );
    };

    // Always use the compact layout (drawer width is limited even on desktop)
    return [
      {
        header: "Name",
        accessor: "shortName",
        filter: { type: "autocomplete" },
        cell: (row) => (
          <span>
            {row.shortName}
            {row.division ? (
              <Typography
                variant="caption"
                sx={{ display: "block", color: "#9aa7a6", fontSize: "0.75rem", mt: 0.2 }}
              >
                {row.division}
              </Typography>
            ) : null}
          </span>
        ),
      },
      {
        header: (
          <Tooltip title="First half (01–15)">
            <span>H1</span>
          </Tooltip>
        ),
        accessor: "_h1",
        cell: renderPaidCell("h1"),
      },
      {
        header: (
          <Tooltip title="Second half (16–EOM)">
            <span>H2</span>
          </Tooltip>
        ),
        accessor: "_h2",
        cell: renderPaidCell("h2"),
      },
    ];
  }, [halfPeriods, salaryIndex, deductionIndex, paymentsTableRows]);

  const loadPaymentsData = async () => {
    if (!halfPeriods || !selectedMonthMeta) return;
    setPaymentsLoading(true);
    setPaymentsError(null);
    try {
      // Employees options (for display)
      const empRes = await api.get("/api/employees/options");
      const empPayload = empRes.data || {};
      const empList = Array.isArray(empPayload) ? empPayload : empPayload.options || empPayload.rows || empPayload.items || [];
      setEmployeesOpt(empList);

      // Salary rows for this month (use full month range)
      const monthStart = `${selectedMonthMeta.year}-${pad2(selectedMonthMeta.monthIndex0 + 1)}-01`;
      const monthEnd = toYmd(endOfMonthDate(selectedMonthMeta.year, selectedMonthMeta.monthIndex0));
      const salRes = await api.get("/api/employee-ledger", {
        params: {
          type: "salary",
          periodStart: monthStart,
          periodEnd: monthEnd,
          limit: 500,
        },
      });
      const salPayload = salRes.data || {};
      const salList = Array.isArray(salPayload) ? salPayload : salPayload.rows || [];
      setSalaryRows(salList);

      const dedRes = await api.get("/api/employee-ledger", {
        params: {
          type: "deduction",
          periodStart: monthStart,
          periodEnd: monthEnd,
          limit: 500,
        },
      });
      const dedPayload = dedRes.data || {};
      const dedList = Array.isArray(dedPayload) ? dedPayload : dedPayload.rows || [];
      setDeductionRows(dedList);
    } catch (e) {
      setPaymentsError(e?.response?.data?.message || "Failed to load payments data");
    } finally {
      setPaymentsLoading(false);
    }
  };


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
        const list = Array.isArray(payload) ? payload : payload.rows || [];
        const mapped = list.map((item, idx) => ({
          id: item.id ?? idx,
          code: item.code,
          // keep a few employee identifiers so modals/forms can resolve employeeId reliably
          employeeId: item.employeeId ?? item.employee_id ?? item.employee?.id ?? null,
          employee: item.employee ?? null,
          shortName: item.shortName ?? item.employee?.shortName ?? item.employeeShortName ?? "",
          division: item.division,
          costCentre: item.costCentre,
          type: item.type,
          amount: item.amount,
          date: item.date,
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

  useEffect(() => {
    if (!paymentsOpen) return;
    loadPaymentsData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentsOpen, paymentsMonth]);

  const handleDelete = async () => {
    if (!selectedRow?.id) return;
    // eslint-disable-next-line no-alert
    const confirmed = window.confirm(`Are you sure you want to delete transaction "${selectedRow.code}"?`);
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
        Add
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
        onClick={() => {
          fetchData();
        }}
      >
        Reset filters
      </Button>
  <Button
    variant="contained"
    sx={{
      textTransform: "none",
      backgroundColor: "#4E8379",
      color: "#fff",
      "&:hover": { backgroundColor: "#3c685f" },
    }}
    onClick={() => setPaymentsOpen(true)}
  >
    Payments
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
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 5 }}>
          <CircularProgress />
        </Box>
      ) : (
        <TableLite rows={rows} columns={columns} enableFilters autoFilter optionsSourceRows={rows} />
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
              await api.post("/api/employee-ledger", payload);
              setDrawerOpen(false);
              fetchData();
            } catch (e) {
              // eslint-disable-next-line no-alert
              alert(e?.response?.data?.message || "Failed to create HR transaction");
            } finally {
              setSaving(false);
            }
          }}
        />
        {saving && (
          <Typography variant="caption" sx={{ mt: 1, display: "block" }}>
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
      />
      {discountRow && (
        <HRDiscountModal
          open={discountModalOpen}
          row={discountRow}
          onClose={() => {
            setDiscountModalOpen(false);
            setDiscountRow(null);
          }}
          onSave={async (row, payload) => {
            try {
              await api.patchJson(`/api/employee-ledger/${row.id}`, payload);
              setDiscountModalOpen(false);
              setDiscountRow(null);
              fetchData();
            } catch (e) {
              alert(e?.response?.data?.message || "Failed to update deduction");
            }
          }}
        />
      )}
      <AppDrawer
        open={paymentsOpen}
        onClose={() => setPaymentsOpen(false)}
        title="HR Payments"
        width={720}
        showActions={false}
      >
        <Stack spacing={2}>
          <Typography variant="body2" sx={{ color: "#5d8782" }}>
            Paid status is inferred from existing <b>salary</b> rows in the ledger for the selected half-month period.
          </Typography>

          <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
            <FormControl size="small" sx={{ minWidth: 220 }}>
              <InputLabel id="hr-payments-month-label">Month</InputLabel>
              <Select
                labelId="hr-payments-month-label"
                label="Month"
                value={paymentsMonth}
                onChange={(e) => setPaymentsMonth(e.target.value)}
              >
                {monthOptions.map((o) => (
                  <MenuItem key={o.value} value={o.value}>
                    {o.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Button
              variant="outlined"
              sx={{
                textTransform: "none",
                borderColor: "#4E8379",
                color: "#4E8379",
                "&:hover": { backgroundColor: "rgba(78,131,121,0.08)", borderColor: "#4E8379" },
              }}
              onClick={openRequestPaymentFromPayments}
            >
              Request Payment
            </Button>
          </Box>

          <Divider />

          {paymentsError && <Alert severity="error">{paymentsError}</Alert>}
          {paymentsLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
              <CircularProgress />
            </Box>
          ) : (
            <Box sx={{ width: "100%", overflowX: "hidden" }}>
              <TableLite
                rows={paymentsTableRows}
                columns={paymentsColumns}
                enableFilters
                autoFilter
                optionsSourceRows={paymentsTableRows}
              />
            </Box>
          )}
        </Stack>
      </AppDrawer>

      <BaseModal
        open={payModalOpen}
        onClose={() => setPayModalOpen(false)}
        title={
          payTarget
            ? `Register payment: ${payTarget.employeeShortName} • ${formatDate(payTarget.periodStart)} → ${formatDate(
                payTarget.periodEnd
              )}`
            : "Register payment"
        }
        actions={
          <>
            <button
              type="button"
              className="btn-secondary"
              disabled={paySaving}
              onClick={() => setPayModalOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={paySaving}
              onClick={handlePaySave}
            >
              {paySaving ? "Saving…" : "Save"}
            </button>
          </>
        }
      >
        {payTarget && (
          <Stack spacing={2}>
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr", gap: 2 }}>
              <Box>
                <Typography variant="caption" sx={{ display: "block", mb: 0.5, color: "#5d8782" }}>
                  Date
                </Typography>
                <input
                  type="date"
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "1px solid rgba(0,0,0,0.18)",
                    fontSize: 14,
                  }}
                />
              </Box>

              <Box>
                <Typography variant="caption" sx={{ display: "block", mb: 0.5, color: "#5d8782" }}>
                  Amount
                </Typography>
                <input
                  type="number"
                  step="0.01"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  placeholder="0.00"
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "1px solid rgba(0,0,0,0.18)",
                    fontSize: 14,
                  }}
                />
              </Box>

              <Box>
                <Typography variant="caption" sx={{ display: "block", mb: 0.5, color: "#5d8782" }}>
                  Notes (optional)
                </Typography>
                {payTarget?.deductionNote ? (
                  <Typography variant="caption" sx={{ display: "block", mb: 0.8, color: "#D9822B" }}>
                    {payTarget.deductionNote}
                  </Typography>
                ) : null}
                <textarea
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  rows={3}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "1px solid rgba(0,0,0,0.18)",
                    fontSize: 14,
                    resize: "vertical",
                  }}
                />
              </Box>
            </Box>
          </Stack>
        )}
      </BaseModal>
    </PageScaffold>
  );
};

export default HRTransactions;
