import type { ReactNode } from 'react'
import { useEffect, useState, useRef } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { ArrowRight, BookOpen, Home, LayoutDashboard, Search, User, X } from 'lucide-react'
import { getCurrentSession, getProfileById } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { useSearchContext } from '../context/SearchContext'

type SearchResult = {
  id: string
  type: 'post' | 'book'
  title: string
  slug: string
  image: string | null
  description: string | null
}

function sanitizeSearch(input: string): string {
  return input
    .trim()
    .replace(/[<>"'%;()&+]/g, '')
    .slice(0, 100)
}

export function SiteLayout() {
  const navigate = useNavigate()
  const [session, setSession] = useState<Awaited<ReturnType<typeof getCurrentSession>> | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [checking, setChecking] = useState(true)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const { categoryFilter, setCategoryFilter } = useSearchContext()

  useEffect(() => {
    let active = true

    async function checkAuth() {
      const currentSession = await getCurrentSession()
      if (!active) return

      setSession(currentSession)

      if (currentSession?.user?.id) {
        const userProfile = await getProfileById(currentSession.user.id)
        if (!active) return

        setIsAdmin(userProfile?.role === 'admin')
      }

      setChecking(false)
    }

    checkAuth()

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (searchOpen && searchInputRef.current) {
      searchInputRef.current.focus()
    }
  }, [searchOpen])

  async function handleSearch(query: string) {
    const sanitized = sanitizeSearch(query)
    if (sanitized.length < 2) {
      setSearchResults([])
      return
    }

    setSearching(true)
    const searchTerm = `%${sanitized}%`

    const [postsResult, booksResult] = await Promise.all([
      supabase
        .from('blog_posts')
        .select('id, title, slug, featured_image, excerpt')
        .eq('published', true)
        .or(`title.ilike.${searchTerm},excerpt.ilike.${searchTerm},content.ilike.${searchTerm}`),
      supabase
        .from('books')
        .select('id, title, slug, cover_image, description')
        .eq('published', true)
        .or(`title.ilike.${searchTerm},description.ilike.${searchTerm}`),
    ])

    const results: SearchResult[] = []

    if (postsResult.data) {
      postsResult.data.forEach((post) => {
        if (post.id && post.title && post.slug) {
          results.push({
            id: post.id,
            type: 'post',
            title: post.title,
            slug: post.slug,
            image: post.featured_image ?? null,
            description: post.excerpt ?? null,
          })
        }
      })
    }

    if (booksResult.data) {
      booksResult.data.forEach((book) => {
        if (book.id && book.title && book.slug) {
          results.push({
            id: book.id,
            type: 'book',
            title: book.title,
            slug: book.slug,
            image: book.cover_image ?? null,
            description: book.description ?? null,
          })
        }
      })
    }

    setSearchResults(results)
    setSearching(false)
  }

  function handleResultClick(result: SearchResult) {
    setSearchOpen(false)
    setSearchQuery('')
    setSearchResults([])
    if (result.type === 'post') {
      navigate(`/post/${result.slug}`)
    } else {
      navigate(`/book/${result.slug}`)
    }
  }

  function closeSearch() {
    setSearchOpen(false)
    setSearchQuery('')
    setSearchResults([])
  }

  return (
    <div className="site-shell">
      <header className="site-header">
        <div className="brand-lockup">
          <Link to="/" className="brand-mark">
            Ochibo Times
          </Link>
          <p className="brand-tag">Stories, reflections, and fresh articles.</p>
        </div>

        <nav className="site-nav">
          <NavLink to="/" end>
            <Home size={16} />
            Home
          </NavLink>
          <button className="nav-search-btn" onClick={() => setSearchOpen(true)} aria-label="Search">
            <Search size={16} />
            Search
          </button>
          {!checking && !session ? (
            <>
              <NavLink to="/signup">Signup</NavLink>
              <NavLink to="/login">Login</NavLink>
            </>
          ) : null}
          {!checking && session ? (
            <>
              <NavLink to="/profile">
                <User size={16} />
                Profile
              </NavLink>
              {isAdmin && (
                <NavLink to="/dashboard" className="dashboard-link">
                  <LayoutDashboard size={16} />
                  Dashboard
                </NavLink>
              )}
            </>
          ) : null}
        </nav>

        <select
          className="category-filter"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="">All</option>
          <option value="Blogs">Blogs</option>
          <option value="Entertainment">Entertainment</option>
          <option value="Events">Events</option>
          <option value="Leaks">Leaks</option>
          <option value="Tech">Tech</option>
          <option value="Music">Music</option>
          <option value="Clout">Clout</option>
          <option value="Film">Film</option>
          <option value="News">News</option>
          <option value="Sports">Sports</option>
          <option value="Investigations">Investigations</option>
          <option value="Hustle">Hustle</option>
        </select>

        {searchOpen && (
          <div className="search-overlay" onClick={closeSearch}>
            <div className="search-modal" onClick={(e) => e.stopPropagation()}>
              <div className="search-header">
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search posts and books..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    void handleSearch(e.target.value)
                  }}
                  className="search-input"
                />
                <button className="search-close" onClick={closeSearch} aria-label="Close search">
                  <X size={20} />
                </button>
              </div>

              {searching && <p className="search-status">Searching...</p>}

              {searchResults.length > 0 ? (
                <div className="search-results">
                  {searchResults.map((result) => (
                    <button
                      key={`${result.type}-${result.id}`}
                      className="search-result-item"
                      onClick={() => handleResultClick(result)}
                    >
                      {result.image && (
                        <img src={result.image} alt="" className="search-result-image" />
                      )}
                      <div className="search-result-info">
                        <span className="search-result-type">{result.type}</span>
                        <span className="search-result-title">{result.title}</span>
                        {result.description && (
                          <span className="search-result-desc">{result.description.slice(0, 80)}...</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              ) : searchQuery.length >= 2 && !searching ? (
                <p className="search-status">No results found for "{searchQuery}"</p>
              ) : null}
            </div>
          </div>
        )}
      </header>

      <main className="site-main">
        <Outlet />
      </main>

      <footer className="site-footer">
        <div>
          <strong>Ochibo Times</strong>
        </div>
        {!checking && !session ? (
          <Link to="/signup" className="footer-cta">
            Create an account
            <ArrowRight size={16} />
          </Link>
        ) : null}
      </footer>
    </div>
  )
}

export function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string
  title: string
  description?: string
}) {
  return (
    <div className="section-heading">
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      <h1>{title}</h1>
      {description ? <p>{description}</p> : null}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="empty-state">
      {icon ? <div className="empty-icon">{icon}</div> : null}
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
      {action ? <div className="empty-action">{action}</div> : null}
    </div>
  )
}

export function ArticleBadge({ children }: { children: ReactNode }) {
  return (
    <span className="article-badge">
      <BookOpen size={14} />
      {children}
    </span>
  )
}
