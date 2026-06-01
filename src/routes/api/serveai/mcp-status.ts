import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isServeAIMode } from '../../../server/serveai-context'
import {
  BEARER_TOKEN,
  CLAUDE_API,
  ensureGatewayProbed,
  dashboardFetch,
  getCapabilities,
} from '../../../server/gateway-capabilities'
import { normalizeMcpList, normalizeMcpListFromConfig } from '../../../server/mcp-normalize'
import { getConfig } from '../../../server/claude-dashboard-api'

const REQUEST_TIMEOUT_MS = 10_000

/**
 * GET /api/serveai/mcp-status
 *
 * Returns whether the hermes-agent sidecar has successfully connected to
 * the ServeAI MCP server (i.e. the "serveai" entry in mcp_servers config).
 *
 * Only meaningful in ServeAI mode (SERVEAI_INSTANCE_ID env var set).
 *
 * Response:
 *   200 { connected: boolean, serverName: 'serveai', status: string, tools?: string[] }
 *   503 { error: string }  — not in ServeAI mode
 */
export const Route = createFileRoute('/api/serveai/mcp-status')({
  server: {
    handlers: {
      GET: async () => {
        if (!isServeAIMode()) {
          return json({ error: 'not_serveai_mode' }, { status: 503 })
        }

        try {
          await ensureGatewayProbed()
        } catch {
          return json({ connected: false, serverName: 'serveai', reason: 'gateway_unreachable' })
        }

        const capabilities = getCapabilities()

        let servers: ReturnType<typeof normalizeMcpList> = []

        try {
          if (capabilities.mcp) {
            // Dashboard or gateway supports /api/mcp — fetch live status
            let res: Response
            if (capabilities.dashboard.available) {
              res = await dashboardFetch('/api/mcp', {
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
              })
            } else {
              const headers = new Headers({ 'Content-Type': 'application/json' })
              if (BEARER_TOKEN) headers.set('Authorization', `Bearer ${BEARER_TOKEN}`)
              res = await fetch(`${CLAUDE_API}/api/mcp`, {
                headers,
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
              })
            }

            if (res.ok) {
              const body = (await res.json().catch(() => null)) as unknown
              servers = normalizeMcpList(body)
            }
          } else {
            // Phase 1.5 fallback — read from config.yaml cache
            const cfg = (await getConfig()) as unknown
            servers = normalizeMcpListFromConfig(cfg)
          }
        } catch {
          return json({ connected: false, serverName: 'serveai', reason: 'fetch_error' })
        }

        const serveaiServer = servers.find((s) => s.name === 'serveai')

        if (!serveaiServer) {
          return json({ connected: false, serverName: 'serveai', reason: 'not_registered' })
        }

        return json({
          connected: serveaiServer.status === 'connected',
          serverName: serveaiServer.name,
          status: serveaiServer.status,
          toolCount: serveaiServer.discoveredToolsCount,
          tools: serveaiServer.discoveredTools.map((t) => t.name),
        })
      },
    },
  },
})
