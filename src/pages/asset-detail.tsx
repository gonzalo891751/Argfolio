import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, TrendingDown, Bitcoin, Coins } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { MovementModal } from '@/components/movements/MovementModal'
import {
    AssetKpiCards,
    BuyLotsTable,
    SellMovementsTable,
} from '@/components/assets'
import { useInstrumentDetail } from '@/hooks/use-instrument-detail'
import type { AssetCategory, MovementType } from '@/domain/types'

const categoryLabels: Record<AssetCategory, string> = {
    CEDEAR: 'Cedear',
    CRYPTO: 'Cripto',
    STABLE: 'Stablecoin',
    USD_CASH: 'USD',
    ARS_CASH: 'ARS',
    FCI: 'FCI',
    PF: 'Plazo Fijo',
    WALLET: 'Wallet',
    DEBT: 'Deuda',
}

const categoryIcons: Record<AssetCategory, typeof Bitcoin> = {
    CEDEAR: Coins,
    CRYPTO: Bitcoin,
    STABLE: Coins,
    USD_CASH: Coins,
    ARS_CASH: Coins,
    FCI: Coins,
    PF: Coins,
    WALLET: Coins,
    DEBT: Coins,
}

export function AssetDetailPage() {
    const { instrumentId } = useParams<{ instrumentId: string }>()
    const navigate = useNavigate()
    const detail = useInstrumentDetail(instrumentId ?? '')

    const [isModalOpen, setIsModalOpen] = useState(false)
    const [modalType, setModalType] = useState<MovementType>('BUY')
    const [activeTab, setActiveTab] = useState('buys')

    if (!instrumentId) {
        return (
            <div className="p-12 text-center text-muted-foreground">
                <p>ID de instrumento no válido</p>
            </div>
        )
    }

    if (!detail) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-10 w-48" />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                        <Skeleton key={i} className="h-24" />
                    ))}
                </div>
                <Skeleton className="h-64" />
            </div>
        )
    }

    const { instrument, holdingSummary, buyLots, sellMovements, accountBreakdown } = detail
    const Icon = categoryIcons[instrument.category] ?? Coins

    const handleNewBuy = () => {
        setModalType('BUY')
        setIsModalOpen(true)
    }

    const handleNewSell = () => {
        setModalType('SELL')
        setIsModalOpen(true)
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => navigate('/assets')}
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                        <Icon className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-2xl font-bold">{instrument.symbol}</h1>
                            <Badge variant="secondary">
                                {categoryLabels[instrument.category] ?? instrument.category}
                            </Badge>
                        </div>
                        <p className="text-muted-foreground">{instrument.name}</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button variant="gradient" onClick={handleNewBuy}>
                        <Plus className="h-4 w-4 mr-2" />
                        Nueva Compra
                    </Button>
                    <Button
                        variant="outline"
                        onClick={handleNewSell}
                        disabled={holdingSummary.totalQuantity <= 0}
                    >
                        <TrendingDown className="h-4 w-4 mr-2" />
                        Nueva Venta
                    </Button>
                </div>
            </div>

            {/* Account Breakdown */}
            {accountBreakdown.length > 1 && (
                <div className="flex flex-wrap gap-2">
                    {accountBreakdown.map((acc) => (
                        <Badge key={acc.accountId} variant="outline" className="px-3 py-1">
                            {acc.accountName}: {acc.quantity < 1 ? acc.quantity.toFixed(6) : acc.quantity.toFixed(4)}
                        </Badge>
                    ))}
                </div>
            )}

            {/* KPI Cards */}
            <AssetKpiCards
                totalQuantity={holdingSummary.totalQuantity}
                avgCost={holdingSummary.avgCost}
                totalInvested={holdingSummary.totalInvested}
                currentPrice={holdingSummary.currentPrice}
                currentValue={holdingSummary.currentValue}
                unrealizedPnL={holdingSummary.unrealizedPnL}
                unrealizedPnLPercent={holdingSummary.unrealizedPnLPercent}
                realizedPnL={holdingSummary.realizedPnL}
                tradeCurrency={instrument.nativeCurrency}
            />

            {/* Movements Tabs */}
            <Card>
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <CardHeader className="pb-0">
                        <TabsList>
                            <TabsTrigger value="buys">
                                Compras ({buyLots.length})
                            </TabsTrigger>
                            <TabsTrigger value="sells">
                                Ventas ({sellMovements.length})
                            </TabsTrigger>
                        </TabsList>
                    </CardHeader>
                    <CardContent className="p-0">
                        <TabsContent value="buys" className="m-0">
                            <BuyLotsTable lots={buyLots} />
                        </TabsContent>
                        <TabsContent value="sells" className="m-0">
                            <SellMovementsTable
                                movements={sellMovements}
                                avgCost={holdingSummary.avgCost}
                            />
                        </TabsContent>
                    </CardContent>
                </Tabs>
            </Card>

            {/* Movement Modal */}
            <MovementModal
                open={isModalOpen}
                onOpenChange={setIsModalOpen}
                defaultInstrumentId={instrumentId}
                defaultType={modalType}
                holdingQuantity={holdingSummary.totalQuantity}
                currentPrice={holdingSummary.currentPrice}
                avgCost={holdingSummary.avgCost}
            />
        </div>
    )
}
