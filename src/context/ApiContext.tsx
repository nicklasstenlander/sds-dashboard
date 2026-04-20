import { createContext, useContext, useState, type ReactNode } from 'react'
import type { ApiConfig } from '../types/cogwork'

interface ApiContextValue {
  config: ApiConfig
  setConfig: (c: ApiConfig) => void
}

const LS_KEY = 'sds_api_config'

function loadConfig(): ApiConfig {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return JSON.parse(raw) as ApiConfig
  } catch {}
  return { org: 'sollentunadans', pw: '' }
}

const ApiContext = createContext<ApiContextValue | null>(null)

export function ApiProvider({ children }: { children: ReactNode }) {
  const [config, setConfigState] = useState<ApiConfig>(loadConfig)

  function setConfig(c: ApiConfig) {
    setConfigState(c)
    localStorage.setItem(LS_KEY, JSON.stringify(c))
  }

  return <ApiContext.Provider value={{ config, setConfig }}>{children}</ApiContext.Provider>
}

export function useApiConfig(): ApiContextValue {
  const ctx = useContext(ApiContext)
  if (!ctx) throw new Error('useApiConfig must be used within ApiProvider')
  return ctx
}
