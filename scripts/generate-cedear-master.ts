
import fs from 'node:fs'
import path from 'node:path'
import * as XLSX from 'xlsx'

const INPUT_FILE = path.resolve('data/comafi-cedears.xlsx')
const OUTPUT_FILE = path.resolve('src/data/cedears/comafi-master.json')

interface CedearEntry {
    ticker: string
    name: string
    ratioText: string
    ratio: number
    country?: string
    isinCedear?: string
    isinUnderlying?: string
    caja?: string
}

function parseRatio(ratioText: string): number {
    if (!ratioText) return 0
    // Try to split "20:1" -> 20
    const parts = ratioText.split(':')
    if (parts.length > 0) {
        const num = parseFloat(parts[0])
        return isNaN(num) ? 0 : num
    }
    return 0
}

function main() {
    if (!fs.existsSync(INPUT_FILE)) {
        console.warn(`[GENERATE:CEDEARS] Warning: Input file not found at ${INPUT_FILE}`)
        console.warn(`[GENERATE:CEDEARS] Skipping generation. Using existing JSON if available.`)
        // If output doesn't exist, write empty array to prevent build fail
        if (!fs.existsSync(OUTPUT_FILE)) {
            fs.writeFileSync(OUTPUT_FILE, JSON.stringify([], null, 2))
            console.log(`[GENERATE:CEDEARS] Created empty master file to satisfy imports.`)
        }
        return
    }

    console.log(`[GENERATE:CEDEARS] Reading ${INPUT_FILE}...`)
    const workbook = XLSX.readFile(INPUT_FILE)
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]

    // Convert to JSON with header row inference
    // format: [ { "Identificación Mercado": "AAPL", ... } ]
    const rawData = XLSX.utils.sheet_to_json<any>(sheet)

    console.log(`[GENERATE:CEDEARS] Found ${rawData.length} rows. Parsing...`)

    const cedears: CedearEntry[] = []

    for (const row of rawData) {
        // Known columns (adjust based on actual Excel if needed):
        // "Identificación Mercado" -> Ticker
        // "DENOMINACION DEL PROGRAMA CEDEAR" -> Name
        // "Ratio Cedear/Acción ó ADR" -> Ratio

        const ticker = row['Identificación Mercado']
        const name = row['DENOMINACION DEL PROGRAMA CEDEAR'] || row['Denominación del programa'] // Try different case just in case
        const ratioText = row['Ratio Cedear/Acción ó ADR'] || row['Ratio']

        if (ticker && name) {
            const ratio = parseRatio(String(ratioText))
            cedears.push({
                ticker: String(ticker).trim(),
                name: String(name).trim(),
                ratioText: String(ratioText).trim(),
                ratio,
                caja: row['Caja de Valores'] ? String(row['Caja de Valores']) : undefined,
                isinCedear: row['ISIN - Cedear'] ? String(row['ISIN - Cedear']) : undefined,
                isinUnderlying: row['ISIN - Subyacente'] ? String(row['ISIN - Subyacente']) : undefined
            })
        }
    }

    console.log(`[GENERATE:CEDEARS] Extracted ${cedears.length} valid CEDEARs.`)

    fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true })
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(cedears, null, 2))
    console.log(`[GENERATE:CEDEARS] Wrote to ${OUTPUT_FILE}`)
}

main()
