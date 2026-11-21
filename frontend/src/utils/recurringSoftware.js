export const SOFTWARE_CATEGORY_ID = 20;

export const softwareServices = [
  { name: 'AWS', aliases: ['aws', 'amazon web'] },
  { name: 'Microsoft Office', aliases: ['microsoft', 'office', 'o365'] },
  { name: 'Power Automate', aliases: ['power automate', 'powerautomate'] },
  { name: 'Beyond', aliases: ['beyond'] },
];

export function getActiveSoftwareServices(month) {
  if (!/^\d{4}-\d{2}$/.test(month)) return [];

  return softwareServices
    .filter(({ firstMonth, lastMonth }) =>
      (!firstMonth || firstMonth <= month) && (!lastMonth || month <= lastMonth)
    )
    .map(({ name }) => name);
}

export function summarizeSoftwareExpenses(month, items) {
  const counts = new Map();
  for (const { description } of items) {
    const text = String(description || '').trim().toLowerCase();
    const service = softwareServices.find(({ name }) => name.toLowerCase() === text)
      || softwareServices.find(({ aliases }) => aliases.some((alias) => text.includes(alias)));
    if (service) counts.set(service.name, (counts.get(service.name) || 0) + 1);
  }

  return {
    missing: getActiveSoftwareServices(month).filter((name) => !counts.has(name)),
    duplicates: softwareServices
      .map(({ name }) => ({ name, count: counts.get(name) || 0 }))
      .filter(({ count }) => count > 1),
  };
}
