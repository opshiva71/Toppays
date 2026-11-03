import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { SWAP_SETTINGS } from '../../../config/uniswap'

interface SlippageControlProps {
  value: number
  onChange: (value: number) => void
}

const pct = (value: number) => `${value.toFixed(2)}%`

/** Slippage presets plus a custom field. Bounds come from the shared swap settings. */
export function SlippageControl({ value, onChange }: SlippageControlProps) {
  const [custom, setCustom] = useState('')
  const isPreset = SWAP_SETTINGS.slippagePresets.includes(value)
  const customNumber = Number(custom)
  const customInvalid = custom !== '' && (!Number.isFinite(customNumber) || customNumber < SWAP_SETTINGS.minSlippage || customNumber > SWAP_SETTINGS.maxSlippage)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="label">Slippage tolerance</span>
        <span className="text-sm font-semibold tabular-nums">{pct(value)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {SWAP_SETTINGS.slippagePresets.map((preset) => (
          <button
            key={preset}
            type="button"
            aria-pressed={value === preset && custom === ''}
            onClick={() => {
              setCustom('')
              onChange(preset)
            }}
            className="chip min-h-11 px-4 text-sm font-semibold"
            style={value === preset && custom === '' ? { background: 'var(--ink)', color: '#fff', borderColor: 'var(--ink)' } : undefined}
          >
            {pct(preset)}
          </button>
        ))}
        <label className="chip min-h-11 gap-1 pl-4 pr-3 text-sm font-semibold" style={!isPreset || custom !== '' ? { borderColor: 'var(--accent)' } : undefined}>
          <span className="sr-only">Custom slippage percent</span>
          <input
            inputMode="decimal"
            placeholder="Custom"
            value={custom}
            aria-invalid={customInvalid}
            onChange={(event) => {
              const next = event.target.value.replace(/[^0-9.]/g, '').slice(0, 5)
              setCustom(next)
              const parsed = Number(next)
              if (next !== '' && Number.isFinite(parsed)) onChange(parsed)
            }}
            className="w-16 bg-transparent text-right outline-none placeholder:font-normal"
          />
          %
        </label>
      </div>
      {customInvalid && (
        <p role="alert" className="text-xs" style={{ color: 'var(--danger)' }}>
          Enter a value between {SWAP_SETTINGS.minSlippage}% and {SWAP_SETTINGS.maxSlippage}%.
        </p>
      )}
      {value >= SWAP_SETTINGS.highSlippage && !customInvalid && (
        <p className="flex items-start gap-2 rounded-xl p-3 text-xs" style={{ background: 'rgba(154,91,0,0.1)', color: 'var(--warning)' }}>
          <AlertTriangle className="mt-0.5 size-4 shrink-0" /> High slippage lets the trade fill at a much worse price, which makes front-running easier.
        </p>
      )}
      {value < 0.1 && (
        <p className="text-xs" style={{ color: 'var(--subtle)' }}>
          Very low slippage can make the swap fail when the price moves slightly.
        </p>
      )}
    </div>
  )
}
