import { useState } from 'react'
import { X, Eye, EyeOff, Settings } from 'lucide-react'
import { useApiConfig } from '../context/ApiContext'
import type { ApiConfig } from '../types/cogwork'

interface SettingsModalProps {
  open: boolean
  onClose: () => void
}

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const { config, setConfig } = useApiConfig()
  const [form, setForm] = useState<ApiConfig>(config)
  const [showPw, setShowPw] = useState(false)

  if (!open) return null

  function save() {
    setConfig(form)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2 text-slate-800">
            <Settings className="w-5 h-5 text-violet-600" />
            <h2 className="font-semibold text-lg">API-inställningar</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Organisation (org)
            </label>
            <input
              type="text"
              value={form.org}
              onChange={(e) => setForm({ ...form, org: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              placeholder="sollentunadans"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              API-nyckel (pw)
            </label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={form.pw}
                onChange={(e) => setForm({ ...form, pw: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 font-mono"
                placeholder="xR7UvMV0b2OTACiBaMdaTW1Z"
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Hittas under organisationsinställningar i CogWork.
            </p>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Avbryt
          </button>
          <button
            onClick={save}
            className="flex-1 px-4 py-2 text-sm bg-brand-dark text-white rounded-full hover:bg-brand-forest transition-colors font-medium"
          >
            Spara
          </button>
        </div>
      </div>
    </div>
  )
}
