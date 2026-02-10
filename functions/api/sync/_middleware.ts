import { jsonResponse, optionsResponse, type SyncEnv } from '../_lib/sync'

function extractBearerToken(authorizationHeader: string | null): string | null {
    if (!authorizationHeader) return null
    const [scheme, token] = authorizationHeader.trim().split(/\s+/, 2)
    if (!scheme || !token) return null
    if (scheme.toLowerCase() !== 'bearer') return null
    const normalized = token.trim()
    return normalized.length > 0 ? normalized : null
}

export const onRequest: PagesFunction<SyncEnv> = async (context) => {
    if (context.request.method === 'OPTIONS') {
        return optionsResponse()
    }

    const expectedToken = (context.env.ARGFOLIO_SYNC_TOKEN ?? '').trim()
    const receivedToken = extractBearerToken(context.request.headers.get('Authorization'))

    if (expectedToken.length === 0) {
        return jsonResponse({
            error: 'Unauthorized',
            details: 'Sync token not configured.',
            hint: 'Set ARGFOLIO_SYNC_TOKEN in Cloudflare Pages secrets.',
        }, 401)
    }

    if (!receivedToken || receivedToken !== expectedToken) {
        return jsonResponse({
            error: 'Unauthorized',
            details: 'Missing or invalid bearer token.',
            hint: 'Send Authorization: Bearer <ARGFOLIO_SYNC_TOKEN>.',
        }, 401)
    }

    return context.next()
}
