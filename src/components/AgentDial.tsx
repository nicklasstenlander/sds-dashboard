import { useState } from 'react'
import { Phone } from 'lucide-react'
import { dial } from '../services/telavoxService'
import { useDialAgent, AGENTS } from '../hooks/useDialAgent'

interface AgentDialProps {
  number: string
}

export function AgentDial({ number }: AgentDialProps) {
  const { agent, setAgent } = useDialAgent()
  const [dialing, setDialing] = useState(false)

  async function handleDial() {
    setDialing(true)
    try { await dial(number, agent) } catch { /* silent */ }
    setTimeout(() => setDialing(false), 3000)
  }

  return (
    <div className="flex items-center gap-0 rounded-lg overflow-hidden border border-slate-200 text-xs">
      {/* Agent selector */}
      <select
        value={agent}
        onChange={e => setAgent(e.target.value)}
        disabled={dialing}
        className="bg-white text-slate-500 px-2 py-1.5 border-r border-slate-200 focus:outline-none text-xs"
      >
        {AGENTS.map(a => (
          <option key={a.id} value={a.id} disabled={!a.available} title={a.available ? undefined : 'API-nyckel saknas'}>
            {a.label}{!a.available ? ' (saknas)' : ''}
          </option>
        ))}
      </select>

      {/* Dial button */}
      <button
        onClick={handleDial}
        disabled={dialing}
        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white text-slate-500 hover:text-brand-forest hover:bg-brand-mint transition-colors disabled:opacity-50"
      >
        <Phone className="w-3.5 h-3.5" />
        <span>{dialing ? 'Ringer…' : 'Ring'}</span>
      </button>
    </div>
  )
}
