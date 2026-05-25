/**
 * ServeAI Unauthorized Screen
 *
 * Shown in place of the password LoginScreen when the workspace is running
 * in ServeAI-managed mode and the request does not carry a valid ServeAI
 * session (user logged out, token expired, or URL pasted directly).
 *
 * Mirrors the 401/403 HTML page returned by hermes-webui/api/routes.py
 * when serveai_instance_id is absent or the access token is missing/invalid.
 */

interface ServeAIUnauthorizedScreenProps {
  /** URL to redirect to for ServeAI login. Defaults to '/login'. */
  serveAILoginUrl?: string
}

export function ServeAIUnauthorizedScreen({
  serveAILoginUrl = '/login',
}: ServeAIUnauthorizedScreenProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-primary-50 px-4">
      <div className="w-full max-w-md">
        <div className="rounded-2xl bg-primary-100 px-8 py-10 text-center shadow-xl shadow-primary-900/5 ring-1 ring-primary-200">
          {/* Lock icon */}
          <div className="mb-6 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-500/10 ring-1 ring-accent-500/20">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-8 w-8 text-accent-500"
                aria-hidden="true"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
          </div>

          {/* Logo + title */}
          <div className="mb-4 flex items-center justify-center gap-2">
            <svg
              width="24"
              height="24"
              viewBox="0 0 100 100"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="text-accent-500"
              aria-hidden="true"
            >
              <path
                d="M50 10 L90 30 L90 70 L50 90 L10 70 L10 30 Z"
                fill="currentColor"
                opacity="0.15"
              />
              <path
                d="M50 25 L75 38 L75 62 L50 75 L25 62 L25 38 Z"
                fill="currentColor"
                opacity="0.3"
              />
              <circle cx="50" cy="50" r="15" fill="currentColor" />
            </svg>
            <span className="text-lg font-bold tracking-tight text-primary-900">
              Hermes Workspace
            </span>
          </div>

          <h1 className="mb-2 text-xl font-semibold text-primary-900">
            Not Authorized
          </h1>

          <p className="mb-1 text-sm text-primary-600">
            Hermes Workspace can only be accessed through the ServeAI platform.
          </p>
          <p className="mb-8 text-sm text-primary-500">
            Please open Hermes from your ServeAI dashboard, or log in to ServeAI first.
          </p>

          <a
            href={serveAILoginUrl}
            className="inline-flex items-center gap-2 rounded-lg bg-accent-500 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-accent-600 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2"
          >
            Go to ServeAI Login
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z"
                clipRule="evenodd"
              />
            </svg>
          </a>
        </div>
      </div>
    </div>
  )
}
