import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import type { PortfolioTotals } from '@/domain/types'
import { formatMoneyARS, formatMoneyUSD } from '@/lib/format'

interface AuditModalProps {
    isOpen: boolean
    onClose: () => void
    portfolio: PortfolioTotals | null
}

export function AuditModal({ isOpen, onClose, portfolio }: AuditModalProps) {
    if (!portfolio) return null

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Audit Portfolio</DialogTitle>
                </DialogHeader>

                <div className="flex-1 p-4 border rounded-md font-mono text-xs overflow-y-auto">
                    <div className="space-y-6">
                        {/* Totals Section */}
                        <section>
                            <h3 className="font-bold text-lg mb-2">Global Totals</h3>
                            <div className="grid grid-cols-2 gap-4 border p-2">
                                <div>Total ARS: {formatMoneyARS(portfolio.totalARS)}</div>
                                <div>Total USD: {formatMoneyUSD(portfolio.totalUSD)}</div>
                                <div>Unrealized ARS: {formatMoneyARS(portfolio.unrealizedPnLArs)}</div>
                                <div>Unrealized USD: {formatMoneyUSD(portfolio.unrealizedPnLUsd)}</div>
                                <div>Realized ARS: {formatMoneyARS(portfolio.realizedPnLArs)}</div>
                                <div>Realized USD: {formatMoneyUSD(portfolio.realizedPnLUsd)}</div>
                            </div>
                        </section>

                        {/* Realized PnL By Account */}
                        <section>
                            <h3 className="font-bold text-lg mb-2">Realized PnL By Account</h3>
                            {portfolio.realizedPnLByAccount ? (
                                <table className="w-full border-collapse border">
                                    <thead>
                                        <tr className="bg-muted">
                                            <th className="border p-1">Account ID</th>
                                            <th className="border p-1 text-right">ARS</th>
                                            <th className="border p-1 text-right">USD</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {Object.entries(portfolio.realizedPnLByAccount).map(([accId, pnl]) => (
                                            <tr key={accId}>
                                                <td className="border p-1">{accId}</td>
                                                <td className="border p-1 text-right">{formatMoneyARS(pnl.ars)}</td>
                                                <td className="border p-1 text-right">{formatMoneyUSD(pnl.usd)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : <div>No Breakdown</div>}
                        </section>

                        {/* Holdings Summary */}
                        <section>
                            <h3 className="font-bold text-lg mb-2">Categories Breakdown</h3>
                            {portfolio.categories.map(cat => (
                                <div key={cat.label} className="mb-4 ml-2 border-l-2 pl-2">
                                    <div className="font-bold">{cat.label} (Items: {cat.items.length}) - {formatMoneyARS(cat.totalARS)}</div>
                                    <div className="ml-4 text-[10px] opacity-70">
                                        {cat.items.map(item => (
                                            <div key={item.instrumentId}>
                                                {item.instrument.symbol}: Qty {item.totalQuantity} | Val {formatMoneyARS(item.valueARS || 0)}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </section>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
