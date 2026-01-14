import { useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Upload, Columns, Eye, Check, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { FileUploadZone, ColumnMapper, ImportPreview } from '@/components/import'
import { useInstruments, useAccounts } from '@/hooks/use-instruments'
import {
    parseCSV,
    parseExcel,
    readFileAsText,
    readFileAsArrayBuffer,
    isCSVFile,
    isExcelFile,
    autoDetectMapping,
    mapRow,
    validateRows,
    generateBatchId,
    createMissingInstruments,
    createMissingAccounts,
    importMovements,
    undoImport,
} from '@/domain/import'
import type { ColumnMapping, MappedRow, ValidationResult, ImportResult, ImportDefaults } from '@/domain/import'
import type { AssetCategory, Currency } from '@/domain/types'
import { useQueryClient } from '@tanstack/react-query'

type Step = 'upload' | 'map' | 'preview' | 'result'

const STEPS: { id: Step; label: string; icon: typeof Upload }[] = [
    { id: 'upload', label: 'Subir archivo', icon: Upload },
    { id: 'map', label: 'Mapear columnas', icon: Columns },
    { id: 'preview', label: 'Vista previa', icon: Eye },
    { id: 'result', label: 'Resultado', icon: Check },
]

export function ImportPage() {
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const { data: instruments = [] } = useInstruments()
    const { data: accounts = [] } = useAccounts()

    const [step, setStep] = useState<Step>('upload')
    const [file, setFile] = useState<File | null>(null)
    const [error, setError] = useState<string>()
    const [isLoading, setIsLoading] = useState(false)

    // Parsing state
    const [headers, setHeaders] = useState<string[]>([])
    const [rawData, setRawData] = useState<string[][]>([])
    const [mapping, setMapping] = useState<ColumnMapping>({})
    const [defaults, setDefaults] = useState<ImportDefaults>({ type: 'BUY', currency: 'USD' })

    // Validation state
    const [mappedRows, setMappedRows] = useState<MappedRow[]>([])
    const [validation, setValidation] = useState<ValidationResult | null>(null)

    // Result state
    const [importResult, setImportResult] = useState<ImportResult | null>(null)

    // Maps for lookups
    const instrumentsMap = useMemo(
        () => new Map(instruments.map((i) => [i.id, i])),
        [instruments]
    )
    const accountsMap = useMemo(
        () => new Map(accounts.map((a) => [a.id, a])),
        [accounts]
    )

    // Handle file upload
    const handleFileSelect = useCallback(async (selectedFile: File) => {
        setError(undefined)
        setFile(selectedFile)

        if (!isCSVFile(selectedFile) && !isExcelFile(selectedFile)) {
            setError('Solo se aceptan archivos CSV o Excel')
            return
        }

        setIsLoading(true)
        try {
            let result
            if (isExcelFile(selectedFile)) {
                const buffer = await readFileAsArrayBuffer(selectedFile)
                result = parseExcel(buffer)
            } else {
                const content = await readFileAsText(selectedFile)
                result = parseCSV(content)
            }

            if (result.errors.length > 0) {
                setError(result.errors[0])
                return
            }

            setHeaders(result.headers)
            setRawData(result.data)
            setMapping(autoDetectMapping(result.headers))
            setStep('map')
        } catch (err) {
            setError('Error al leer el archivo')
        } finally {
            setIsLoading(false)
        }
    }, [])

    // Handle mapping completion → run validation
    const handleMappingComplete = useCallback(() => {
        const rows = rawData.map((row, i) => mapRow(row, i, mapping, defaults))
        setMappedRows(rows)

        const result = validateRows(rows, instrumentsMap, accountsMap)
        setValidation(result)
        setStep('preview')
    }, [rawData, mapping, defaults, instrumentsMap, accountsMap])

    // Create missing instruments
    const handleCreateInstruments = useCallback(
        async (symbols: Set<string>, category: AssetCategory, currency: Currency) => {
            await createMissingInstruments(symbols, category, currency)
            queryClient.invalidateQueries({ queryKey: ['instruments'] })

            // Re-validate after creation
            setTimeout(() => {
                const updatedInstruments = new Map(instrumentsMap)
                for (const symbol of symbols) {
                    const id = symbol.toLowerCase().replace(/[^a-z0-9]/g, '')
                    updatedInstruments.set(id, {
                        id,
                        symbol: symbol.toUpperCase(),
                        name: symbol.toUpperCase(),
                        category,
                        nativeCurrency: currency,
                        priceKey: id,
                    })
                }
                const result = validateRows(mappedRows, updatedInstruments, accountsMap)
                setValidation(result)
            }, 100)
        },
        [queryClient, instrumentsMap, accountsMap, mappedRows]
    )

    // Create missing accounts
    const handleCreateAccounts = useCallback(
        async (names: Set<string>) => {
            await createMissingAccounts(names)
            queryClient.invalidateQueries({ queryKey: ['accounts'] })

            // Re-validate after creation
            setTimeout(() => {
                const updatedAccounts = new Map(accountsMap)
                for (const name of names) {
                    const id = name.toLowerCase().replace(/[^a-z0-9]/g, '')
                    updatedAccounts.set(id, {
                        id,
                        name: name.trim(),
                        kind: 'EXCHANGE',
                        defaultCurrency: 'USD',
                    })
                }
                const result = validateRows(mappedRows, instrumentsMap, updatedAccounts)
                setValidation(result)
            }, 100)
        },
        [queryClient, instrumentsMap, accountsMap, mappedRows]
    )

    // Execute import
    const handleImport = useCallback(async () => {
        if (!validation) return

        setIsLoading(true)
        try {
            const batchId = generateBatchId()

            // Refresh maps with latest data
            const latestInstruments = await queryClient.fetchQuery({
                queryKey: ['instruments'],
            }) as typeof instruments
            const latestAccounts = await queryClient.fetchQuery({
                queryKey: ['accounts'],
            }) as typeof accounts

            const instMap = new Map(latestInstruments.map((i) => [i.id, i]))
            const accMap = new Map(latestAccounts.map((a) => [a.id, a]))

            const result = await importMovements(validation.validRows, batchId, instMap, accMap)
            setImportResult(result)

            queryClient.invalidateQueries({ queryKey: ['movements'] })
            queryClient.invalidateQueries({ queryKey: ['portfolio'] })

            setStep('result')
        } catch (err) {
            setError(`Error al importar: ${err}`)
        } finally {
            setIsLoading(false)
        }
    }, [validation, queryClient])

    // Undo import
    const handleUndo = useCallback(async () => {
        if (!importResult) return

        setIsLoading(true)
        try {
            await undoImport(importResult.batchId)
            queryClient.invalidateQueries({ queryKey: ['movements'] })
            queryClient.invalidateQueries({ queryKey: ['portfolio'] })
            setImportResult(null)
            setStep('upload')
            setFile(null)
            setHeaders([])
            setRawData([])
            setMapping({})
        } finally {
            setIsLoading(false)
        }
    }, [importResult, queryClient])

    const currentStepIndex = STEPS.findIndex((s) => s.id === step)
    const canGoBack = step === 'map' || step === 'preview'
    const canProceed =
        (step === 'map' && Object.values(mapping).some((v) => v !== undefined)) ||
        (step === 'preview' && validation && validation.summary.valid > 0 &&
            validation.unknownSymbols.size === 0 && validation.unknownAccounts.size === 0)

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <div>
                    <h1 className="text-2xl font-bold">Importar Movimientos</h1>
                    <p className="text-muted-foreground">Cargá tus operaciones desde un archivo CSV</p>
                </div>
            </div>

            {/* Stepper */}
            <div className="flex items-center gap-2">
                {STEPS.map((s, i) => {
                    const Icon = s.icon
                    const isActive = s.id === step
                    const isPast = i < currentStepIndex

                    return (
                        <div key={s.id} className="flex items-center gap-2">
                            <div
                                className={`
                                    flex items-center gap-2 px-3 py-2 rounded-lg transition-colors
                                    ${isActive ? 'bg-primary text-primary-foreground' : ''}
                                    ${isPast ? 'bg-success/10 text-success' : ''}
                                    ${!isActive && !isPast ? 'bg-muted text-muted-foreground' : ''}
                                `}
                            >
                                <Icon className="h-4 w-4" />
                                <span className="text-sm font-medium hidden sm:inline">{s.label}</span>
                            </div>
                            {i < STEPS.length - 1 && (
                                <div className={`w-8 h-0.5 ${isPast ? 'bg-success' : 'bg-muted'}`} />
                            )}
                        </div>
                    )
                })}
            </div>

            {/* Step Content */}
            <Card>
                <CardContent className="p-6">
                    {step === 'upload' && (
                        <FileUploadZone
                            onFileSelect={handleFileSelect}
                            isLoading={isLoading}
                            error={error}
                            acceptedFile={file ?? undefined}
                        />
                    )}

                    {step === 'map' && (
                        <ColumnMapper
                            headers={headers}
                            previewRows={rawData}
                            mapping={mapping}
                            onMappingChange={setMapping}
                            defaults={defaults}
                            onDefaultsChange={setDefaults}
                        />
                    )}

                    {step === 'preview' && validation && (
                        <ImportPreview
                            validation={validation}
                            onCreateInstruments={handleCreateInstruments}
                            onCreateAccounts={handleCreateAccounts}
                        />
                    )}

                    {step === 'result' && importResult && (
                        <div className="text-center py-8 space-y-6">
                            <div className="h-16 w-16 rounded-full bg-success/10 flex items-center justify-center mx-auto">
                                <Check className="h-8 w-8 text-success" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-success">¡Importación exitosa!</h2>
                                <p className="text-muted-foreground mt-2">
                                    Se crearon {importResult.movementsCreated} movimientos
                                </p>
                            </div>

                            {importResult.errors.length > 0 && (
                                <div className="text-left bg-warning/10 rounded-lg p-4 max-w-md mx-auto">
                                    <p className="font-medium text-warning mb-2">
                                        Algunas filas no se importaron:
                                    </p>
                                    <ul className="text-sm text-warning/80 space-y-1">
                                        {importResult.errors.slice(0, 5).map((e, i) => (
                                            <li key={i}>• {e}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            <div className="flex justify-center gap-4">
                                <Button variant="outline" onClick={handleUndo}>
                                    <Undo2 className="h-4 w-4 mr-2" />
                                    Deshacer importación
                                </Button>
                                <Button variant="gradient" onClick={() => navigate('/movements')}>
                                    Ver movimientos
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Navigation */}
            {step !== 'result' && (
                <div className="flex justify-between">
                    <Button
                        variant="outline"
                        onClick={() => setStep(STEPS[currentStepIndex - 1].id)}
                        disabled={!canGoBack}
                    >
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Anterior
                    </Button>

                    {step === 'map' && (
                        <Button
                            variant="gradient"
                            onClick={handleMappingComplete}
                            disabled={!canProceed}
                        >
                            Vista previa
                            <ArrowRight className="h-4 w-4 ml-2" />
                        </Button>
                    )}

                    {step === 'preview' && (
                        <Button
                            variant="gradient"
                            onClick={handleImport}
                            disabled={!canProceed || isLoading}
                        >
                            {isLoading ? 'Importando...' : 'Importar'}
                            <Check className="h-4 w-4 ml-2" />
                        </Button>
                    )}
                </div>
            )}
        </div>
    )
}
