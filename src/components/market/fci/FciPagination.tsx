/**
 * FCI Pagination Component
 * 
 * Page navigation with page size selector.
 */

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface FciPaginationProps {
    currentPage: number
    totalPages: number
    totalItems: number
    pageSize: number
    onPageChange: (page: number) => void
    onPageSizeChange: (size: number) => void
}

export function FciPagination({
    currentPage,
    totalPages,
    totalItems,
    pageSize,
    onPageChange,
    onPageSizeChange,
}: FciPaginationProps) {
    const start = (currentPage - 1) * pageSize + 1
    const end = Math.min(currentPage * pageSize, totalItems)

    // Generate page numbers to display
    const getPageNumbers = (): (number | 'ellipsis')[] => {
        const pages: (number | 'ellipsis')[] = []

        if (totalPages <= 5) {
            // Show all pages if 5 or fewer
            for (let i = 1; i <= totalPages; i++) pages.push(i)
        } else {
            // Always show first page
            pages.push(1)

            if (currentPage > 3) {
                pages.push('ellipsis')
            }

            // Show current and neighbors
            for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
                pages.push(i)
            }

            if (currentPage < totalPages - 2) {
                pages.push('ellipsis')
            }

            // Always show last page
            if (totalPages > 1) pages.push(totalPages)
        }

        return pages
    }

    if (totalItems === 0) return null

    return (
        <div className="flex flex-col sm:flex-row items-center justify-between mt-6 pt-4 border-t border-border/50 gap-4">
            {/* Info text */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground font-mono">
                <span>
                    Mostrando <span className="text-foreground">{start}</span>-
                    <span className="text-foreground">{end}</span> de{' '}
                    <span className="text-foreground">{totalItems}</span>
                </span>

                {/* Page size selector */}
                <select
                    value={pageSize}
                    onChange={(e) => onPageSizeChange(Number(e.target.value))}
                    className="bg-muted border border-border rounded py-1 px-2 text-xs text-foreground focus:outline-none focus:border-primary cursor-pointer"
                >
                    <option value={25}>25 / pág</option>
                    <option value={50}>50 / pág</option>
                </select>
            </div>

            {/* Navigation */}
            <div className="flex items-center gap-2">
                <button
                    onClick={() => onPageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className={cn(
                        "w-8 h-8 flex items-center justify-center rounded-lg border border-border",
                        "text-muted-foreground hover:bg-muted hover:text-foreground transition",
                        "disabled:opacity-30 disabled:pointer-events-none"
                    )}
                >
                    <ChevronLeft className="h-4 w-4" />
                </button>

                <div className="flex gap-1">
                    {getPageNumbers().map((page, idx) => (
                        page === 'ellipsis' ? (
                            <span
                                key={`ellipsis-${idx}`}
                                className="w-8 h-8 flex items-center justify-center text-muted-foreground"
                            >
                                …
                            </span>
                        ) : (
                            <button
                                key={page}
                                onClick={() => onPageChange(page)}
                                className={cn(
                                    "w-8 h-8 flex items-center justify-center rounded-lg text-xs font-medium transition",
                                    page === currentPage
                                        ? "bg-primary text-primary-foreground"
                                        : "border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                                )}
                            >
                                {page}
                            </button>
                        )
                    ))}
                </div>

                <button
                    onClick={() => onPageChange(currentPage + 1)}
                    disabled={currentPage >= totalPages}
                    className={cn(
                        "w-8 h-8 flex items-center justify-center rounded-lg border border-border",
                        "text-muted-foreground hover:bg-muted hover:text-foreground transition",
                        "disabled:opacity-30 disabled:pointer-events-none"
                    )}
                >
                    <ChevronRight className="h-4 w-4" />
                </button>
            </div>
        </div>
    )
}
