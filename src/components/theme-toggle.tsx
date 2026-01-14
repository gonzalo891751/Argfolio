import { Sun, Moon, Monitor } from 'lucide-react'
import { useTheme } from '@/lib/theme'
import { Button } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function ThemeToggle() {
    const { theme, setTheme, resolvedTheme } = useTheme()

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                    {resolvedTheme === 'dark' ? (
                        <Moon className="h-4 w-4" />
                    ) : (
                        <Sun className="h-4 w-4" />
                    )}
                    <span className="sr-only">Cambiar tema</span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem
                    onClick={() => setTheme('light')}
                    className={theme === 'light' ? 'bg-accent' : ''}
                >
                    <Sun className="h-4 w-4 mr-2" />
                    Claro
                </DropdownMenuItem>
                <DropdownMenuItem
                    onClick={() => setTheme('dark')}
                    className={theme === 'dark' ? 'bg-accent' : ''}
                >
                    <Moon className="h-4 w-4 mr-2" />
                    Oscuro
                </DropdownMenuItem>
                <DropdownMenuItem
                    onClick={() => setTheme('system')}
                    className={theme === 'system' ? 'bg-accent' : ''}
                >
                    <Monitor className="h-4 w-4 mr-2" />
                    Sistema
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
