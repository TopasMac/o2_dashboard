// Helpers + types for wiring BookingEditFormRHF in multiple pages (AirbnbCalTable, Notifications, etc.)

// ---- Types -----------------------------------------------------------------
export type IcalStatus = 'suspected_cancelled' | 'conflict' | 'default';

export interface BookingRow {
  status?: IcalStatus | string;
  // display + link choice
  reservationCode?: string;
  confirmationCode?: string;
  reservationUrl?: string | null;
  bookingReservationUrl?: string | null;

  // diffs/proposals (from reconcile)
  diffs?: { checkIn?: boolean; checkOut?: boolean } | null;
  proposedCheckIn?: string | null;  // ISO yyyy-mm-dd
  proposedCheckOut?: string | null; // ISO yyyy-mm-dd

  // base info visible in the row
  bookingId?: number;
  unitId?: number | null;
  unitName?: string | null;
  source?: string | null;

  // current values (row fallback)
  checkIn?: string | null;
  checkOut?: string | null;
  payout?: number | null;
  cleaningFee?: number | null;
  commissionPercent?: number | null;
  guestName?: string | null;
  guests?: number | null;
  paymentMethod?: string | null;
  notes?: string | null;
  checkInNotes?: string | null;
  checkOutNotes?: string | null;
}

export interface BookingInit {
  id?: number;
  unit?: { id?: number | null; unitName?: string | null } | null;
  unitId?: number | null;
  unit_id?: number | null;

  status?: string | null;
  source?: string | null;

  checkIn?: string | null;
  check_in?: string | null;
  checkOut?: string | null;
  check_out?: string | null;

  payout?: number | null;
  cleaningFee?: number | null;
  commissionPercent?: number | null;
  commission_percent?: number | null;

  paymentMethod?: string | null;
  payment_method?: string | null;
  bookingPaymentMethod?: string | null;

  guestName?: string | null;
  guest_name?: string | null;

  notes?: string | null;
  checkInNotes?: string | null;
  check_in_notes?: string | null;
  checkOutNotes?: string | null;
  check_out_notes?: string | null;

  guests?: number | null;
  numGuests?: number | null;
}

export interface BannerWarn {
  tone: 'warn' | 'info';
  text?: string;
  title?: string;
  lines?: string[];
  note?: string;
  ctaUrl?: string | null;
  ctaLabel?: string;
  actions?: { label: string; type: string; url?: string | null }[];
}

// ---- Small utilities -------------------------------------------------------
const safeFmt = (fmt: (s?: string | null) => string, v?: string | null) =>
  (typeof fmt === 'function' ? fmt(v || undefined) : (v ?? ''));

const getCode = (row?: BookingRow | null) =>
  row?.reservationCode || row?.confirmationCode || '-';

// ---- Core helpers ----------------------------------------------------------
export function getScenario(row?: BookingRow | null): IcalStatus {
  if (row?.status === 'suspected_cancelled') return 'suspected_cancelled';
  if (row?.status === 'conflict') return 'conflict';
  return 'default';
}

export function buildBanner(
  row: BookingRow | null | undefined,
  fmtDMY: (s?: string | null) => string
): BannerWarn | null {
  const status = row?.status as IcalStatus | undefined;

  const url =
    status === 'suspected_cancelled'
      ? (row?.bookingReservationUrl || row?.reservationUrl || null)
      : (row?.reservationUrl || row?.bookingReservationUrl || null);

  if (status === 'suspected_cancelled') {
    return {
      tone: 'warn',
      text: `iCal suggests this reservation was cancelled ${getCode(row)}`,
      actions: [
        { label: 'Open', type: 'link', url },
        { label: 'Checked', type: 'ack' },
      ],
    };
  }

  if (status === 'conflict') {
    const lines: string[] = [];
    if (row?.diffs?.checkIn && row?.proposedCheckIn) {
      lines.push(`Check-in: ${safeFmt(fmtDMY, row.checkIn)} → ${safeFmt(fmtDMY, row.proposedCheckIn)}`);
    }
    if (row?.diffs?.checkOut && row?.proposedCheckOut) {
      lines.push(`Check-out: ${safeFmt(fmtDMY, row.checkOut)} → ${safeFmt(fmtDMY, row.proposedCheckOut)}`);
    }

    return {
      tone: 'info',
      title: 'Proposed changes from iCal',
      lines,
      note: '⚠️ Remember to update payout if dates changed.',
      actions: [{ label: 'Open', type: 'link', url }],
    };
  }

  return null;
}

export function buildInitialValues({
  row,
  init,
  fmtDMYslash,
}: {
  row: BookingRow;
  init?: BookingInit | null;
  fmtDMYslash: (s?: string | null) => string;
}) {
  const scenario = getScenario(row);

  // Originals (prefer the detailed fetch)
  const originalIn =
    init?.checkIn ?? init?.check_in ?? row?.checkIn ?? null;
  const originalOut =
    init?.checkOut ?? init?.check_out ?? row?.checkOut ?? null;

  // For conflicts keep inputs bound to originals (user must decide)
  const useIn = originalIn;
  const useOut = originalOut;

  const defaults = {
    payout:
      scenario === 'suspected_cancelled'
        ? 0
        : (init?.payout ?? row?.payout ?? 0),
    cleaningFee:
      scenario === 'suspected_cancelled'
        ? 0
        : (init?.cleaningFee ?? row?.cleaningFee ?? 0),
    status:
      scenario === 'suspected_cancelled'
        ? 'Cancelled'
        : (init?.status || row?.status || 'Active'),
  } as const;

  return {
    id: row?.bookingId,
    unitId:
      (init && (init.unitId ?? init.unit_id ?? init.unit?.id)) ??
      row?.unitId ??
      undefined,
    guestName: init?.guestName ?? init?.guest_name ?? row?.guestName ?? '',
    guests: init?.guests ?? init?.numGuests ?? row?.guests ?? undefined,
    paymentMethod:
      init?.paymentMethod ??
      init?.payment_method ??
      init?.bookingPaymentMethod ??
      row?.paymentMethod ??
      'platform',
    source: init?.source ?? row?.source ?? '',
    checkIn: safeFmt(fmtDMYslash, useIn),
    checkOut: safeFmt(fmtDMYslash, useOut),
    payout: defaults.payout,
    commissionPercent:
      typeof init?.commissionPercent === 'number'
        ? init.commissionPercent
        : typeof init?.commission_percent === 'number'
        ? init.commission_percent
        : typeof row?.commissionPercent === 'number'
        ? row.commissionPercent
        : undefined,
    notes: init?.notes ?? row?.notes ?? '',
    checkInNotes:
      init?.checkInNotes ??
      init?.check_in_notes ??
      row?.checkInNotes ??
      '',
    checkOutNotes:
      init?.checkOutNotes ??
      init?.check_out_notes ??
      row?.checkOutNotes ??
      '',
    cleaningFee: defaults.cleaningFee,
    status: defaults.status,
  };
}

export function buildFormUXFlags(row?: BookingRow | null) {
  const scenario = getScenario(row || undefined);
  return {
    showApplyProposedButtons: scenario === 'conflict',
    showCheckedButton: true,          // Always render
    disableDatesForSuspected: false,  // Keep editable; just prefill status/payout/cleaningFee
  };
}