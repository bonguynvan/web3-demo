/**
 * documentMeta — per-route title / description / OG-image manager.
 *
 * Used instead of react-helmet-async to keep the bundle lean. Mutates
 * <title>, <meta name="description">, <meta property="og:*">, twitter
 * cards, and <link rel="canonical"> directly on the document head.
 *
 * Restores the previous values on unmount so SPA route changes don't
 * leak stale tags into the next view.
 */

import { useEffect } from 'react'

export interface DocumentMeta {
  /** Final document title. Vite project default is set in index.html. */
  title: string
  description?: string
  /** Path-only, e.g. "/proof". Resolved against window.location.origin. */
  canonical?: string
  /** Path-only, e.g. "/proof-og.png". Falls back to /og.png in index.html. */
  ogImage?: string
  /** Override og:type. Defaults to "website". */
  ogType?: 'website' | 'article'
}

function setOrCreateMeta(attr: 'name' | 'property', key: string, value: string): string | null {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  const prev = el?.content ?? null
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.content = value
  return prev
}

function setOrCreateLink(rel: string, href: string): string | null {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
  const prev = el?.href ?? null
  if (!el) {
    el = document.createElement('link')
    el.rel = rel
    document.head.appendChild(el)
  }
  el.href = href
  return prev
}

export function useDocumentMeta(meta: DocumentMeta): void {
  useEffect(() => {
    const prevTitle = document.title
    document.title = meta.title

    const ogType = meta.ogType ?? 'website'
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const absoluteOgImage = meta.ogImage ? `${origin}${meta.ogImage}` : null
    const absoluteCanonical = meta.canonical ? `${origin}${meta.canonical}` : null

    const restores: Array<() => void> = [() => { document.title = prevTitle }]

    if (meta.description) {
      const prev = setOrCreateMeta('name', 'description', meta.description)
      const prevOg = setOrCreateMeta('property', 'og:description', meta.description)
      const prevTw = setOrCreateMeta('name', 'twitter:description', meta.description)
      restores.push(() => {
        if (prev !== null) setOrCreateMeta('name', 'description', prev)
        if (prevOg !== null) setOrCreateMeta('property', 'og:description', prevOg)
        if (prevTw !== null) setOrCreateMeta('name', 'twitter:description', prevTw)
      })
    }

    const prevOgTitle = setOrCreateMeta('property', 'og:title', meta.title)
    const prevTwTitle = setOrCreateMeta('name', 'twitter:title', meta.title)
    restores.push(() => {
      if (prevOgTitle !== null) setOrCreateMeta('property', 'og:title', prevOgTitle)
      if (prevTwTitle !== null) setOrCreateMeta('name', 'twitter:title', prevTwTitle)
    })

    const prevOgType = setOrCreateMeta('property', 'og:type', ogType)
    restores.push(() => {
      if (prevOgType !== null) setOrCreateMeta('property', 'og:type', prevOgType)
    })

    if (absoluteOgImage) {
      const prevOgImg = setOrCreateMeta('property', 'og:image', absoluteOgImage)
      const prevTwImg = setOrCreateMeta('name', 'twitter:image', absoluteOgImage)
      restores.push(() => {
        if (prevOgImg !== null) setOrCreateMeta('property', 'og:image', prevOgImg)
        if (prevTwImg !== null) setOrCreateMeta('name', 'twitter:image', prevTwImg)
      })
    }

    if (absoluteCanonical) {
      const prevCanonical = setOrCreateLink('canonical', absoluteCanonical)
      const prevOgUrl = setOrCreateMeta('property', 'og:url', absoluteCanonical)
      restores.push(() => {
        if (prevCanonical !== null) setOrCreateLink('canonical', prevCanonical)
        if (prevOgUrl !== null) setOrCreateMeta('property', 'og:url', prevOgUrl)
      })
    }

    return () => {
      // Run restores in reverse order so later overrides unwind first.
      for (const r of restores.reverse()) r()
    }
  }, [meta.title, meta.description, meta.canonical, meta.ogImage, meta.ogType])
}
