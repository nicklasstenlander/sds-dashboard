/** Convert CogWork eventBlock name → short code, e.g. "Hösten 2025" → "HT25" */
export function blockNameToCode(name: string): string {
  const ht = name.match(/[Hh]öst(?:en)?\s+(\d{4})/)
  const vt = name.match(/[Vv]år(?:en)?\s+(\d{4})/)
  if (ht) return `HT${ht[1].slice(2)}`
  if (vt) return `VT${vt[1].slice(2)}`
  return name
}

/** Convert CogWork eventBlock name → full Swedish term, e.g. "Hösten 2025" → "Höstterminen 2025" */
export function blockNameToFullLabel(name: string): string {
  const ht = name.match(/[Hh]öst(?:en)?\s+(\d{4})/)
  const vt = name.match(/[Vv]år(?:en)?\s+(\d{4})/)
  if (ht) return `Höstterminen ${ht[1]}`
  if (vt) return `Vårterminen ${vt[1]}`
  return name
}

/** Convert short code → display label, e.g. "HT25" → "HT 2025" */
export function codeToLabel(code: string): string {
  const m = code.match(/^(HT|VT)(\d{2})$/)
  if (!m) return code
  return `${m[1]} 20${m[2]}`
}

export function isPeriodCode(value: string): boolean {
  return /^(HT|VT)\d{2}$/.test(value)
}

export function dateToPeriodCode(date?: string): string {
  if (!date) return ''
  const year = date.slice(0, 4)
  const month = Number(date.slice(5, 7))
  if (!/^\d{4}$/.test(year) || !month) return ''
  return `${month >= 7 ? 'HT' : 'VT'}${year.slice(2)}`
}

export function matchesPeriodCode(code: string, values: (string | undefined)[]): boolean {
  const normalizedCode = code.toUpperCase()
  return values.some((value) => {
    if (!value) return false
    const normalizedValue = value.toUpperCase()
    return normalizedValue.includes(normalizedCode) || dateToPeriodCode(value) === normalizedCode
  })
}

/** Sort period codes newest first (HT26 > VT26 > HT25 > VT25) */
export function sortPeriodCodes(codes: string[]): string[] {
  return [...codes].sort((a, b) => {
    const pa = parsePeriod(a)
    const pb = parsePeriod(b)
    if (!pa || !pb) return 0
    if (pb.year !== pa.year) return pb.year - pa.year
    // HT (fall) > VT (spring) within same year
    return pb.term.localeCompare(pa.term)
  })
}

function parsePeriod(code: string) {
  const m = code.match(/^(HT|VT)(\d{2})$/)
  if (!m) return null
  return { term: m[1], year: parseInt(m[2], 10) }
}
