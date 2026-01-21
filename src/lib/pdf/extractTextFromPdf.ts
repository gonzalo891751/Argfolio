import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs'
import workerSrc from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url'

let workerConfigured = false

function ensureWorker() {
    if (workerConfigured) return
    GlobalWorkerOptions.workerSrc = workerSrc
    workerConfigured = true
}

function normalizeLine(line: string): string {
    return line.replace(/\s+/g, ' ').trim()
}

function buildLinesFromItems(items: Array<{ str?: string; transform: number[] }>): string[] {
    const rows = new Map<number, { x: number; text: string }[]>()
    for (const item of items) {
        const text = item.str?.trim()
        if (!text) continue
        const y = Math.round(item.transform[5])
        const x = Math.round(item.transform[4])
        const row = rows.get(y) ?? []
        row.push({ x, text })
        rows.set(y, row)
    }

    const sortedRows = Array.from(rows.entries()).sort((a, b) => b[0] - a[0])
    return sortedRows.map(([, row]) => {
        const sorted = row.sort((a, b) => a.x - b.x)
        return normalizeLine(sorted.map(part => part.text).join(' '))
    }).filter(Boolean)
}

export async function extractTextFromPdf(file: File): Promise<string[]> {
    ensureWorker()
    const data = await file.arrayBuffer()
    const loadingTask = getDocument({ data })
    const pdf = await loadingTask.promise
    const lines: string[] = []

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber)
        const content = await page.getTextContent()
        const textItems = (content.items as Array<{ str?: string; transform: number[] }>).filter(
            (item) => typeof item === 'object' && item !== null && 'str' in item
        )
        const pageLines = buildLinesFromItems(textItems)
        lines.push(...pageLines)
    }

    return lines.map(normalizeLine).filter(Boolean)
}
