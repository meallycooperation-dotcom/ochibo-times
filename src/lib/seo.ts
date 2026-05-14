export const SITE_NAME = 'Ochibo Times'
export const SITE_DESCRIPTION =
  'Ochibo Times publishes blogs, books, and news with a clean review workflow and fresh updates.'
export const DEFAULT_OG_IMAGE = '/favicon.svg'

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '')
}

export function getSiteUrl() {
  const configured = import.meta.env.VITE_SITE_URL as string | undefined
  if (configured && configured.trim()) {
    return trimTrailingSlash(configured.trim())
  }

  if (typeof window !== 'undefined') {
    return trimTrailingSlash(window.location.origin)
  }

  return 'http://localhost:5173'
}

export function buildAbsoluteUrl(path = '/') {
  const base = getSiteUrl()
  const resolvedPath = path.startsWith('/') ? path : `/${path}`
  return new URL(resolvedPath, `${base}/`).toString()
}
