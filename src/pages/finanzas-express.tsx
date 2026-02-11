import { ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function FinanzasExpressPage() {
    return (
        <div className="flex flex-col h-[calc(100dvh-4rem)] -m-4 md:-m-6 lg:-m-8">
            {/* Toolbar */}
            <div className="flex items-center justify-between px-4 py-2 border-b bg-card/50">
                <h1 className="text-sm font-medium text-muted-foreground">Presupuesto Express</h1>
                <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-xs"
                    onClick={() => window.open('/apps/finanzas-express/index.html', '_blank')}
                >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Abrir en pestaña nueva
                </Button>
            </div>
            {/* Iframe */}
            <iframe
                src="/apps/finanzas-express/index.html"
                title="Presupuesto Express"
                className="flex-1 w-full border-0"
                allow="clipboard-read; clipboard-write"
            />
        </div>
    )
}
