import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { CalendarDays, ChevronLeft, Sparkles } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { BlogPost, PageView } from '../lib/types'
import { EmptyState, SectionHeading } from '../components/SiteLayout'
import {
  addCachedPageView,
  getCachedPosts,
  syncBlogPosts,
} from '../lib/cache'

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

  if (!slug) {
    return <Navigate to="/" replace />
  }

  if (loading) {
    return (
      <div className="content-section">
        <div className="loading-post" />
      </div>
    )
  }

  if (error) {
    return <EmptyState title="Could not load post" description={error} />
  }

  if (!post) {
    return (
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
    )
  }

  return (
    <article className="post-shell">
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
    </article>
  )
}
