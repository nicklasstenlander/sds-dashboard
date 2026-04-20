/** Convert CogWork eventBlock name → short code, e.g. "Hösten 2025" → "HT25" */
export function blockNameToCode(name: string): string {
  const ht = name.match(/[Hh]öst(?:en)?\s+(\d{4})/)
  const vt = name.match(/[Vv]år(?:en)?\s+(\d{4})/)
  if (ht) return `HT${ht[1].slice(2)}`
  if (vt) return `VT${vt[1].slice(2)}`
  return name
}

/** Convert short code → display label, e.g. "HT25" → "HT 2025" */
export function codeToLabel(code: string): string {
  const m = code.match(/^(HT|VT)(\d{2})$/)
  if (!m) return code
  return `${m[1]} 20${m[2]}`
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
