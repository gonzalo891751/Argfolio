/**
 * Preferences Sheet
 *
 * A slide-out panel for configuring automation preferences:
 * - Auto-accrue wallet interest
 * - Auto-settle fixed terms
 */

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { useAutoAccrueWalletInterest, useAutoSettleFixedTerms } from '@/hooks/use-preferences'
import { Wallet, CalendarCheck, Info } from 'lucide-react'

interface PreferencesSheetProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function PreferencesSheet({ open, onOpenChange }: PreferencesSheetProps) {
    const { autoAccrueEnabled, setAutoAccrueEnabled } = useAutoAccrueWalletInterest()
    const { autoSettleEnabled, setAutoSettleEnabled } = useAutoSettleFixedTerms()

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="w-[320px] sm:w-[380px]">
                <SheetHeader>
                    <SheetTitle>Preferencias</SheetTitle>
                </SheetHeader>

                <div className="mt-6 space-y-6">
                    {/* Section: Automatizaciones */}
                    <div>
                        <h3 className="text-sm font-medium text-muted-foreground mb-4">
                            Automatizaciones
                        </h3>

                        {/* Auto-accrue wallet interest */}
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border/50">
                            <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                                <Wallet className="h-4 w-4 text-emerald-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                    <label
                                        htmlFor="auto-accrue"
                                        className="text-sm font-medium cursor-pointer"
                                    >
                                        Intereses de billeteras
                                    </label>
                                    <Switch
                                        id="auto-accrue"
                                        checked={autoAccrueEnabled}
                                        onCheckedChange={setAutoAccrueEnabled}
                                    />
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Generar movimientos de interés diarios automáticamente para cuentas remuneradas.
                                </p>
                            </div>
                        </div>

                        {/* Auto-settle fixed terms */}
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border/50 mt-3">
                            <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                                <CalendarCheck className="h-4 w-4 text-blue-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                    <label
                                        htmlFor="auto-settle"
                                        className="text-sm font-medium cursor-pointer"
                                    >
                                        Liquidación de plazos fijos
                                    </label>
                                    <Switch
                                        id="auto-settle"
                                        checked={autoSettleEnabled}
                                        onCheckedChange={setAutoSettleEnabled}
                                    />
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Liquidar automáticamente plazos fijos al vencimiento.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Info note */}
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/5 border border-primary/10">
                        <Info className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-muted-foreground">
                            Las automatizaciones se ejecutan al abrir la app o al tocar
                            <span className="font-medium text-foreground"> "Actualizar ahora"</span>.
                            No corren en segundo plano.
                        </p>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    )
}
