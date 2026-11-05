import type { HistoryState } from '@/hooks/useTransactionHistory'
import { ActivityList, type LocalSend } from '@/components/ActivityList'

export function ActivityPage({ history, localSend }: { history: HistoryState; localSend: LocalSend | null }) {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <ActivityList history={history} variant="full" localSend={localSend} />
    </div>
  )
}
