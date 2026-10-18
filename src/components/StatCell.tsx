/** Ett nyckeltal i bandet. Klickbart (knapp) när siffran har en detaljvy. */
export function StatCell({ label, value, sub, onClick }: { label: string; value: string; sub?: string; onClick?: () => void }) {
  const inner = (
    <>
      <span className="block text-sm text-slate-600">{label}</span>
      <span className="block mt-1 text-4xl font-bold tabular-nums leading-tight text-brand-dark">{value}</span>
      {sub && <span className="block mt-1 text-sm text-slate-600">{sub}</span>}
    </>
  )
  const cls = 'flex-[1_1_150px] p-5 border-r border-slate-100 dark:border-white/5 text-left'
  return onClick ? (
    <button type="button" onClick={onClick} aria-label={`${label}: ${value}. Visa detaljer`} className={`${cls} sds-focus-ring hover:bg-slate-50 dark:hover:bg-white/5 transition-colors`}>{inner}</button>
  ) : (
    <div className={cls}>{inner}</div>
  )
}
