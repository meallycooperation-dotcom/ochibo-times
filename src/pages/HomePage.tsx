import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Bookmark, CalendarDays, Eye, LogIn, PlusCircle, Sparkles } from 'lucide-react'
import { getCurrentSession } from '../lib/auth'
import { supabase } from '../lib/supabase'
import type { BlogPost } from '../lib/types'
import { ArticleBadge, EmptyState, SectionHeading } from '../components/SiteLayout'

function formatDate(date: string) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date))
}

function estimateReadTime(content: string) {
  const words = content.trim().split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.ceil(words / 180))
}

export function HomePage() {
  const [session, setSession] = useState<Awaited<ReturnType<typeof getCurrentSession>> | null | undefined>(
    undefined,
  )
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [views, setViews] = useState<Record<string, number>>({})
  const [favorites, setFavorites] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function checkAuthAndLoadPosts() {
      const currentSession = await getCurrentSession()
      if (!active) return

      setSession(currentSession)

      if (currentSession?.user?.id) {
        const { data: favData } = await supabase
          .from('favorites')
          .select('post_id')
          .eq('user_id', currentSession.user.id)
        if (favData) {
          setFavorites(new Set(favData.map((f: { post_id: string }) => f.post_id)))
        }
      }

      setLoading(true)
      const { data, error: fetchError } = await supabase
        .from('blog_posts')
        .select('*')
        .eq('published', true)
        .order('created_at', { ascending: false })

      if (!active) return

      if (fetchError) {
        setError(fetchError.message)
        setPosts([])
        setViews({})
      } else {
        const postsData = (data as BlogPost[]) ?? []
        setPosts(postsData)
        setError(null)

        if (postsData.length > 0) {
          const postIds = postsData.map((post) => post.id)
          const { data: viewsData, error: viewsError } = await supabase
            .from('page_views')
            .select('post_id')
            .in('post_id', postIds)

          if (!viewsError && viewsData) {
            const counts: Record<string, number> = {}
            viewsData.forEach((view) => {
              if (view.post_id) {
                counts[view.post_id] = (counts[view.post_id] ?? 0) + 1
              }
            })
            setViews(counts)
          } else {
            setViews({})
          }
        } else {
          setViews({})
        }
      }

      setLoading(false)
    }

    checkAuthAndLoadPosts()

    return () => {
      active = false
    }
  }, [])

  async function toggleFavorite(postId: string) {
    if (!session?.user?.id) return

    const isFav = favorites.has(postId)
    if (isFav) {
      await supabase.from('favorites').delete().eq('user_id', session.user.id).eq('post_id', postId)
      setFavorites((prev) => {
        const next = new Set(prev)
        next.delete(postId)
        return next
      })
    } else {
      await supabase.from('favorites').insert({ user_id: session.user.id, post_id: postId })
      setFavorites((prev) => new Set(prev).add(postId))
    }
  }

  // Show loading state while checking auth
  if (session === undefined) {
    return (
      <div className="page-loading">
        <div className="loading-card" />
      </div>
    )
  }

  const featuredPost = posts[0]
  const isAuthenticated = session !== undefined && session !== null

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div className="hero-copy">
          {!isAuthenticated ? (
            <>
              <ArticleBadge>Fresh articles, reflections, and updates</ArticleBadge>
              <SectionHeading
                title="Welcome to Ochibo Times"
                description="Discover thoughtful stories and clean writing. Sign in or create an account to get started in bookmarking and adding your favourite reads to favourite and save them."
              />

              <div className="hero-actions">
                <Link to="/signup" className="primary-button">
                  <PlusCircle size={16} />
                  Create account
                </Link>
                <Link to="/login" className="secondary-button">
                  <LogIn size={16} />
                  Sign in
                </Link>
              </div>
            </>
          ) : null}

          <div className="hero-stats">
            <div>
              <strong>{posts.length.toString().padStart(2, '0')}</strong>
              <span>Published articles</span>
            </div>
          </div>
        </div>

        <div className="hero-spotlight">
          <div className="spotlight-card">
            <div className="spotlight-glow" />
            <p className="eyebrow">Featured</p>
            {featuredPost ? (
              <>
                <h2>{featuredPost.title}</h2>
                <p>{featuredPost.excerpt || featuredPost.content.slice(0, 140)}</p>
                <div className="meta-row">
                  <span>
                    <CalendarDays size={14} />
                    {formatDate(featuredPost.created_at)}
                  </span>
                  <span>
                    <Eye size={14} />
                    {views[featuredPost.id] ?? 0}
                  </span>
                  <span>{estimateReadTime(featuredPost.content)} min read</span>
                </div>
                <Link to={`/post/${featuredPost.slug}`} className="text-link">
                  Read featured post
                  <ArrowRight size={16} />
                </Link>
              </>
            ) : (
              <EmptyState
                icon={<Sparkles size={20} />}
                title="No articles yet"
                description="Publish your first article from the dashboard and it will appear here."
              />
            )}
          </div>
        </div>
      </section>

      <section className="content-section">
        <SectionHeading
          eyebrow="Latest"
          title="Recent articles"
          description="Open an article to read the full post."
        />

        {loading ? (
          <div className="loading-grid">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="loading-card" />
            ))}
          </div>
        ) : error ? (
          <EmptyState title="Could not load articles" description={error} />
        ) : posts.length === 0 ? (
          <EmptyState
            icon={<Sparkles size={20} />}
            title="Nothing published yet"
            description="When you publish your first post in the dashboard, it will show up here."
          />
        ) : (
          <div className="article-grid">
            {posts.map((post) => (
              <article key={post.id} className="article-card">
                {post.featured_image ? (
                  <img src={post.featured_image} alt={post.title} />
                ) : (
                  <div className="article-image-fallback" />
                )}
                <button
                  className={`bookmark-btn ${favorites.has(post.id) ? 'active' : ''} ${!session?.user?.id ? 'disabled' : ''}`}
                  onClick={() => {
                    if (!session?.user?.id) return
                    toggleFavorite(post.id)
                  }}
                  aria-label={favorites.has(post.id) ? 'Remove from favorites' : 'Add to favorites'}
                  disabled={!session?.user?.id}
                >
                  <Bookmark size={16} fill={favorites.has(post.id) ? 'currentColor' : 'none'} />
                </button>
                <div className="article-card-body">
                  <div className="meta-row">
                    <span>
                      <CalendarDays size={14} />
                      {formatDate(post.created_at)}
                    </span>
                    <span>
                      <Eye size={14} />
                      {views[post.id] ?? 0}
                    </span>
                    <span>{estimateReadTime(post.content)} min read</span>
                  </div>
                  <h3>{post.title}</h3>
                  <p>{post.excerpt || post.content.slice(0, 160)}</p>
                  <Link to={`/post/${post.slug}`} className="text-link">
                    Continue reading
                    <ArrowRight size={16} />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
