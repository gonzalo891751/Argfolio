import { CreditCardPanel } from '@/components/personal-finance/cards/CreditCardPanel'
import type { CardStatementData } from '../hooks/usePersonalFinancesV3'
import type { PFCardConsumption } from '@/db/schema'

interface CreditCardTileProps {
    data: CardStatementData
    onAddConsumption: () => void
    onImportStatement: () => void
    onDeleteConsumption: (consumptionId: string) => void
    onEditConsumption: (consumption: PFCardConsumption) => void
    onMarkPaid: (paymentDateISO: string) => void
    onMarkUnpaid: () => void
}

export function CreditCardTile({
    data,
    onAddConsumption,
    onImportStatement,
    onDeleteConsumption,
    onEditConsumption,
    onMarkPaid,
    onMarkUnpaid,
}: CreditCardTileProps) {
    return (
        <CreditCardPanel
            data={data}
            onAddConsumption={onAddConsumption}
            onImportStatement={onImportStatement}
            onDeleteConsumption={onDeleteConsumption}
            onEditConsumption={onEditConsumption}
            onMarkPaid={onMarkPaid}
            onMarkUnpaid={onMarkUnpaid}
        />
    )
}

// Legacy export for backward compatibility
export { CreditCardTile as default }
