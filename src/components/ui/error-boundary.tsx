import { Component, ErrorInfo, ReactNode } from 'react'
import { AlertTriangle, Home, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

interface Props {
    children: ReactNode
}

interface State {
    hasError: boolean
    error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
    }

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error }
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error:', error, errorInfo)
    }

    private handleReset = () => {
        this.setState({ hasError: false, error: null })
        window.location.href = '/'
    }

    private handleReload = () => {
        window.location.reload()
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-[60vh] flex items-center justify-center p-4">
                    <Card className="w-full max-w-md border-destructive/20 bg-destructive/5">
                        <CardHeader>
                            <div className="flex items-center gap-2 text-destructive mb-2">
                                <div className="h-8 w-8 rounded-full bg-destructive/10 flex items-center justify-center">
                                    <AlertTriangle className="h-5 w-5" />
                                </div>
                                <CardTitle className="text-xl">Algo salió mal</CardTitle>
                            </div>
                            <CardDescription>
                                Se produjo un error inesperado al renderizar esta página.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="bg-background/50 rounded-lg p-3 text-sm font-mono text-muted-foreground overflow-auto max-h-32 border">
                                {this.state.error?.message || 'Error desconocido'}
                            </div>
                        </CardContent>
                        <CardFooter className="flex gap-2 justify-end">
                            <Button variant="outline" onClick={this.handleReset}>
                                <Home className="h-4 w-4 mr-2" />
                                Ir al Inicio
                            </Button>
                            <Button onClick={this.handleReload}>
                                <RefreshCw className="h-4 w-4 mr-2" />
                                Recargar
                            </Button>
                        </CardFooter>
                    </Card>
                </div>
            )
        }

        return this.props.children
    }
}
