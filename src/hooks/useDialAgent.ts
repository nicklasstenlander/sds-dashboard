import { useState } from 'react'

export interface Agent {
  id:        string
  label:     string
  available: boolean
}

export const AGENTS: Agent[] = [
  { id: 'madeleine', label: 'Madeleine', available: true  },
  { id: 'amanda',    label: 'Amanda',    available: false },
  { id: 'sofia',     label: 'Sofia',     available: false },
]

const LS_KEY = 'sds_dial_agent'

export function useDialAgent() {
  const [agent, setAgentState] = useState<string>(
    () => localStorage.getItem(LS_KEY) ?? 'madeleine'
  )

  function setAgent(id: string) {
    setAgentState(id)
    localStorage.setItem(LS_KEY, id)
  }

  return { agent, setAgent, agents: AGENTS }
}
