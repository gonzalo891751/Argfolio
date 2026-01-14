import { useCallback } from 'react'
import { Upload, FileSpreadsheet, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FileUploadZoneProps {
    onFileSelect: (file: File) => void
    isLoading?: boolean
    error?: string
    acceptedFile?: File
}

export function FileUploadZone({
    onFileSelect,
    isLoading,
    error,
    acceptedFile,
}: FileUploadZoneProps) {
    const handleDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault()
            e.stopPropagation()
            const file = e.dataTransfer.files[0]
            if (file) {
                onFileSelect(file)
            }
        },
        [onFileSelect]
    )

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
    }, [])

    const handleFileInput = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0]
            if (file) {
                onFileSelect(file)
            }
        },
        [onFileSelect]
    )

    return (
        <div className="space-y-4">
            <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                className={cn(
                    'relative border-2 border-dashed rounded-xl p-12 text-center transition-all',
                    'hover:border-primary/50 hover:bg-primary/5',
                    error ? 'border-destructive/50 bg-destructive/5' : 'border-muted-foreground/25',
                    acceptedFile && !error ? 'border-success/50 bg-success/5' : ''
                )}
            >
                <input
                    type="file"
                    accept=".csv,.txt,.xlsx,.xls"
                    onChange={handleFileInput}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    disabled={isLoading}
                />

                <div className="flex flex-col items-center gap-4">
                    {acceptedFile && !error ? (
                        <>
                            <div className="h-16 w-16 rounded-full bg-success/10 flex items-center justify-center">
                                <FileSpreadsheet className="h-8 w-8 text-success" />
                            </div>
                            <div>
                                <p className="font-medium text-success">{acceptedFile.name}</p>
                                <p className="text-sm text-muted-foreground">
                                    {(acceptedFile.size / 1024).toFixed(1)} KB
                                </p>
                            </div>
                        </>
                    ) : error ? (
                        <>
                            <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
                                <AlertCircle className="h-8 w-8 text-destructive" />
                            </div>
                            <div>
                                <p className="font-medium text-destructive">Error</p>
                                <p className="text-sm text-destructive/80">{error}</p>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                                <Upload className="h-8 w-8 text-primary" />
                            </div>
                            <div>
                                <p className="font-medium">
                                    Arrastrá tu archivo CSV o Excel aquí
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    o hacé clic para seleccionar
                                </p>
                            </div>
                            <div className="flex gap-2 text-xs text-muted-foreground">
                                <span className="px-2 py-1 bg-muted rounded">CSV</span>
                                <span className="px-2 py-1 bg-muted rounded">XLSX</span>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {isLoading && (
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    Procesando archivo...
                </div>
            )}
        </div>
    )
}
