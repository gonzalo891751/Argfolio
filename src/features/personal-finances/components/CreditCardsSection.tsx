import { CreditCard as CreditCardIcon, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { CardStatementData } from '../hooks/usePersonalFinancesV3'
import { CreditCardTile } from './CreditCardTile'

interface CreditCardsSectionProps {
    cardData: CardStatementData[]
    onManageCards: () => void
    onAddConsumption: (cardId: string) => void
    onViewAllConsumptions: (cardId: string) => void
    onMarkPaid: (cardId: string, paymentDateISO: string) => void
    onMarkUnpaid: (cardId: string) => void
}

export function CreditCardsSection({
    cardData,
    onManageCards,
    onAddConsumption,
    onViewAllConsumptions,
    onMarkPaid,
    onMarkUnpaid,
}: CreditCardsSectionProps) {
    if (cardData.length === 0) {
        return (
            <section className="mb-8">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-display text-xl text-white">Tarjetas de Crédito</h3>
                    <Button variant="outline" size="sm" onClick={onManageCards}>
                        <Plus className="w-4 h-4 mr-1" />
                        Agregar Tarjeta
                    </Button>
                </div>
                <div className="bg-slate-900/50 border border-white/10 rounded-xl p-8 text-center">
                    <CreditCardIcon className="w-12 h-12 mx-auto text-slate-600 mb-3" />
                    <p className="text-slate-400 mb-4">No tenés tarjetas de crédito registradas</p>
                    <Button onClick={onManageCards}>
                        <Plus className="w-4 h-4 mr-1" />
                        Agregar tu primera tarjeta
                    </Button>
                </div>
            </section>
        )
    }

    return (
        <section className="mb-8">
            <div className="flex items-center justify-between mb-4">
                <h3 className="font-display text-xl text-white">Tarjetas de Crédito</h3>
                <Button variant="outline" size="sm" onClick={onManageCards}>
                    Administrar Plásticos
                </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {cardData.map((data) => (
                    <CreditCardTile
                        key={data.card.id}
                        data={data}
                        onAddConsumption={() => onAddConsumption(data.card.id)}
                        onViewAll={() => onViewAllConsumptions(data.card.id)}
                        onMarkPaid={(date) => onMarkPaid(data.card.id, date)}
                        onMarkUnpaid={() => onMarkUnpaid(data.card.id)}
                    />
                ))}
            </div>
        </section>
    )
}
