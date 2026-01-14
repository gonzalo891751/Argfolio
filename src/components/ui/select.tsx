import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
    options: { value: string; label: string }[]
    placeholder?: string
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
    ({ className, options, placeholder, ...props }, ref) => {
        return (
            <div className="relative">
                <select
                    className={cn(
                        'flex h-10 w-full appearance-none rounded-lg border border-input bg-background px-3 py-2 pr-8 text-sm',
                        'ring-offset-background',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                        'disabled:cursor-not-allowed disabled:opacity-50',
                        className
                    )}
                    ref={ref}
                    {...props}
                >
                    {placeholder && (
                        <option value="" disabled>
                            {placeholder}
                        </option>
                    )}
                    {options.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                            {opt.label}
                        </option>
                    ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 opacity-50 pointer-events-none" />
            </div>
        )
    }
)

Select.displayName = 'Select'
