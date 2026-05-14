import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import faviconUrl from '../assets/ochibo-times-favicon.jpg'
import {
  buildAbsoluteUrl,
  DEFAULT_OG_IMAGE,
  SITE_DESCRIPTION,
  SITE_NAME,
} from '../lib/seo'

type JsonLdValue = Record<string, unknown> | Record<string, unknown>[]

interface SeoProps {
  title: string
  description?: string
  path?: string
  image?: string
  noindex?: boolean
  type?: 'website' | 'article' | 'book'
  publishedTime?: string
  modifiedTime?: string
  author?: string
  section?: string
  jsonLd?: JsonLdValue
}

function updateMeta(name: string, content: string | null) {
  const selector = `meta[name="${name}"]`
  const existing = document.head.querySelector<HTMLMetaElement>(selector)

  if (!content) {
    existing?.remove()
    return
  }

  let tag = existing

  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute('name', name)
    tag.dataset.seo = 'true'
    document.head.appendChild(tag)
  }

  tag.content = content ?? ''
}

function updateProperty(property: string, content: string | null) {
  const selector = `meta[property="${property}"]`
  const existing = document.head.querySelector<HTMLMetaElement>(selector)

  if (!content) {
    existing?.remove()
    return
  }

  let tag = existing

  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute('property', property)
    tag.dataset.seo = 'true'
    document.head.appendChild(tag)
  }

  tag.content = content ?? ''
}

function updateLink(rel: string, href: string | null) {
  const selector = `link[rel="${rel}"]`
  const existing = document.head.querySelector<HTMLLinkElement>(selector)

  if (!href) {
    existing?.remove()
    return
  }

  let tag = existing

  if (!tag) {
    tag = document.createElement('link')
    tag.setAttribute('rel', rel)
    tag.dataset.seo = 'true'
    document.head.appendChild(tag)
  }

  if (href) {
    tag.href = href
  } else {
    tag.remove()
  }
}

function removeSeoScript() {
  document.head.querySelectorAll('script[data-seo="true"]').forEach((tag) => tag.remove())
}

export function Seo({
  title,
  description,
  path,
  image,
  noindex = false,
  type = 'website',
  publishedTime,
  modifiedTime,
  author,
  section,
  jsonLd,
}: SeoProps) {
  const location = useLocation()
  const resolvedDescription = description || SITE_DESCRIPTION
  const resolvedImage = image || DEFAULT_OG_IMAGE
  const resolvedUrl = buildAbsoluteUrl(path ?? `${location.pathname}${location.search}`)

  useEffect(() => {
    document.title = title ? `${title} | ${SITE_NAME}` : SITE_NAME

    updateMeta('description', resolvedDescription)
    updateMeta('robots', noindex ? 'noindex,nofollow,noarchive' : 'index,follow,max-image-preview:large')
    updateMeta('theme-color', '#0f172a')
    updateProperty('og:site_name', SITE_NAME)
    updateProperty('og:title', title)
    updateProperty('og:description', resolvedDescription)
    updateProperty('og:type', type)
    updateProperty('og:url', resolvedUrl)
    updateProperty('og:image', buildAbsoluteUrl(resolvedImage))
    updateMeta('twitter:card', 'summary_large_image')
    updateMeta('twitter:title', title)
    updateMeta('twitter:description', resolvedDescription)
    updateMeta('twitter:image', buildAbsoluteUrl(resolvedImage))
    updateLink('canonical', resolvedUrl)
    updateLink('icon', faviconUrl)
    updateLink('apple-touch-icon', faviconUrl)

    updateMeta('article:published_time', type === 'article' || type === 'book' ? publishedTime ?? null : null)
    updateMeta('article:modified_time', type === 'article' || type === 'book' ? modifiedTime ?? null : null)
    updateMeta('article:author', type === 'article' || type === 'book' ? author ?? null : null)
    updateMeta('article:section', type === 'article' || type === 'book' ? section ?? null : null)

    removeSeoScript()

    if (jsonLd) {
      const scripts = Array.isArray(jsonLd) ? jsonLd : [jsonLd]
      scripts.forEach((entry, index) => {
        const script = document.createElement('script')
        script.type = 'application/ld+json'
        script.dataset.seo = 'true'
        script.dataset.seoIndex = String(index)
        script.textContent = JSON.stringify(entry)
        document.head.appendChild(script)
      })
    }

    return () => {
      removeSeoScript()
    }
  }, [author, description, jsonLd, modifiedTime, noindex, path, publishedTime, resolvedDescription, resolvedImage, resolvedUrl, section, title, type])

  return null
}
