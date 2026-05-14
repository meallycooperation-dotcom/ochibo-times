import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import {
  CalendarDays,
  Check,
  ChevronLeft,
  Copy,
  MessageCircleMore,
  Share2,
  Sparkles,
  Send,
  X,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { BlogPost, PageView } from '../lib/types'
import { Seo } from '../components/Seo'
import { EmptyState, SectionHeading } from '../components/SiteLayout'
import {
  addCachedPageView,
  getCachedPosts,
  syncBlogPosts,
} from '../lib/cache'
import { SITE_NAME, buildAbsoluteUrl } from '../lib/seo'

function formatDate(date: string) {
  return new Intl.DateTimeFormat('en', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date))
}

export function PostPage() {
  const { slug } = useParams()
  const [post, setPost] = useState<BlogPost | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')
  const viewedSlug = useRef<string | null>(null)

  useEffect(() => {
    if (!slug) {
      return
    }

    let active = true

    async function loadPost() {
      setLoading(true)

      try {
        await syncBlogPosts()
        const cachedPosts = await getCachedPosts()
        const currentPost =
          cachedPosts.find((entry) => entry.slug === slug && (entry.status === 'published' || entry.published)) ??
          null

        if (!active) {
          return
        }

        setPost(currentPost)
        setError(null)
      } catch (fetchError) {
        if (!active) {
          return
        }

        setError(fetchError instanceof Error ? fetchError.message : 'Failed to load post')
        setPost(null)
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    loadPost()

    return () => {
      active = false
    }
  }, [slug])

  useEffect(() => {
    if (!post || viewedSlug.current === post.slug) {
      return
    }

    const currentPost = post
    viewedSlug.current = currentPost.slug

    async function recordView() {
      const { data, error: insertError } = await supabase
        .from('page_views')
        .insert([{ post_id: currentPost.id, user_agent: navigator.userAgent }])
        .select('id, post_id, viewed_at')
        .single()

      if (insertError) {
        console.error('Failed to record view', insertError)
        return
      }

      if (data) {
        await addCachedPageView(data as PageView)
      }
    }

    void recordView()
  }, [post])

  useEffect(() => {
    if (!shareOpen) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShareOpen(false)
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [shareOpen])

  if (!slug) {
    return <Navigate to="/" replace />
  }

  const pageTitle = post ? `${post.title}` : 'Article not found'
  const pageDescription = post?.excerpt || post?.content.slice(0, 160) || 'Read the full article from Ochibo Times.'
  const pageImage = post?.featured_image ?? undefined
  const shareTitle = post?.title ?? pageTitle
  const shareText = post?.excerpt || post?.content.slice(0, 160) || 'Read this story on Ochibo Times.'
  const shareUrl = typeof window !== 'undefined' ? window.location.href : buildAbsoluteUrl(`/post/${slug}`)
  const canUseNativeShare =
    typeof window !== 'undefined' && typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  async function handleNativeShare() {
    if (!post || !canUseNativeShare) {
      return false
    }

    try {
      await navigator.share({
        title: shareTitle,
        text: shareText,
        url: shareUrl,
      })
      return true
    } catch (shareError) {
      if ((shareError as DOMException)?.name !== 'AbortError') {
        console.error('Native share failed', shareError)
      }
      return false
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopyState('copied')
      window.setTimeout(() => setCopyState('idle'), 1800)
    } catch (copyError) {
      console.error('Failed to copy share link', copyError)
      setCopyState('error')
      window.setTimeout(() => setCopyState('idle'), 2200)
    }
  }

  function openShareTarget(url: string) {
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  function handleShareButton() {
    setShareOpen(true)
  }

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const shareModal = post && shareOpen ? (
    <div className="share-overlay" onClick={() => setShareOpen(false)}>
      <div className="share-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Share article">
        <div className="share-modal-header">
          <div>
            <p className="eyebrow">Share this story</p>
            <h2>{post.title}</h2>
          </div>
          <button type="button" className="share-close" onClick={() => setShareOpen(false)} aria-label="Close share dialog">
            <X size={18} />
          </button>
        </div>

        <p className="share-description">{shareText}</p>

        <div className="share-grid">
          {canUseNativeShare ? (
            <button type="button" className="share-option share-option-primary" onClick={() => void handleNativeShare()}>
              <Share2 size={18} />
              Share on your device
            </button>
          ) : null}

          <button
            type="button"
            className="share-option"
            onClick={() => openShareTarget(`https://wa.me/?text=${encodeURIComponent(`${shareTitle} ${shareUrl}`)}`)}
          >
            <MessageCircleMore size={18} />
            WhatsApp
          </button>

          <button
            type="button"
            className="share-option"
            onClick={() =>
              openShareTarget(
                `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareTitle)}&url=${encodeURIComponent(shareUrl)}`,
              )
            }
          >
            <Send size={18} />
            X
          </button>

          <button
            type="button"
            className="share-option"
            onClick={() => openShareTarget(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`)}
          >
            <Share2 size={18} />
            Facebook
          </button>

          <button type="button" className="share-option" onClick={() => void copyLink()}>
            {copyState === 'copied' ? <Check size={18} /> : <Copy size={18} />}
            {copyState === 'copied' ? 'Copied link' : copyState === 'error' ? 'Copy failed' : 'Copy link'}
          </button>
        </div>
      </div>
    </div>
  ) : null

  const seo = (
    <Seo
      title={pageTitle}
      description={pageDescription}
      path={`/post/${slug}`}
      image={pageImage}
      noindex={!post}
      type="article"
      publishedTime={post?.created_at}
      modifiedTime={post?.updated_at ?? post?.created_at}
      author={SITE_NAME}
      section={post?.category ?? 'Blogs'}
      jsonLd={
        post
          ? {
              '@context': 'https://schema.org',
              '@type': 'NewsArticle',
              headline: post.title,
              description: pageDescription,
              datePublished: post.created_at,
              dateModified: post.updated_at ?? post.created_at,
              image: pageImage ? [buildAbsoluteUrl(pageImage)] : undefined,
              mainEntityOfPage: buildAbsoluteUrl(`/post/${post.slug}`),
              author: {
                '@type': 'Organization',
                name: SITE_NAME,
              },
              publisher: {
                '@type': 'Organization',
                name: SITE_NAME,
                logo: {
                  '@type': 'ImageObject',
                  url: buildAbsoluteUrl('/favicon.svg'),
                },
              },
            }
          : undefined
      }
    />
  )

  if (loading) {
    return (
      <>
        {seo}
        <div className="content-section">
          <div className="loading-post" />
        </div>
      </>
    )
  }

  if (error) {
    return (
      <>
        {seo}
        <EmptyState title="Could not load post" description={error} />
      </>
    )
  }

  if (!post) {
    return (
      <>
        {seo}
        <EmptyState
          icon={<Sparkles size={20} />}
          title="Post not found"
          description="The article may have been removed or is still unpublished."
          action={
            <Link to="/" className="primary-button">
              <ChevronLeft size={16} />
              Back home
            </Link>
          }
        />
      </>
    )
  }

  return (
    <article className="post-shell">
      {seo}
      {shareModal}
      <Link to="/" className="back-link">
        <ChevronLeft size={16} />
        Back to home
      </Link>

      <SectionHeading
        eyebrow="Article"
        title={post.title}
        description={post.excerpt || 'A full article from Ochibo Times.'}
      />

      <div className="post-meta-row">
        <span>
          <CalendarDays size={14} />
          {formatDate(post.created_at)}
        </span>
        <span>{post.status === 'published' || post.published ? 'Published' : 'Draft'}</span>
      </div>

      {post.featured_image ? (
        <img className="post-hero-image" src={post.featured_image} alt={post.title} />
      ) : null}

      <div className="post-body">{post.content}</div>

      <div className="post-share-row">
        <button type="button" className="primary-button" onClick={handleShareButton}>
          <Share2 size={16} />
          Share article
        </button>
        <button type="button" className="secondary-button" onClick={() => void handleNativeShare()}>
          <Share2 size={16} />
          Native share
        </button>
        <button type="button" className="secondary-button" onClick={scrollToTop}>
          <ChevronLeft size={16} className="back-to-top-icon" />
          Back to top
        </button>
      </div>
    </article>
  )
}
