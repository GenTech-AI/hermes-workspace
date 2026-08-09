// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { resolveRouterBasepath } from './router'

function setBasepathGlobal(value: unknown) {
  ;(window as unknown as Record<string, unknown>).__HERMES_WORKSPACE_BASEPATH__ =
    value
}

function clearBasepathGlobal() {
  delete (window as unknown as Record<string, unknown>)
    .__HERMES_WORKSPACE_BASEPATH__
}

function setPathname(pathname: string) {
  window.history.replaceState({}, '', pathname)
}

afterEach(() => {
  clearBasepathGlobal()
  setPathname('/')
})

describe('resolveRouterBasepath', () => {
  it('returns "/" when no global override is set', () => {
    clearBasepathGlobal()
    expect(resolveRouterBasepath()).toBe('/')
  })

  it('returns "/" when the global is not a string', () => {
    setBasepathGlobal(42)
    expect(resolveRouterBasepath()).toBe('/')
  })

  it('returns "/" when the global is an empty or whitespace string', () => {
    setBasepathGlobal('   ')
    expect(resolveRouterBasepath()).toBe('/')
  })

  it('normalizes a valid prefix with a leading slash and no trailing slash', () => {
    setBasepathGlobal('/workspaces/abc/')
    expect(resolveRouterBasepath()).toBe('/workspaces/abc')
  })

  it('adds a leading slash if one is missing', () => {
    setBasepathGlobal('workspaces/abc')
    expect(resolveRouterBasepath()).toBe('/workspaces/abc')
  })

  it('collapses multiple trailing slashes', () => {
    setBasepathGlobal('/workspaces/abc////')
    expect(resolveRouterBasepath()).toBe('/workspaces/abc')
  })
})

describe('resolveRouterBasepath — ServeAI mount prefix', () => {
  const instanceId = '6a788680b264e831aa5082aa'

  it('derives the basepath from the entry URL', () => {
    setPathname(`/hermes-workspace/${instanceId}/`)
    expect(resolveRouterBasepath()).toBe(`/hermes-workspace/${instanceId}`)
  })

  it('keeps the basepath after navigating deeper', () => {
    setPathname(`/hermes-workspace/${instanceId}/dashboard`)
    expect(resolveRouterBasepath()).toBe(`/hermes-workspace/${instanceId}`)
  })

  it('ignores a prefix whose second segment is not an instance ID', () => {
    setPathname('/hermes-workspace/dashboard')
    expect(resolveRouterBasepath()).toBe('/')
  })

  it('ignores unrelated paths so standalone hosting is unaffected', () => {
    setPathname('/dashboard')
    expect(resolveRouterBasepath()).toBe('/')
  })

  it('lets an explicit global override the URL', () => {
    setPathname(`/hermes-workspace/${instanceId}/`)
    setBasepathGlobal('/workspaces/abc')
    expect(resolveRouterBasepath()).toBe('/workspaces/abc')
  })
})
