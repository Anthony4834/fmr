export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function buildCitySlug(cityName: string, stateCode: string): string {
  return `${slugify(cityName)}-${stateCode.toLowerCase()}`;
}

export function buildCountySlug(countyName: string, stateCode: string): string {
  const base = countyName.replace(/\s+county\s*$/i, '').trim();
  return `${slugify(base)}-county-${stateCode.toLowerCase()}`;
}



