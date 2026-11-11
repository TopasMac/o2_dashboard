import { getReportClosingBalance } from './unitMonthlyReportBalance';

const report = {
  openingBalance: 28559.43,
  monthlyResult: 2260,
  balanceMovements: -20000,
};

test('prefers the closing balance provided by the report', () => {
  expect(getReportClosingBalance({ ...report, closingBalance: 10819.43 }, 999))
    .toBe(10819.43);
  expect(getReportClosingBalance({ ...report, closingBalance: 0 })).toBe(0);
});

test.each([
  [-20000, 10819.43],
  [-40000, -9180.57],
  [undefined, 30819.43],
])('calculates the closing balance with movements of %s', (balanceMovements, expected) => {
  expect(getReportClosingBalance({ ...report, balanceMovements })).toBeCloseTo(expected, 2);
});

test('uses the derived client month result when the report has no closing balance', () => {
  expect(getReportClosingBalance(report, 1000)).toBeCloseTo(9559.43, 2);
});

test('returns null when there is insufficient data to calculate a balance', () => {
  expect(getReportClosingBalance({ openingBalance: 100 })).toBeNull();
});
