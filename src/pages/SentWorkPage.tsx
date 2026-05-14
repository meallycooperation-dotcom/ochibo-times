import { useCallback, useEffect, useState } from 'react'
import { BadgeCheck, FileText, RefreshCw, Send, Trash2, UserRound } from 'lucide-react'
import { EmptyState } from '../components/SiteLayout'
import { supabase } from '../lib/supabase'
import type { BlogPost, Profile } from '../lib/types'
import { getCachedPosts, syncBlogPosts, upsertCachedPost } from '../lib/cache'

/* eslint-disable react-hooks/set-state-in-effect */

type PostPreview = {
  title: string
  subtitle: string
  summary: string
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date))
}

function buildPreview(post: BlogPost, author?: Profile): PostPreview {
  return {
    title: post.title,
    subtitle: author ? `${author.name} - ${author.email}` : 'Admin submission',
    summary: post.excerpt || post.content.slice(0, 180) || 'Pending post',
  }
}

interface SentWorkPageProps {
  sessionUserId: string | null
  onReviewPost: (post: BlogPost) => void
  onPublished: () => void
}

export function SentWorkPage({ sessionUserId, onReviewPost, onPublished }: SentWorkPageProps) {
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [profiles, setProfiles] = useState<Record<string, Profile>>({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [busyPostId, setBusyPostId] = useState<string | null>(null)

  const loadSentWork = useCallback(async () => {
    setRefreshing(true)
    try {
      await syncBlogPosts()
      const [cachedPosts, profilesResult] = await Promise.all([
        getCachedPosts(),
        supabase.from('profiles').select('id, name, email, role, avatar_url, created_at'),
      ])

      if (profilesResult.error) {
        throw profilesResult.error
      }

      const profileMap: Record<string, Profile> = {}
      ;(profilesResult.data as Profile[] | null | undefined)?.forEach((profile) => {
        profileMap[profile.id] = profile
      })

      const reviewQueue = cachedPosts
        .filter((post) => (post.status ?? (post.published ? 'published' : 'pending')) === 'pending')
        .filter((post) => post.author_id !== sessionUserId)
        .filter((post) => profileMap[post.author_id ?? '']?.role === 'admin')
        .sort((left, right) =>
          (right.updated_at ?? right.created_at).localeCompare(left.updated_at ?? left.created_at),
        )

      setProfiles(profileMap)
      setPosts(reviewQueue)
      setMessage(null)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load sent work')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [sessionUserId])

  useEffect(() => {
    void loadSentWork()
  }, [loadSentWork])

  async function setPostStatus(post: BlogPost, status: 'published' | 'rejected') {
    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('blog_posts')
      .update({
        status,
        published: status === 'published',
        updated_at: now,
      })
      .eq('id', post.id)
      .select('*')
      .single()

    if (error) {
      throw error
    }

    await upsertCachedPost((data as BlogPost) ?? { ...post, status, published: status === 'published', updated_at: now })
  }

  async function publishPost(post: BlogPost) {
    setBusyPostId(post.id)
    try {
      await setPostStatus(post, 'published')
      setPosts((current) => current.filter((entry) => entry.id !== post.id))
      setMessage('Post published successfully.')
      onPublished()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to publish post')
    } finally {
      setBusyPostId(null)
    }
  }

  async function rejectPost(post: BlogPost) {
    const confirmed = window.confirm('Reject this post? It will be marked as rejected.')
    if (!confirmed) {
      return
    }

    setBusyPostId(post.id)
    try {
      await setPostStatus(post, 'rejected')
      setPosts((current) => current.filter((entry) => entry.id !== post.id))
      setMessage('Post rejected.')
      onPublished()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to reject post')
    } finally {
      setBusyPostId(null)
    }
  }

  if (loading) {
    return (
      <section className="panel">
        <div className="dashboard-loading">
          <div className="loading-card" />
        </div>
      </section>
    )
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Sent work</h2>
        <button className="secondary-button" onClick={() => void loadSentWork()} disabled={refreshing}>
          <RefreshCw size={16} />
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {message ? <div className="form-message info">{message}</div> : null}

      {posts.length === 0 ? (
        <EmptyState
          icon={<Send size={20} />}
          title="No work waiting for review"
          description="When admins save a story, it will appear here as pending for super-admin review."
        />
      ) : (
        <div className="dashboard-grid">
          {posts.map((post) => {
            const author = profiles[post.author_id ?? '']
            const preview = buildPreview(post, author)

            return (
              <article key={post.id} className="dashboard-card">
                <div className="card-topline">
                  <span>Pending story</span>
                  <span>{formatDate(post.updated_at || post.created_at)}</span>
                </div>
                <h3>{preview.title}</h3>
                <p>{preview.summary}</p>
                <div className="card-topline" style={{ marginTop: '0.75rem' }}>
                  <span>
                    <UserRound size={14} />
                    {preview.subtitle}
                  </span>
                  <span className="role-badge">
                    <BadgeCheck size={14} />
                    Review
                  </span>
                </div>
                <div className="card-actions">
                  <button className="secondary-button small" onClick={() => onReviewPost(post)}>
                    <FileText size={16} />
                    Review
                  </button>
                  <button
                    className="primary-button small"
                    onClick={() => void publishPost(post)}
                    disabled={busyPostId === post.id}
                  >
                    <Send size={16} />
                    {busyPostId === post.id ? 'Publishing...' : 'Publish'}
                  </button>
                  <button
                    className="danger-button small"
                    onClick={() => void rejectPost(post)}
                    disabled={busyPostId === post.id}
                  >
                    <Trash2 size={16} />
                    Reject
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
