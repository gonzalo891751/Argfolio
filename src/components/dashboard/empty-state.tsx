import { useNavigate } from 'react-router-dom'
import { PlusCircle, Upload } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export function EmptyState() {
    const navigate = useNavigate()

    return (
        <Card className="col-span-full border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                    <PlusCircle className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">¡Bienvenido a Argfolio!</h3>
                <p className="text-muted-foreground mb-6 max-w-sm">
                    Empezá a trackear tu portfolio cargando tu primer movimiento o importando tus tenencias.
                </p>
                <div className="flex flex-col sm:flex-row gap-3">
                    <Button variant="gradient" onClick={() => navigate('/movements?new=1')}>
                        <PlusCircle className="h-4 w-4 mr-2" />
                        Cargar movimiento
                    </Button>
                    <Button variant="outline">
                        <Upload className="h-4 w-4 mr-2" />
                        Importar tenencias
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}
