import { Sheet } from '../Sheet'
import { SWAP_SETTINGS } from '../../../config/uniswap'

interface SwapRiskInfoProps {
  open: boolean
  onClose: () => void
}

/** The complete swap risk warning, shown on demand from the info icon so the main screen stays clean. */
export function SwapRiskInfo({ open, onClose }: SwapRiskInfoProps) {
  return (
    <Sheet open={open} title="Before you swap" onClose={onClose}>
      <div className="space-y-4 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-sm leading-relaxed">
        <p className="rounded-xl p-3" style={{ background: 'rgba(251,191,36,0.1)', color: 'var(--warning)' }}>
          Swaps use real funds on Arc Mainnet and cannot be reversed. Prices can move before your swap confirms. Check the amounts, the minimum received and the price impact before you approve in your wallet.
        </p>

        <div>
          <h3 className="label">What to check</h3>
          <ul className="mt-2 list-disc space-y-1.5 pl-5">
            <li>
              <strong>Minimum received</strong> is the least you will accept. If the price moves past your slippage setting, the swap reverts instead of filling.
            </li>
            <li>
              <strong>Price impact</strong> shows how much your trade moves the pool. Impact of {SWAP_SETTINGS.priceImpactDanger}% or more needs an extra confirmation. Thin pools can be costly.
            </li>
            <li>
              <strong>Slippage</strong> above {SWAP_SETTINGS.highSlippage}% is risky: a high setting lets the trade fill at a much worse price.
            </li>
          </ul>
        </div>

        <div>
          <h3 className="label">How TOPpay protects the swap</h3>
          <ul className="mt-2 list-disc space-y-1.5 pl-5">
            <li>Every swap is simulated against Arc first. If it would fail, nothing is sent to your wallet.</li>
            <li>Approvals are for exactly the swap amount, never unlimited.</li>
            <li>The transaction expires after {Math.round(SWAP_SETTINGS.deadlineSeconds / 60)} minutes if it is not mined.</li>
            <li>Your wallet always shows a confirmation. Nothing happens until you approve it there.</li>
            <li>A swap is shown as complete only after the transaction is confirmed onchain.</li>
          </ul>
        </div>

        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          Quotes come straight from Uniswap V3 pools on Arc Mainnet. The contract check is not a code audit. TOPpay never asks for your seed phrase or private key.
        </p>

        <button type="button" className="btn btn-primary w-full" onClick={onClose}>
          Got it
        </button>
      </div>
    </Sheet>
  )
}
