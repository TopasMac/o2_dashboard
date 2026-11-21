import { buildWhatsappText, getSafeUrl, normalizeUnit } from './unitsModel';

const row = {
  id: 1,
  unit_name: 'CentralPark_022',
  city: 'Playa del Carmen',
  status: 'Active',
  unit_number: '22',
  unit_floor: '3',
  access_type: 'Lockbox',
  access_code: '1973',
  wifi_name: 'INFINITUM4E86',
  wifi_password: 'FJDkes8vWY',
  condo_name: 'Central Park',
  condo_door_code: '240622',
  condo_google_maps: 'https://maps.app.goo.gl/abc',
};

describe('units model', () => {
  test('builds the structured WhatsApp message', () => {
    expect(buildWhatsappText(normalizeUnit(row))).toBe([
      'Condo: Central Park',
      'Mapa: https://maps.app.goo.gl/abc',
      '',
      'Departamento: 22',
      'Piso: 3',
      'Acceso: Lockbox',
      'Codigo: 1973',
      'Codigo Edificio: 240622',
      '',
      'Wifi: INFINITUM4E86',
      'Password: FJDkes8vWY',
    ].join('\n'));
  });

  test('omits empty fields and groups', () => {
    const text = buildWhatsappText(normalizeUnit({
      ...row,
      condo_door_code: ' ',
      condo_google_maps: null,
      wifi_name: '',
      wifi_password: null,
    }));

    expect(text).toBe([
      'Condo: Central Park',
      '',
      'Departamento: 22',
      'Piso: 3',
      'Acceso: Lockbox',
      'Codigo: 1973',
    ].join('\n'));
    expect(text).not.toMatch(/Mapa|Edificio|Wifi|Password/);
  });

  test('only accepts http(s) map links', () => {
    expect(getSafeUrl('javascript:alert(1)')).toBe('');
    expect(getSafeUrl('not a url')).toBe('');
    expect(getSafeUrl('https://maps.app.goo.gl/abc')).toBe('https://maps.app.goo.gl/abc');
  });
});
