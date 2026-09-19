export function formatMobileGuestName(value) {
  const name = String(value || '').trim().replace(/\s+/g, ' ');
  if (!name) return '';

  if (name.includes(',')) {
    const [familyPart, givenPart] = name.split(',', 2).map((part) => part.trim());
    const givenNames = givenPart.split(/\s+/).filter(Boolean);
    const familyNames = familyPart.split(/\s+/).filter(Boolean);
    const firstName = givenNames[0] || '';
    const lastName = familyNames[familyNames.length - 1] || '';
    return [firstName, lastName].filter(Boolean).join(' ') || name;
  }

  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return parts.join(' ');
  return `${parts[0]} ${parts[parts.length - 1]}`;
}
