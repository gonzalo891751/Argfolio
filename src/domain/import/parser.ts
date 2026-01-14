import Papa from 'papaparse'
import * as XLSX from 'xlsx'

export interface ParseResult {
    data: string[][]
    headers: string[]
    delimiter: string // 'xlsx' for Excel
    rowCount: number
    errors: string[]
    sheets?: string[] // For Excel, list of sheet names
}

/**
 * Parse CSV string with auto-detected delimiter
 */
export function parseCSV(content: string): ParseResult {
    const result = Papa.parse<string[]>(content, {
        header: false,
        skipEmptyLines: true,
        delimitersToGuess: [',', ';', '\t', '|'],
    })

    const data = result.data as string[][]
    const headers = data.length > 0 ? data[0] : []
    const rows = data.slice(1)

    return {
        data: rows,
        headers,
        delimiter: result.meta.delimiter || ',',
        rowCount: rows.length,
        errors: result.errors.map((e) => e.message),
    }
}

/**
 * Parse Excel file buffer
 */
export function parseExcel(buffer: ArrayBuffer, sheetName?: string): ParseResult {
    try {
        const workbook = XLSX.read(buffer, { type: 'array' })
        const sheet = sheetName ? workbook.Sheets[sheetName] : workbook.Sheets[workbook.SheetNames[0]]

        if (!sheet) {
            return {
                data: [],
                headers: [],
                delimiter: 'xlsx',
                rowCount: 0,
                errors: ['Hoja no encontrada'],
                sheets: workbook.SheetNames
            }
        }

        const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' })
        const headers = data.length > 0 ? (data[0] as string[]) : []
        const rows = data.slice(1) as string[][]

        return {
            data: rows,
            headers,
            delimiter: 'xlsx',
            rowCount: rows.length,
            errors: [],
            sheets: workbook.SheetNames
        }
    } catch (e) {
        return {
            data: [],
            headers: [],
            delimiter: 'xlsx',
            rowCount: 0,
            errors: ['Error al leer archivo Excel'],
        }
    }
}

/**
 * Read file as text
 */
export function readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = (e) => {
            const result = e.target?.result
            if (typeof result === 'string') {
                resolve(result)
            } else {
                reject(new Error('Failed to read file as text'))
            }
        }
        reader.onerror = () => reject(new Error('File read error'))
        reader.readAsText(file)
    })
}

/**
 * Read file as ArrayBuffer
 */
export function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = (e) => {
            const result = e.target?.result
            if (result instanceof ArrayBuffer) {
                resolve(result)
            } else {
                reject(new Error('Failed to read file as buffer'))
            }
        }
        reader.onerror = () => reject(new Error('File buffer error'))
        reader.readAsArrayBuffer(file)
    })
}

/**
 * Detect if file is CSV by extension
 */
export function isCSVFile(file: File): boolean {
    const ext = file.name.split('.').pop()?.toLowerCase()
    return ext === 'csv' || ext === 'txt'
}

/**
 * Detect if file is Excel by extension
 */
export function isExcelFile(file: File): boolean {
    const ext = file.name.split('.').pop()?.toLowerCase()
    return ext === 'xlsx' || ext === 'xls'
}
