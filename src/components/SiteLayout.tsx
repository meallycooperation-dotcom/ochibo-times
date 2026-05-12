import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { ArrowRight, BookOpen, Home, LayoutDashboard, User } from 'lucide-react'
import { getCurrentSession, getProfileById } from '../lib/auth'

export function SiteLayout() {
  const [session, setSession] = useState<Awaited<ReturnType<typeof getCurrentSession>> | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [checking, setChecking] = useState(true)

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
