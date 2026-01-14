export const onRequest: PagesFunction = async (context) => {
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

        const items: Array<{ ticker: string; lastPriceArs: number }> = [];

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
                    // Search cells 1, 2, 3 for price
                    for (let i = 1; i <= 3; i++) {
                        if (foundPrice) break;
                        if (!cells[i]) continue;

                        const cellText = cells[i].replace(/<[^>]+>/g, '').trim();
                        // Check match 1.234,56 or 123,45
                        if (/^[0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2}$/.test(cellText) || /^[0-9]+,[0-9]{2}$/.test(cellText)) {
                            const priceStr = cellText.replace(/\./g, '').replace(',', '.');
                            const price = parseFloat(priceStr);
                            if (!isNaN(price) && price > 0) {
                                items.push({ ticker, lastPriceArs: price });
                                foundPrice = true;
                            }
                        }
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
