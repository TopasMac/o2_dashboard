const clean = (value) => String(value ?? '').trim();

export function normalizeUnit(row) {
  return {
    id: row?.id,
    unitName: clean(row?.unit_name) || 'Unidad',
    city: clean(row?.city),
    status: clean(row?.status),
    unitNumber: clean(row?.unit_number),
    unitFloor: clean(row?.unit_floor),
    accessType: clean(row?.access_type),
    accessCode: clean(row?.access_code),
    wifiName: clean(row?.wifi_name),
    wifiPassword: clean(row?.wifi_password),
    condoName: clean(row?.condo_name),
    condoDoorCode: clean(row?.condo_door_code),
    condoGoogleMaps: clean(row?.condo_google_maps),
  };
}

export function getSafeUrl(value) {
  try {
    const url = new URL(clean(value));
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch (error) {
    return '';
  }
}

// Plain text (no markdown) so it pastes cleanly into WhatsApp. Empty values
// are omitted instead of leaving blank labels.
export function buildWhatsappText(unit) {
  const groups = [
    [
      unit.condoName && `Condo: ${unit.condoName}`,
      getSafeUrl(unit.condoGoogleMaps) && `Mapa: ${getSafeUrl(unit.condoGoogleMaps)}`,
    ],
    [
      unit.unitNumber && `Departamento: ${unit.unitNumber}`,
      unit.unitFloor && `Piso: ${unit.unitFloor}`,
      unit.accessType && `Acceso: ${unit.accessType}`,
      unit.accessCode && `Codigo: ${unit.accessCode}`,
      unit.condoDoorCode && `Codigo Edificio: ${unit.condoDoorCode}`,
    ],
    [
      unit.wifiName && `Wifi: ${unit.wifiName}`,
      unit.wifiPassword && `Password: ${unit.wifiPassword}`,
    ],
  ];

  return groups
    .map((lines) => lines.filter(Boolean).join('\n'))
    .filter(Boolean)
    .join('\n\n');
}

export async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const input = document.createElement('textarea');
  input.value = value;
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.appendChild(input);
  input.select();
  document.execCommand('copy');
  document.body.removeChild(input);
}
