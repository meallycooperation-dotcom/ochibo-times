import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Bookmark, CalendarDays, Eye, LogIn, PlusCircle, Sparkles } from 'lucide-react'
import { getCurrentSession } from '../lib/auth'
import { supabase } from '../lib/supabase'
import type { BlogPost, Book } from '../lib/types'
import {
  addCachedFavorite,
  getCachedBooks,
  getCachedPageViewCounts,
  getCachedPosts,
  removeCachedFavorite,
  syncBlogPosts,
  syncBooks,
  syncFavorites,
  syncPageViews,
} from '../lib/cache'
import { ArticleBadge, EmptyState, SectionHeading } from '../components/SiteLayout'
import { useSearchContext } from '../context/SearchContext'

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
  const [books, setBooks] = useState<Book[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { categoryFilter } = useSearchContext()

  useEffect(() => {
    let active = true

    async function checkAuthAndLoadPosts() {
      const currentSession = await getCurrentSession()
      if (!active) return

      setSession(currentSession)
      setLoading(true)

      await Promise.all([syncBlogPosts(), syncBooks()])

      let favoriteRows: { post_id: string }[] = []
      if (currentSession?.user?.id) {
        await syncPageViews()
        favoriteRows = (await syncFavorites(currentSession.user.id)) as { post_id: string }[]
      }

      if (!active) return

      const [cachedPosts, cachedBooks, cachedViews] = await Promise.all([
        getCachedPosts(),
        getCachedBooks(),
        getCachedPageViewCounts(),
      ])

      setPosts(cachedPosts)
      setBooks(cachedBooks)
      setViews(cachedViews)
      setFavorites(
        new Set(
          ((favoriteRows ?? []) as { post_id: string }[])
            .map((favorite) => favorite.post_id)
            .filter(Boolean),
        ),
      )
      setError(null)
      setLoading(false)
    }

    checkAuthAndLoadPosts().catch((loadError) => {
      if (!active) return
      setError(loadError instanceof Error ? loadError.message : 'Failed to load home content')
      setLoading(false)
    })

    return () => {
      active = false
    }
  }, [])

  async function toggleFavorite(postId: string) {
    if (!session?.user?.id) return

    const isFav = favorites.has(postId)
    if (isFav) {
      await supabase.from('favorites').delete().eq('user_id', session.user.id).eq('post_id', postId)
      await removeCachedFavorite(session.user.id, postId)
      setFavorites((prev) => {
        const next = new Set(prev)
        next.delete(postId)
        return next
      })
    } else {
      const { data, error: favoriteError } = await supabase
        .from('favorites')
        .insert({ user_id: session.user.id, post_id: postId })
        .select('id, user_id, post_id, created_at')
        .single()

      if (favoriteError) {
        setError(favoriteError.message)
        return
      }

      if (data) {
        await addCachedFavorite(data as { id: string; user_id: string; post_id: string; created_at?: string })
      }
      setFavorites((prev) => new Set(prev).add(postId))
    }
  }

  const visiblePosts = categoryFilter
    ? posts.filter((post) => (post.status === 'published' || post.published) && post.category === categoryFilter)
    : posts.filter((post) => post.status === 'published' || post.published)
  const featuredPost = visiblePosts[0]
  const isAuthenticated = session !== undefined && session !== null

  // Show loading state while checking auth
  if (session === undefined) {
    return (
      <div className="page-loading">
        <div className="loading-card" />
      </div>
    )
  }

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
              <strong>{visiblePosts.length.toString().padStart(2, '0')}</strong>
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
        ) : visiblePosts.length === 0 ? (
          <EmptyState
            icon={<Sparkles size={20} />}
            title="Nothing published yet"
            description="When you publish your first post in the dashboard, it will show up here."
          />
        ) : (
          <div className="article-grid">
            {visiblePosts.map((post) => (
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
                    void toggleFavorite(post.id)
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

      {books.length > 0 && (
        <section className="content-section">
          <SectionHeading
            eyebrow="Library"
            title="Books"
            description="Explore our collection of books."
          />
          <div className="article-grid">
            {books.map((book) => (
              <article key={book.id} className="article-card">
                {book.cover_image ? (
                  <img src={book.cover_image} alt={book.title} />
                ) : (
                  <div className="article-image-fallback" />
                )}
                <div className="article-card-body">
                  <h3>{book.title}</h3>
                  <p>{book.description || 'No description available.'}</p>
                  <Link to={`/book/${book.slug}`} className="text-link">
                    View book
                    <ArrowRight size={16} />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
