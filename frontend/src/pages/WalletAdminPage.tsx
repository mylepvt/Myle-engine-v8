import { useSearchParams } from 'react-router-dom'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FinanceRechargesPage } from '@/pages/FinanceRechargesPage'
import { WalletRechargeAdminPage } from '@/pages/WalletRechargeAdminPage'

type Props = { title: string }

type WalletAdminTab = 'requests' | 'adjust'

/** Admin wallet desk — member recharge requests + manual add/deduct in one place. */
export function WalletAdminPage({ title }: Props) {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab: WalletAdminTab = searchParams.get('tab') === 'adjust' ? 'adjust' : 'requests'

  return (
    <div className="max-w-3xl space-y-4 md:space-y-6">
      <h1 className="text-ds-h2">{title}</h1>
      <Tabs
        value={tab}
        onValueChange={(next) => setSearchParams(next === 'adjust' ? { tab: 'adjust' } : {}, { replace: true })}
      >
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 p-1">
          <TabsTrigger value="requests" className="min-h-9">
            Recharge requests
          </TabsTrigger>
          <TabsTrigger value="adjust" className="min-h-9">
            Add / deduct
          </TabsTrigger>
        </TabsList>
        <TabsContent value="requests" className="mt-4">
          <WalletRechargeAdminPage />
        </TabsContent>
        <TabsContent value="adjust" className="mt-4">
          <FinanceRechargesPage />
        </TabsContent>
      </Tabs>
    </div>
  )
}
