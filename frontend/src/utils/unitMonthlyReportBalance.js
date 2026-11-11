export function getReportClosingBalance(bundle, monthlyResultOverride) {
  const direct = Number(
    bundle?.closingBalance ?? bundle?.closing_balance ?? bundle?.closing
  );
  if (Number.isFinite(direct)) return direct;

  const opening = Number(
    bundle?.openingBalance ?? bundle?.opening_balance ?? bundle?.opening
  );

  const monthResult = Number(
    monthlyResultOverride ?? bundle?.monthlyResult ?? bundle?.monthly_result ?? bundle?.result
  );

  const movements = Number(
    bundle?.balanceMovements ?? bundle?.balance_movements ?? bundle?.movements ?? 0
  );

  if (Number.isFinite(opening) && Number.isFinite(monthResult)) {
    return opening + monthResult + (Number.isFinite(movements) ? movements : 0);
  }

  return null;
}
