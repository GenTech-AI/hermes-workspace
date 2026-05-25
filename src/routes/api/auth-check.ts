import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  isAuthenticated,
  isPasswordProtectionEnabled,
} from '../../server/auth-middleware'
import { ensureGatewayProbed } from '../../server/gateway-capabilities'
import {
  isServeAIMode,
  getServeAICtxFromRequest,
  getAccessTokenFromRequest,
  verifyServeAIInstanceAccess,
  getServeAILoginUrl,
} from '../../server/serveai-context'

export const Route = createFileRoute('/api/auth-check')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // ── ServeAI mode: use gateway-backed auth instead of password ────────
        if (isServeAIMode()) {
          const ctx = getServeAICtxFromRequest(request)
          const accessToken = getAccessTokenFromRequest(request)
          const loginUrl = getServeAILoginUrl()

          // No instance context or no access token → not authenticated
          if (!ctx.instanceId || !accessToken) {
            return json({
              authenticated: false,
              authRequired: true,
              serveAIMode: true,
              serveAILoginUrl: loginUrl,
            })
          }

          // Verify instance access with gateway
          const result = await verifyServeAIInstanceAccess(ctx.instanceId, accessToken)

          if (result === false) {
            // 4xx from gateway — token invalid or no access to this instance
            return json({
              authenticated: false,
              authRequired: true,
              serveAIMode: true,
              serveAILoginUrl: loginUrl,
            })
          }

          // result === null means network error — fail open (same as hermes-webui)
          return json({
            authenticated: true,
            authRequired: true,
            serveAIMode: true,
          })
        }

        // ── Standard mode: check hermes-agent connectivity + password ────────
        try {
          // Use ensureGatewayProbed() which handles auto-detection across
          // multiple ports (8642, 8643) instead of checking a single
          // hardcoded URL. This was previously a standalone
          // isBackendReachable() that only tried port 8642 and never
          // benefited from the gateway-capabilities auto-detection logic.
          const caps = await ensureGatewayProbed()
          const reachable = caps.health || caps.chatCompletions || caps.models

          if (!reachable) {
            return json(
              {
                authenticated: false,
                authRequired: false,
                error: 'claude_agent_unreachable',
              },
              { status: 503 },
            )
          }
        } catch (error) {
          return json(
            {
              authenticated: false,
              authRequired: false,
              error:
                error instanceof DOMException && error.name === 'AbortError'
                  ? 'claude_agent_timeout'
                  : 'claude_agent_unreachable',
            },
            { status: 503 },
          )
        }

        const authRequired = isPasswordProtectionEnabled()
        const authenticated = isAuthenticated(request)

        return json({
          authenticated,
          authRequired,
        })
      },
    },
  },
})
