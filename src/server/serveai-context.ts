/**
 * ServeAI context management for Hermes Workspace.
 *
 * Mirrors the auth-guard logic from hermes-webui/api/routes.py:
 *   - _parse_cookie_header        → parseCookiesRaw
 *   - _get_access_token_from_cookie → getAccessTokenFromRequest
 *   - _get_serveai_ctx_cookie      → getServeAICtxFromRequest
 *   - _get_serveai_context_from_request → getServeAIContextFromRequest
 *   - _build_serveai_ctx_cookie    → buildServeAICtxCookie
 *   - _SERVEAI_ID_RE               → SERVEAI_ID_RE
 *
 * Key design decisions (inherited from hermes-webui):
 *  1. Manual cookie parser — SimpleCookie (Python) / native API (JS) can
 *     silently drop cookies with JWT values (dots in name/value).
 *  2. Referer-first priority — each browser tab sends its URL as Referer,
 *     making instance-id per-tab rather than per-session-cookie.
 *  3. Fail-open on gateway errors — network outages must not lock out users.
 */

// Same pattern as Python _SERVEAI_ID_RE — accepts MongoDB ObjectIds and UUIDs.
export const SERVEAI_ID_RE = /^[a-fA-F0-9-]{1,64}$/

export interface ServeAIContext {
  instanceId: string
  orgId: string
  userId: string
}

// ---------------------------------------------------------------------------
// Mode helpers
// ---------------------------------------------------------------------------

/**
 * Returns true when the workspace is running inside a ServeAI-managed pod.
 * Detected by the presence of the SERVEAI_INSTANCE_ID env var injected
 * via kube-scheduler-service envPayload at deploy time.
 */
export function isServeAIMode(): boolean {
  return !!(process.env.SERVEAI_INSTANCE_ID)
}

/**
 * URL the user should be redirected to when not authorised.
 *
 * Returns an explicit value only when SERVEAI_LOGIN_URL is set in the pod
 * env. Otherwise returns undefined — the client component falls back to
 * same-origin /login, matching hermes-webui's
 *   window.location.origin + '/login'
 * behaviour (the ServeAI gateway proxies /login to the main web app).
 */
export function getServeAILoginUrl(): string | undefined {
  return process.env.SERVEAI_LOGIN_URL || undefined
}

// ---------------------------------------------------------------------------
// Cookie parsing (mirrors Python _parse_cookie_header)
// ---------------------------------------------------------------------------

/**
 * Manually parse a Cookie header string into a key→value map.
 *
 * We intentionally avoid `document.cookie` split heuristics or the
 * `cookie` npm package's strict modes because JWT values contain dots
 * that can confuse RFC-strict parsers into dropping the cookie entirely.
 */
export function parseCookiesRaw(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {}
  const result: Record<string, string> = {}
  for (const chunk of cookieHeader.split(';')) {
    const eq = chunk.indexOf('=')
    if (eq === -1) continue
    const key = chunk.slice(0, eq).trim()
    let val = chunk.slice(eq + 1).trim()
    // Strip surrounding double-quotes and unescape backslashes
    // (mirrors Python _parse_cookie_header's RFC 6265 dquote handling)
    if (val.length >= 2 && val[0] === '"' && val[val.length - 1] === '"') {
      val = val.slice(1, -1).replaceAll('\\"', '"').replaceAll('\\\\', '\\')
    }
    // First occurrence wins (same as Python dict.setdefault)
    if (key && !(key in result)) result[key] = val
  }
  return result
}

// ---------------------------------------------------------------------------
// accessToken extraction (mirrors Python _get_access_token_from_cookie)
// ---------------------------------------------------------------------------

/**
 * Extract the ServeAI accessToken JWT from the request Cookie header.
 *
 * Rejects placeholder values set by VueUse useCookie(…).value = null, e.g.
 * "null", "undefined". Returns null if absent or invalid.
 */
export function getAccessTokenFromRequest(request: Request): string | null {
  const cookies = parseCookiesRaw(request.headers.get('cookie'))
  const token = cookies['accessToken'] ?? ''
  if (!token || ['null', 'undefined', '""', "''"].includes(token)) return null
  return token
}

// ---------------------------------------------------------------------------
// serveai_ctx cookie (mirrors Python _get_serveai_ctx_cookie)
// ---------------------------------------------------------------------------

function safeId(value: unknown): string {
  const v = String(value ?? '').trim()
  return v && SERVEAI_ID_RE.test(v) ? v : ''
}

/**
 * Parse the serveai_ctx JSON cookie from the request.
 * Returns partial/empty context on parse failure (never throws).
 */
export function getServeAICtxFromRequest(request: Request): ServeAIContext {
  const cookies = parseCookiesRaw(request.headers.get('cookie'))
  const raw = cookies['serveai_ctx'] ?? ''
  try {
    if (raw) {
      const decoded = decodeURIComponent(raw)
      const parsed = JSON.parse(decoded) as Partial<ServeAIContext>
      return {
        instanceId: safeId(parsed.instanceId),
        orgId: safeId(parsed.orgId),
        userId: safeId(parsed.userId),
      }
    }
  } catch {
    // Ignore malformed cookie
  }
  return { instanceId: '', orgId: '', userId: '' }
}

// ---------------------------------------------------------------------------
// Full context resolution (mirrors Python _get_serveai_context_from_request)
// ---------------------------------------------------------------------------

/**
 * Resolve ServeAI context: Referer query params first, cookie fallback.
 *
 * Priority (same as hermes-webui):
 *  1. Referer URL → per-tab, immune to cookie cross-tab bleed
 *  2. serveai_ctx cookie → fallback for same-origin navigations
 */
export function getServeAIContextFromRequest(request: Request): ServeAIContext {
  const ctx: ServeAIContext = { instanceId: '', orgId: '', userId: '' }

  const referer = request.headers.get('referer') ?? ''
  if (referer) {
    try {
      const refUrl = new URL(referer)
      ctx.instanceId = safeId(refUrl.searchParams.get('serveai_instance_id'))
      ctx.orgId = safeId(refUrl.searchParams.get('serveai_org_id'))
      ctx.userId = safeId(refUrl.searchParams.get('serveai_user_id'))
    } catch {
      // Ignore unparsable Referer
    }
  }

  const cookieCtx = getServeAICtxFromRequest(request)
  if (!ctx.instanceId) ctx.instanceId = cookieCtx.instanceId
  if (!ctx.orgId) ctx.orgId = cookieCtx.orgId
  if (!ctx.userId) ctx.userId = cookieCtx.userId

  return ctx
}

// ---------------------------------------------------------------------------
// Cookie builder (mirrors Python _build_serveai_ctx_cookie)
// ---------------------------------------------------------------------------

/**
 * Build a Set-Cookie header value for the serveai_ctx cookie.
 * The value is URI-encoded JSON matching hermes-webui's format.
 */
export function buildServeAICtxCookie(ctx: ServeAIContext): string {
  const value = encodeURIComponent(JSON.stringify(ctx))
  return `serveai_ctx=${value}; Path=/; HttpOnly; SameSite=Lax`
}

// ---------------------------------------------------------------------------
// Gateway verification
// ---------------------------------------------------------------------------

/**
 * Verify that the access token grants access to the given Hermes instance
 * by calling the ServeAI API gateway.
 *
 * Returns:
 *   - Record<string, unknown>  → valid access, contains instance data
 *   - false                    → 4xx from gateway (unauthorized / not found)
 *   - null                     → network / 5xx error → caller should fail open
 */
export async function verifyServeAIInstanceAccess(
  instanceId: string,
  accessToken: string,
): Promise<Record<string, unknown> | false | null> {
  const apiUrl = (process.env.SERVEAI_API_URL ?? '').replace(/\/$/, '')
  if (!apiUrl) return null // No gateway configured — fail open

  // SERVEAI_API_URL already contains the /api path prefix (e.g. http://gt-serveai-service:3000/api)
  // so append /hermes-instances/... directly — same as hermes-webui serveai_client.py:
  //   url = f"{SERVEAI_API_URL}/hermes-instances/{instance_id}"
  const url = `${apiUrl}/hermes-instances/${encodeURIComponent(instanceId)}`
  const controller = new AbortController()
  const tid = setTimeout(() => controller.abort(), 8_000)

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    })
    clearTimeout(tid)

    if (res.status >= 400 && res.status < 500) return false // Unauthorized / Not Found
    if (!res.ok) return null // 5xx — fail open

    return (await res.json()) as Record<string, unknown>
  } catch {
    clearTimeout(tid)
    return null // Network error — fail open
  }
}
