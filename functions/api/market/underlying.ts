
/**
 * Cloudflare Pages Function to proxy Stooq requests for underlying prices.
 * Handles symbol mapping (e.g. BRK.B -> BRK-B.US) and batching.
 */
export const onRequest = async (context: any) => {
    const url = new URL(context.request.url);
    const tickerParam = url.searchParams.get('ticker') || url.searchParams.get('tickers');

    if (!tickerParam) {
        return new Response(JSON.stringify({ error: 'Missing ticker parameter' }), { status: 400 });
    }

    const tickers = tickerParam.split(',').map(t => t.trim().toUpperCase()).filter(Boolean);
    if (tickers.length === 0) {
        return new Response(JSON.stringify({ error: 'No valid tickers' }), { status: 400 });
    }

    // Limit batch size
    const limitedTickers = tickers.slice(0, 50);

    // Helper: Map ticker to Stooq symbol
    // Stooq format: 
    // - BRK.B -> BRK-B.US 
    // - AAPL -> AAPL.US
    const mapToStooq = (t: string) => {
        if (t === 'BRK.B' || t === 'BRK/B') return 'BRK-B.US';
        if (t === 'BF.B') return 'BF-B.US'; // Brown-Forman
        // Add other specific mappings if known.
        // Default: just append .US if no dot exists. 
        if (t.includes('.')) {
            // If manual dot like PBR.A -> PBR-A.US logic?
            // Stooq often uses dashes for classes.
            return t.replace('.', '-') + '.US';
        }
        return `${t}.US`;
    };

    const symbols = limitedTickers.map(mapToStooq).join('+');

    // f=sl1p2d1t1: Symbol, Last, Change%, Date, Time
    const stooqUrl = `https://stooq.com/q/l/?s=${symbols}&f=sl1p2d1t1&h&e=csv`;

    try {
        const response = await fetch(stooqUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; Argfolio/1.0)'
            }
        });

        if (!response.ok) {
            throw new Error(`Stooq upstream error: ${response.status}`);
        }

        const csvText = await response.text();
        const lines = csvText.split('\n');
        const items: any[] = [];

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            // Stooq CSV: Symbol,Last,Change%,Date,Time
            // Example: AAPL.US,168.22,-1.23%,2023-10-27,22:00:00
            const parts = line.split(',');
            if (parts.length < 3) continue;

            const stooqSym = parts[0];
            const priceStr = parts[1];
            const changeStr = parts[2];

            // Stooq returns "N/D" when data is missing
            if (priceStr === 'N/D') continue;

            const price = parseFloat(priceStr);
            const changePct = parseFloat(changeStr.replace('%', '')); // Stooq includes %

            if (!isNaN(price)) {
                // Reverse map stooqSym to requested ticker? 
                // Or just return the ticker part before dot/dash?
                // Better: we can try to find which input ticker mapped to this stooqSym.
                // But simplified clean:
                // BRK-B.US -> BRK.B (If we want to match input)
                // For now, let's return the cleaned "root" ticker or just match client side by loose map.
                // The client likely sent "BRK.B", we requested "BRK-B.US". Response says "BRK-B.US".
                // We should return "BRK.B" if possible, or client needs to be smart.
                // Let's strip the suffix and restore commons.

                let cleanTicker = stooqSym.replace('.US', '');
                // Reverse Common fixes
                if (cleanTicker === 'BRK-B') cleanTicker = 'BRK.B';
                if (cleanTicker === 'BF-B') cleanTicker = 'BF.B';

                // Also Stooq might return "AAPL" if .US is implied? usually AAPL.US

                items.push({
                    ticker: cleanTicker,
                    symbol: stooqSym,
                    priceUsd: price,
                    changePct1d: !isNaN(changePct) ? changePct : null,
                    updatedAt: new Date().toISOString()
                });
            }
        }

        return new Response(JSON.stringify({
            source: 'Stooq',
            items
        }), {
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=60, s-maxage=300', // Cache for 60s client, 300s edge
                'Access-Control-Allow-Origin': '*'
            }
        });

    } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
};
