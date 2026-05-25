import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  isServeAIMode,
  SERVEAI_ID_RE,
  getAccessTokenFromRequest,
  buildServeAICtxCookie,
  verifyServeAIInstanceAccess,
  type ServeAIContext,
} from '../../../server/serveai-context'

/**
 * POST /api/serveai/context-init
 *
 * Called by the client when the page URL contains ServeAI context query
 * params (serveai_instance_id, serveai_org_id, serveai_user_id). This
 * endpoint validates the context against the ServeAI gateway and sets the
 * serveai_ctx cookie so subsequent requests can authenticate without
 * query params (same as hermes-webui's initial page-request handler).
 *
 * Body (JSON):
 *   { instanceId: string, orgId?: string, userId?: string }
 *
 * Responses:
 *   200 { ok: true, instanceName?: string }
 *   400 { ok: false, error: 'invalid_params' }
 *   401 { ok: false, error: 'no_access_token' }
 *   403 { ok: false, error: 'access_denied' }
 *   503 { ok: false, error: 'not_serveai_mode' }
 */
export const Route = createFileRoute('/api/serveai/context-init')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isServeAIMode()) {
          return json({ ok: false, error: 'not_serveai_mode' }, { status: 503 })
        }

        // Parse and validate body
        let body: Partial<ServeAIContext>
        try {
          body = (await request.json()) as Partial<ServeAIContext>
        } catch {
          return json({ ok: false, error: 'invalid_params' }, { status: 400 })
        }

        const instanceId = String(body.instanceId ?? '').trim()
        const orgId = String(body.orgId ?? '').trim()
        const userId = String(body.userId ?? '').trim()

        if (!instanceId || !SERVEAI_ID_RE.test(instanceId)) {
          return json({ ok: false, error: 'invalid_params' }, { status: 400 })
        }

        // Must have access token cookie
        const accessToken = getAccessTokenFromRequest(request)
        if (!accessToken) {
          return json({ ok: false, error: 'no_access_token' }, { status: 401 })
        }

        // Verify instance access via ServeAI gateway (mirrors hermes-webui's gateway call)
        const result = await verifyServeAIInstanceAccess(instanceId, accessToken)

        if (result === false) {
          // 4xx from gateway — caller is not authorised for this instance
          return json({ ok: false, error: 'access_denied' }, { status: 403 })
        }

        // result === null means network error — fail open (don't lock out)
        const ctx: ServeAIContext = {
          instanceId,
          orgId: orgId && SERVEAI_ID_RE.test(orgId) ? orgId : '',
          userId: userId && SERVEAI_ID_RE.test(userId) ? userId : '',
        }

        // Extract instance name if available
        let instanceName = ''
        if (result && typeof result === 'object') {
          const data = (result as Record<string, unknown>).data ?? result
          if (data && typeof data === 'object') {
            instanceName = String((data as Record<string, unknown>).name ?? '')
          }
        }

        const cookieHeader = buildServeAICtxCookie(ctx)

        return json(
          { ok: true, instanceName },
          {
            headers: { 'Set-Cookie': cookieHeader },
          },
        )
      },
    },
  },
})
