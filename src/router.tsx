import { createRouter } from '@tanstack/react-router'

// Import the generated route tree
import { routeTree } from './routeTree.gen'

declare global {
  interface Window {
    /**
     * Optional runtime override for the TanStack router basepath. Allows the
     * same built artifact to be hosted under a path prefix by reverse proxies
     * or container orchestrators (e.g. mounted at `/workspaces/<id>/`) without
     * a rebuild. Set this on `window` before the app bundle executes — for
     * example via an inline `<script>` injected by the proxy.
     */
    __HERMES_WORKSPACE_BASEPATH__?: string
  }
}

/**
 * Path ServeAI mounts each instance under: /hermes-workspace/<instanceId>/…
 *
 * Its proxy strips that prefix before the request reaches this app, so the server only
 * ever sees "/" — but the browser address bar keeps it. Without a basepath the client
 * router would try to match the full pathname against its own routes and find nothing.
 */
const SERVEAI_MOUNT_PREFIX = '/hermes-workspace'

/**
 * MongoDB ObjectId or UUID — the two shapes ServeAI issues, and narrow enough that no
 * route name can be mistaken for one. A looser check would swallow "/hermes-workspace"
 * routes if this app ever gained any.
 */
const INSTANCE_ID_PATTERN =
  /^([a-fA-F0-9]{24}|[a-fA-F0-9]{8}(-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12})$/

/**
 * Normalize to a leading slash and no trailing slash: TanStack's pathname matching
 * misbehaves subtly on both `basepath: ''` and trailing slashes.
 */
function normalizeBasepath(value: string): string {
  const withLeadingSlash = value.startsWith('/') ? value : `/${value}`
  const withoutTrailing = withLeadingSlash.replace(/\/+$/, '')
  return withoutTrailing.length > 0 ? withoutTrailing : '/'
}

/** Recover the mount prefix from the address bar, or null when not hosted by ServeAI. */
function basepathFromLocation(): string | null {
  const segments = window.location.pathname.split('/').filter(Boolean)
  if (segments.length < 2) return null
  if (`/${segments[0]}` !== SERVEAI_MOUNT_PREFIX) return null
  if (!INSTANCE_ID_PATTERN.test(segments[1])) return null
  return `${SERVEAI_MOUNT_PREFIX}/${segments[1]}`
}

export function resolveRouterBasepath(): string {
  if (typeof window === 'undefined') return '/'

  const value = window.__HERMES_WORKSPACE_BASEPATH__
  if (typeof value === 'string' && value.trim()) {
    return normalizeBasepath(value.trim())
  }

  // Explicit override wins; otherwise fall back to the URL, which covers ServeAI
  // without anyone having to inject a script into the streamed SSR response.
  return basepathFromLocation() ?? '/'
}

// Create a new router instance
export const getRouter = () => {
  const router = createRouter({
    routeTree,
    context: {},
    basepath: resolveRouterBasepath(),

    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  })

  return router
}
