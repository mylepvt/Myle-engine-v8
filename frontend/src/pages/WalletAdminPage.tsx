import { useSearchParams } from 'react-router-dom'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FreeRechargeAdminList } from '@/components/wallet/FreeRechargeAdminList'
import { useFreeRechargeRequestsQuery } from '@/hooks/use-wallet-recharge-query'
import { FinanceRechargesPage } from '@/pages/FinanceRechargesPage'
import { WalletRechargeAdminPage } from '@/pages/WalletRechargeAdminPage'

type Props = { title: string }

type WalletAdminTab = 'requests' | 'free' | 'adjust'

/** Admin wallet desk — member recharge requests, leaders' free recharge requests and manual add/deduct. */
export function WalletAdminPage({ title }: Props) {
  const [searchParams, setSearchParams] = useSearchParams()
  const raw = searchParams.get('tab')
  const tab: WalletAdminTab = raw === 'adjust' || raw === 'free' ? raw : 'requests'
  const free = useFreeRechargeRequestsQuery()
  const freePending = (free.data?.items ?? []).filter((r) => r.status === 'pending').length

  return (
    <div className="max-w-3xl space-y-4 md:space-y-6">
      <h1 className="text-ds-h2">{title}</h1>
      <Tabs
        value={tab}
        onValueChange={(next) => setSearchParams(next === 'requests' ? {} : { tab: next }, { replace: true })}
      >
        <TabsList className="grid h-auto w-full grid-cols-3 gap-1 p-1">
          <TabsTrigger value="requests" className="min-h-9">
            Recharge requests
          </TabsTrigger>
          <TabsTrigger value="free" className="min-h-9">
            Free requests
            {freePending > 0 ? <span className="ml-1.5 tabular-nums opacity-75">({freePending})</span> : null}
          </TabsTrigger>
          <TabsTrigger value="adjust" className="min-h-9">
            Add / deduct
          </TabsTrigger>
        </TabsList>
        <TabsContent value="requests" className="mt-4">
          <WalletRechargeAdminPage />
        </TabsContent>
        <TabsContent value="free" className="mt-4">
          <FreeRechargeAdminList />
        </TabsContent>
        <TabsContent value="adjust" className="mt-4">
          <FinanceRechargesPage />
        </TabsContent>
      </Tabs>
    </div>
  )
}
