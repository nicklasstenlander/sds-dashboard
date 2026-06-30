const SCHEMA_URL = 'https://nicklasstenlander.github.io/sds-schema/'

export function Schema() {
  return (
    <div className="h-full -m-4 md:-m-6">
      <iframe
        src={SCHEMA_URL}
        title="Dagens schema"
        className="w-full h-full border-0"
        style={{ minHeight: 'calc(100vh - 4rem)' }}
      />
    </div>
  )
}
