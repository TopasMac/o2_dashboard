import { formatMobileGuestName } from './mobileFormatters';

describe('Mobile V2 display formatters', () => {
  test.each([
    ['Hector Salvador Flores Salazar', 'Hector Salazar'],
    ['Ana Martínez', 'Ana Martínez'],
    ['Yuriy', 'Yuriy'],
    ['  Blanca   Mendez Herrera  ', 'Blanca Herrera'],
    ['Flores Salazar, Hector Salvador', 'Hector Salazar'],
    ['', ''],
  ])('displays only first and last guest names for %p', (input, expected) => {
    expect(formatMobileGuestName(input)).toBe(expected);
  });
});
