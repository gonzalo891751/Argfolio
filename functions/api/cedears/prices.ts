export const onRequest = async (context: any) => {
    const PPI_URL = 'https://www.portfoliopersonal.com/Cotizaciones/Cedears';

    try {
        const response = await fetch(PPI_URL, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch PPI: ${response.status}`);
        }

        const html = await response.text();

        const items: Array<{ ticker: string; lastPriceArs: number; changePct?: number }> = [];

        // Naive parsing based on common table structures
        const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
        let match;

        while ((match = rowRegex.exec(html)) !== null) {
            const rowContent = match[1];

            const cells = rowContent.split('</td>');
            if (cells.length > 3) {
                // Cell 0: Ticker usually
                let ticker = '';
                const cleanCell0 = cells[0].replace(/<[^>]+>/g, '').trim();

                // Sometimes ticker is wrapped in newlines
                const possibleTicker = cleanCell0.split(/\s+/)[0];

                if (/^[A-Z]+$/.test(possibleTicker)) {
                    ticker = possibleTicker;
                } else {
                    // Maybe inside an <a> tag in cell 0
                    const tm = cells[0].match(/>([A-Z]+)<\/a>/);
                    if (tm) ticker = tm[1];
                }

                if (ticker && ticker !== 'SYMBOL' && ticker.length > 0) {
                    // Cell 2 is often "Último" price on PPI tables (0: Especie, 1: Venc/Plazo?, 2: Último?)
                    // Let's look for the first valid price formatting in cells l, 2, 3

                    let foundPrice = false;
                    let lastPriceArs = 0;
                    let changePct = 0;

                    // Search cells for Price and Var %
                    // Typical columns: [0] Ticker [1] Vto [2] Ultimo [3] Var [4] Var% ...
                    // Let's try to map by index if possible, but fallback to regex

                    if (cells[2]) {
                        const priceText = cells[2].replace(/<[^>]+>/g, '').trim();
                        // Format: 1.234,56
                        if (/^[0-9.]+,[0-9]{2}$/.test(priceText)) {
                            lastPriceArs = parseFloat(priceText.replace(/\./g, '').replace(',', '.'));
                            if (!isNaN(lastPriceArs) && lastPriceArs > 0) foundPrice = true;
                        }
                    }

                    // Try cell 4 for Var % (e.g. "1,50%", "-0,30%")
                    if (foundPrice && cells[4]) {
                        const varText = cells[4].replace(/<[^>]+>/g, '').trim().replace('%', '');
                        // Format: -1,23 or 1,23
                        if (/^-?[0-9.]+,[0-9]{2}$/.test(varText)) {
                            changePct = parseFloat(varText.replace(/\./g, '').replace(',', '.'));
                        }
                    }

                    if (foundPrice) {
                        items.push({ ticker, lastPriceArs, changePct });
                    }
                }
            }
        }

        return new Response(JSON.stringify({
            source: 'PPI',
            updatedAt: new Date().toISOString(),
            items
        }), {
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=600',
                'Access-Control-Allow-Origin': '*'
            }
        });

    } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};
