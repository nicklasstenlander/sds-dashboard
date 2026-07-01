export function AuthBrandPanel() {
  return (
    <div
      className="relative md:w-[45%] flex flex-col justify-between overflow-hidden px-10 py-12 md:px-14 md:py-16"
      style={{ background: 'linear-gradient(145deg, #007a80 0%, #009399 40%, #45aba5 100%)' }}
    >
      <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full opacity-10"
        style={{ background: '#cfded2' }} />
      <div className="absolute bottom-10 -left-20 w-64 h-64 rounded-full opacity-10"
        style={{ background: '#dd5c86' }} />
      <div className="absolute top-1/2 right-0 w-40 h-40 rounded-full opacity-[0.07]"
        style={{ background: '#fff' }} />

      <div className="relative z-10 flex items-center gap-4">
        <img src="logo.png" alt="SDS" className="w-10 h-10 object-contain brightness-0 invert opacity-90" />
        <div>
          <p className="text-white/60 text-xs font-medium tracking-[0.2em] uppercase">Sollentuna Dans & Scenskola</p>
        </div>
      </div>

      <div className="relative z-10 flex-1 flex flex-col justify-center py-12 md:py-0">
        <h1
          className="text-white font-bold tracking-[0.25em] leading-none"
          style={{ fontSize: 'clamp(4rem, 8vw, 6.5rem)' }}
        >
          CORE
        </h1>
        <p className="mt-4 text-white/70 text-lg md:text-xl font-light leading-snug max-w-xs">
          Kärnan i<br />varje steg.
        </p>
      </div>

      <div className="relative z-10">
        <p className="text-white/40 text-xs tracking-wide">© {new Date().getFullYear()} Sollentuna Dans & Scenskola</p>
      </div>
    </div>
  )
}
