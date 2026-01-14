import { Link } from 'react-router-dom'
import { User, Settings, LogOut } from 'lucide-react'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function UserMenu() {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger className="h-8 w-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-semibold text-sm cursor-pointer hover:shadow-lg transition-shadow">
                U
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Mi cuenta</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="cursor-pointer">
                    <User className="h-4 w-4 mr-2" />
                    Perfil
                </DropdownMenuItem>
                <Link to="/settings">
                    <DropdownMenuItem className="cursor-pointer">
                        <Settings className="h-4 w-4 mr-2" />
                        Configuración
                    </DropdownMenuItem>
                </Link>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="cursor-pointer text-destructive">
                    <LogOut className="h-4 w-4 mr-2" />
                    Cerrar sesión
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
