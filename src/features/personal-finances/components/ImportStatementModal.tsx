import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { AlertTriangle, Check, FileUp, UploadCloud, X } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/toast'
import type { PFCreditCard, PFCardConsumption } from '@/db/schema'
import type { CreateConsumptionInput } from '../services/pfStore'
import { parseVisaStatement, type ParsedStatement } from '@/domain/personal-finance/pdf/parseVisaStatement'

interface ImportStatementModalProps {
    open: boolean
    card: PFCreditCard | null
    existingConsumptions: PFCardConsumption[]
    onClose: () => void
    onImport: (transactions: CreateConsumptionInput[], card: PFCreditCard) => Promise<void>
}

const arsFormatter = new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
})

function formatPreviewDate(dateISO: string) {
    return new Date(`${dateISO}T00:00:00`).toLocaleDateString('es-AR', {
        day: '2-digit',
        month: '2-digit',
    })
}

function formatMetaDate(dateISO?: string): string {
    if (!dateISO || dateISO.length < 10) return '-'
    const parsed = new Date(`${dateISO}T00:00:00Z`)
    if (Number.isNaN(parsed.getTime())) return '-'
    return parsed.toLocaleDateString('es-AR', {
        day: '2-digit',
        month: 'short',
        year: '2-digit',
    })
}

function normalizeKey(value: string): string {
    return value.replace(/\s+/g, ' ').trim().toUpperCase()
}

function buildConsumptionKey(dateISO: string, amount: number, description: string): string {
    return `${dateISO}|${amount}|${normalizeKey(description)}`
}

function buildPurchaseId(index: number, dateISO: string, amount: number, description: string): string {
    return `${index}-${dateISO}-${amount}-${normalizeKey(description)}`
}

export function ImportStatementModal({
    open,
    card,
    existingConsumptions,
    onClose,
    onImport,
}: ImportStatementModalProps) {
    if (!open || !card) return null

    return (
        <ImportStatementModalInner
            card={card}
            existingConsumptions={existingConsumptions}
            onClose={onClose}
            onImport={onImport}
        />
    )
}

function ImportStatementModalInner({
    card,
    existingConsumptions,
    onClose,
    onImport,
}: {
    card: PFCreditCard
    existingConsumptions: PFCardConsumption[]
    onClose: () => void
    onImport: (transactions: CreateConsumptionInput[], card: PFCreditCard) => Promise<void>
}) {
    const { toast } = useToast()
    const fileInputRef = useRef<HTMLInputElement | null>(null)
    const [step, setStep] = useState(1)
    const [isParsing, setIsParsing] = useState(false)
    const [parsed, setParsed] = useState<ParsedStatement | null>(null)
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [groupInstallments, setGroupInstallments] = useState(true)
    const [ignoreUsd, setIgnoreUsd] = useState(false)
    const [forceImport, setForceImport] = useState(false)
    const [mapping, setMapping] = useState({
        date: 'Fecha',
        detail: 'Detalle',
        amount: 'Monto',
        currency: 'Moneda',
        installments: 'Cuotas',
    })

    useEffect(() => {
        setStep(1)
        setIsParsing(false)
        setParsed(null)
        setSelectedIds(new Set())
        setGroupInstallments(true)
        setIgnoreUsd(false)
        setForceImport(false)
        setMapping({
            date: 'Fecha',
            detail: 'Detalle',
            amount: 'Monto',
            currency: 'Moneda',
            installments: 'Cuotas',
        })
    }, [card.id])

    useEffect(() => {
        const handleKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose()
            }
        }
        window.addEventListener('keydown', handleKey)
        return () => window.removeEventListener('keydown', handleKey)
    }, [onClose])

    const handleFile = async (file: File) => {
        setIsParsing(true)
        try {
            const result = await parseVisaStatement(file)
            if (import.meta.env.DEV) {
                console.info('[PF] Parsed statement', result)
            }
            setParsed(result)
            const existingKeys = new Set(
                existingConsumptions.map(c => buildConsumptionKey(c.purchaseDateISO, c.amount, c.description))
            )
            const initialSelection = new Set(
                result.purchases
                    .map((purchase, index) => ({
                        id: buildPurchaseId(index, purchase.date, purchase.amount, purchase.description),
                        isDuplicate: existingKeys.has(
                            buildConsumptionKey(purchase.date, purchase.amount, purchase.description)
                        ),
                    }))
                    .filter(item => !item.isDuplicate)
                    .map(item => item.id)
            )
            setSelectedIds(initialSelection)
            setStep(2)
        } finally {
            setIsParsing(false)
        }
    }

    const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        if (file) {
            handleFile(file)
        }
    }

    const handleDrop = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault()
        const file = event.dataTransfer.files?.[0]
        if (file) {
            handleFile(file)
        }
    }

    const handleSampleLoad = async () => {
        const url = new URL('../../../../docs/samples/resumen_cuenta_visa_Dec_2025.pdf', import.meta.url)
        const response = await fetch(url)
        const blob = await response.blob()
        const file = new File([blob], 'resumen_cuenta_visa_Dec_2025.pdf', {
            type: 'application/pdf',
        })
        handleFile(file)
    }

    const toggleSelected = (purchaseId: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev)
            if (next.has(purchaseId)) {
                next.delete(purchaseId)
            } else {
                next.add(purchaseId)
            }
            return next
        })
    }

    const purchaseRows = useMemo(() => {
        if (!parsed) return []
        const existingKeys = new Set(
            existingConsumptions.map(c => buildConsumptionKey(c.purchaseDateISO, c.amount, c.description))
        )
        return parsed.purchases.map((purchase, index) => {
            const id = buildPurchaseId(index, purchase.date, purchase.amount, purchase.description)
            const isDuplicate = existingKeys.has(
                buildConsumptionKey(purchase.date, purchase.amount, purchase.description)
            )
            return { ...purchase, id, isDuplicate }
        })
    }, [parsed, existingConsumptions])

    const selectedPurchases = useMemo(() => {
        return purchaseRows.filter(row => selectedIds.has(row.id))
    }, [purchaseRows, selectedIds])

    const filteredPurchases = useMemo(() => {
        if (!ignoreUsd) return selectedPurchases
        return selectedPurchases.filter(row => row.currency !== 'USD')
    }, [selectedPurchases, ignoreUsd])

    const summaryTotals = useMemo(() => {
        return filteredPurchases.reduce(
            (acc, item) => {
                if (item.currency === 'USD') acc.usd += item.amount
                else acc.ars += item.amount
                return acc
            },
            { ars: 0, usd: 0 }
        )
    }, [filteredPurchases])

    const lowConfidenceCount = filteredPurchases.filter(t => t.confidence === 'low').length
    const validationWarnings = parsed?.validation.warnings ?? []
    const hasValidationWarning = validationWarnings.length > 0

    const handleNext = async () => {
        if (step === 1) {
            if (parsed) setStep(2)
            return
        }
        if (step === 2) {
            setStep(3)
            return
        }
        if (step === 3) {
            const transactions: CreateConsumptionInput[] = filteredPurchases.map(t => ({
                cardId: card.id,
                description: t.description,
                amount: t.amount,
                purchaseDateISO: t.date,
                currency: t.currency,
                installmentTotal: t.installments?.total,
                createAllInstallments: t.installments?.total ? groupInstallments : undefined,
            }))
            await onImport(transactions, card)
            toast({
                title: 'Consumos importados',
                description: 'Tu saldo se actualizo correctamente.',
                variant: 'success',
            })
            onClose()
        }
    }

    const handleBack = () => {
        if (step > 1) setStep(prev => prev - 1)
    }

    const stepTitle =
        step === 1
            ? 'Paso 1 de 3: Subir archivo'
            : step === 2
                ? 'Paso 2 de 3: Revisar datos'
                : 'Paso 3 de 3: Confirmacion final'

    const progressWidth = step === 1 ? 'w-1/3' : step === 2 ? 'w-2/3' : 'w-full'
    const nextLabel = step === 3 ? 'Importar consumos' : step === 2 ? 'Confirmar datos' : 'Continuar'
    const nextDisabled =
        step === 1
            ? !parsed || isParsing
            : step === 2
                ? filteredPurchases.length === 0
                : hasValidationWarning && !forceImport

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center px-4">
            <div
                className="absolute inset-0 bg-[#0B1121]/80 backdrop-blur-sm"
                onClick={onClose}
            />
            <div className="relative w-full max-w-4xl mx-auto p-4">
                <div className="bg-[#1E293B] border border-white/10 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden flex flex-col max-h-[90vh]">
                    <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-[#151E32]">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400">
                                <FileUp className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="font-display text-lg font-medium text-white">
                                    Importar Resumen
                                </h3>
                                <p className="text-xs text-slate-400">{stepTitle}</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="text-slate-400 hover:text-white transition rounded-full p-1 hover:bg-white/10"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="h-1 w-full bg-slate-800">
                        <div className={`h-full bg-indigo-500 transition-all duration-300 ${progressWidth}`} />
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 min-h-[420px]">
                        {step === 1 && (
                            <div className="h-full flex flex-col items-center justify-center space-y-6">
                                <div
                                    className="w-full max-w-xl h-64 border-2 border-dashed border-white/10 hover:border-indigo-400/50 bg-white/[0.02] hover:bg-indigo-500/[0.02] rounded-2xl flex flex-col items-center justify-center text-center p-8 transition-all cursor-pointer group"
                                    onClick={() => fileInputRef.current?.click()}
                                    onDrop={handleDrop}
                                    onDragOver={(event) => event.preventDefault()}
                                >
                                    <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                        <UploadCloud className="w-8 h-8 text-slate-400 group-hover:text-indigo-400 transition-colors" />
                                    </div>
                                    <h4 className="text-lg font-medium text-white mb-2">Arrastra tu PDF aqui</h4>
                                    <p className="text-sm text-slate-400 mb-6">o hace click para buscar</p>
                                    <span className="text-xs font-mono text-slate-500 py-1 px-3 rounded-full border border-white/5 bg-white/5">
                                        Admite: .pdf (Nativo)
                                    </span>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="application/pdf"
                                        className="hidden"
                                        onChange={handleInputChange}
                                    />
                                </div>
                                {import.meta.env.DEV && (
                                    <button
                                        onClick={handleSampleLoad}
                                        className="text-sm text-indigo-400 hover:text-indigo-300 underline decoration-dashed underline-offset-4"
                                    >
                                        Usar PDF de ejemplo (Demo)
                                    </button>
                                )}
                                {isParsing && (
                                    <div className="text-xs text-slate-500">Procesando PDF...</div>
                                )}
                            </div>
                        )}

                        {step === 2 && parsed && (
                            <div className="flex flex-col space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="bg-slate-900/50 p-4 rounded-xl border border-white/5 flex items-center gap-3">
                                        <div className="w-10 h-10 bg-blue-900/30 rounded-lg flex items-center justify-center text-blue-400 font-bold text-xs">
                                            {parsed.meta.issuer || card.network || 'CARD'}
                                        </div>
                                        <div>
                                            <div className="text-xs text-slate-500 uppercase font-mono">Emisor</div>
                                            <div className="text-sm text-white font-medium">
                                                {parsed.meta.issuer ?? 'UNKNOWN'}
                                            </div>
                                            {parsed.meta.last4 && (
                                                <div className="text-[10px] text-slate-500 font-mono">
                                                    **** {parsed.meta.last4}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="bg-slate-900/50 p-4 rounded-xl border border-white/5">
                                        <div className="text-xs text-slate-500 uppercase font-mono">Cierre</div>
                                        <div className="text-sm text-white font-medium">
                                            {formatMetaDate(parsed.meta.periodClose)}
                                        </div>
                                    </div>
                                    <div className="bg-slate-900/50 p-4 rounded-xl border border-white/5">
                                        <div className="text-xs text-slate-500 uppercase font-mono">Vencimiento</div>
                                        <div className="text-sm text-white font-medium">
                                            {formatMetaDate(parsed.meta.dueDate)}
                                        </div>
                                    </div>
                                    <div className="bg-slate-900/50 p-4 rounded-xl border border-white/5">
                                        <div className="text-xs text-slate-500 uppercase font-mono">Total consumos</div>
                                        <div className="text-sm text-white font-mono font-bold">
                                            $ {parsed.meta.totalPurchases !== undefined
                                                ? arsFormatter.format(parsed.meta.totalPurchases)
                                                : '-'}
                                        </div>
                                    </div>
                                    <div className="bg-slate-900/50 p-4 rounded-xl border border-white/5">
                                        <div className="text-xs text-slate-500 uppercase font-mono">Saldo actual</div>
                                        <div className="text-sm text-white font-mono font-bold">
                                            $ {parsed.meta.currentBalance !== undefined
                                                ? arsFormatter.format(parsed.meta.currentBalance)
                                                : '-'}
                                        </div>
                                    </div>
                                    <div className="bg-slate-900/50 p-4 rounded-xl border border-white/5">
                                        <div className="text-xs text-slate-500 uppercase font-mono">Pago minimo</div>
                                        <div className="text-sm text-white font-mono font-bold">
                                            $ {parsed.meta.minimumPayment !== undefined
                                                ? arsFormatter.format(parsed.meta.minimumPayment)
                                                : '-'}
                                        </div>
                                    </div>
                                </div>

                                {hasValidationWarning && (
                                    <div className="flex items-start gap-3 p-4 bg-amber-500/5 border border-amber-500/10 rounded-lg text-left">
                                        <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
                                        <div className="text-sm text-slate-300">
                                            <strong className="text-amber-400 block mb-1">
                                                Revisa esta importacion
                                            </strong>
                                            <ul className="text-xs text-slate-400 space-y-1">
                                                {validationWarnings.map((warning) => (
                                                    <li key={warning}>{warning}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    </div>
                                )}

                                <div className="bg-[#0B1121] border border-white/5 rounded-xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                        <Switch checked={groupInstallments} onCheckedChange={setGroupInstallments} />
                                        <div>
                                            <p className="text-sm text-white">Agrupar cuotas</p>
                                            <p className="text-xs text-slate-400">Unificar cuotas del mismo consumo</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <Switch checked={ignoreUsd} onCheckedChange={setIgnoreUsd} />
                                        <div>
                                            <p className="text-sm text-white">Ignorar USD</p>
                                            <p className="text-xs text-slate-400">Solo importar ARS</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-slate-900/40 border border-white/5 rounded-xl p-4">
                                    <p className="text-xs text-slate-500 uppercase font-mono mb-3">
                                        Mapping opcional
                                    </p>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                                        {Object.entries(mapping).map(([key, value]) => (
                                            <label key={key} className="flex items-center justify-between gap-3">
                                                <span className="text-slate-400 capitalize">{key}</span>
                                                <select
                                                    className="bg-slate-950 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-slate-200"
                                                    value={value}
                                                    onChange={(event) =>
                                                        setMapping(prev => ({ ...prev, [key]: event.target.value }))
                                                    }
                                                >
                                                    {['Fecha', 'Detalle', 'Monto', 'Moneda', 'Cuotas'].map(option => (
                                                        <option key={option} value={option}>
                                                            {option}
                                                        </option>
                                                    ))}
                                                </select>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                <div className="bg-[#0B1121] border border-white/5 rounded-xl overflow-hidden">
                                    <div className="grid grid-cols-12 px-4 py-2 border-b border-white/5 bg-slate-950 text-[10px] font-mono uppercase text-slate-500">
                                        <div className="col-span-1 text-center">#</div>
                                        <div className="col-span-2">Fecha</div>
                                        <div className="col-span-5">Detalle</div>
                                        <div className="col-span-2 text-right">Monto</div>
                                        <div className="col-span-2 text-center">Estado</div>
                                    </div>
                                    <div className="overflow-y-auto max-h-[300px] divide-y divide-white/5">
                                        {purchaseRows.map((item) => {
                                            const isSelected = selectedIds.has(item.id)
                                            const rowTone = item.isDuplicate
                                                ? 'opacity-50'
                                                : item.confidence === 'low'
                                                    ? 'bg-amber-500/[0.05]'
                                                    : item.confidence === 'medium'
                                                        ? 'bg-slate-800/30'
                                                        : ''
                                            const badge = item.isDuplicate ? (
                                                <span className="bg-purple-500/10 text-purple-400 px-1.5 py-0.5 rounded text-[10px] border border-purple-500/20">
                                                    DUP
                                                </span>
                                            ) : item.confidence === 'high' ? (
                                                <span className="text-emerald-400 text-[10px] font-bold">OK</span>
                                            ) : item.confidence === 'medium' ? (
                                                <span className="bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded text-[10px] border border-blue-500/20">
                                                    MEDIA
                                                </span>
                                            ) : (
                                                <span className="bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded text-[10px] border border-amber-500/20">
                                                    BAJA
                                                </span>
                                            )

                                            return (
                                                <div
                                                    key={item.id}
                                                    className={`grid grid-cols-12 px-4 py-3 items-center hover:bg-white/5 text-sm ${rowTone}`}
                                                >
                                                    <div className="col-span-1 text-center">
                                                        <input
                                                            type="checkbox"
                                                            checked={isSelected}
                                                            onChange={() => toggleSelected(item.id)}
                                                            className="rounded border-slate-600 bg-slate-800 text-indigo-400 focus:ring-offset-0 w-3 h-3"
                                                            disabled={item.isDuplicate}
                                                        />
                                                    </div>
                                                    <div className="col-span-2 font-mono text-slate-400 text-xs">
                                                        {formatPreviewDate(item.date)}
                                                    </div>
                                                    <div className="col-span-5 text-slate-300 truncate pr-2">
                                                        {item.description}
                                                    </div>
                                                    <div className="col-span-2 text-right font-mono text-slate-200">
                                                        {item.currency === 'USD' ? 'USD ' : '$ '}
                                                        {arsFormatter.format(item.amount)}
                                                    </div>
                                                    <div className="col-span-2 text-center">{badge}</div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            </div>
                        )}

                        {step === 3 && parsed && (
                            <div className="h-full flex flex-col items-center justify-center text-center space-y-8">
                                <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center border border-emerald-500/20">
                                    <Check className="w-10 h-10 text-emerald-500" />
                                </div>
                                <div className="space-y-2">
                                    <h3 className="text-2xl font-display font-bold text-white">
                                        Todo listo para importar
                                    </h3>
                                    <p className="text-slate-400 max-w-md mx-auto">
                                        Detectamos <strong className="text-white">{filteredPurchases.length} consumos</strong>{' '}
                                        validos. Se van a agregar a tu lista actual y el saldo se va a actualizar.
                                    </p>
                                </div>
                                <div className="grid grid-cols-2 gap-4 w-full max-w-md">
                                    <div className="bg-slate-900 p-4 rounded-xl border border-white/5 text-left">
                                        <div className="text-xs text-slate-500 font-mono uppercase mb-1">Total ARS</div>
                                        <div className="text-xl font-mono text-white">
                                            $ {arsFormatter.format(summaryTotals.ars)}
                                        </div>
                                    </div>
                                    <div className="bg-slate-900 p-4 rounded-xl border border-white/5 text-left">
                                        <div className="text-xs text-slate-500 font-mono uppercase mb-1">Total USD</div>
                                        <div className="text-xl font-mono text-white">
                                            USD {arsFormatter.format(summaryTotals.usd)}
                                        </div>
                                    </div>
                                </div>
                                {lowConfidenceCount > 0 && (
                                    <div className="flex items-start gap-3 p-4 bg-amber-500/5 border border-amber-500/10 rounded-lg text-left max-w-md">
                                        <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
                                        <div className="text-sm text-slate-300">
                                            <strong className="text-amber-400 block mb-1">
                                                Revisa {lowConfidenceCount} consumos con baja confianza
                                            </strong>
                                            Hay items marcados en amarillo que no pudimos categorizar bien.
                                        </div>
                                    </div>
                                )}
                                {hasValidationWarning && (
                                    <div className="flex items-start gap-3 p-4 bg-rose-500/5 border border-rose-500/10 rounded-lg text-left max-w-md">
                                        <AlertTriangle className="w-5 h-5 text-rose-400 flex-shrink-0" />
                                        <div className="text-sm text-slate-300">
                                            <strong className="text-rose-300 block mb-1">
                                                La validacion no coincide
                                            </strong>
                                            <p className="text-xs text-slate-400 mb-3">
                                                Confirma si queres importar igual.
                                            </p>
                                            <label className="flex items-center gap-2 text-xs text-slate-200">
                                                <input
                                                    type="checkbox"
                                                    checked={forceImport}
                                                    onChange={(event) => setForceImport(event.target.checked)}
                                                    className="rounded border-slate-600 bg-slate-800 text-rose-400 focus:ring-offset-0 w-3 h-3"
                                                />
                                                Importar igual
                                            </label>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="px-6 py-4 border-t border-white/5 bg-[#151E32] flex justify-between items-center">
                        <button
                            onClick={handleBack}
                            className={`text-slate-400 hover:text-white text-sm font-medium px-4 py-2 ${
                                step === 1 ? 'invisible' : ''
                            }`}
                        >
                            Volver
                        </button>
                        <div className="flex gap-3">
                            <button
                                onClick={onClose}
                                className="px-4 py-2 rounded-lg border border-white/10 text-slate-300 hover:text-white hover:bg-white/5 text-sm font-medium transition"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleNext}
                                disabled={nextDisabled}
                                className="px-6 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium shadow-lg shadow-indigo-500/20 transition disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {nextLabel}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
