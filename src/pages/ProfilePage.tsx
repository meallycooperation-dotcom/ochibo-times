import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Bookmark, LogOut, Save, UserRound } from 'lucide-react'
import { SectionHeading } from '../components/SiteLayout'
import { getCurrentSession, getProfileById } from '../lib/auth'
import { supabase } from '../lib/supabase'
import type { BlogPost, Profile } from '../lib/types'

export function ProfilePage() {
  const navigate = useNavigate()
  const [checking, setChecking] = useState(true)
  const [sessionUserId, setSessionUserId] = useState<string | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [formData, setFormData] = useState<Profile | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [favorites, setFavorites] = useState<BlogPost[]>([])

  useEffect(() => {
    let active = true

    async function bootstrap() {
      const session = await getCurrentSession()

      if (!active) {
        return
      }

      if (!session?.user?.id) {
        navigate('/login', { replace: true })
        return
      }

      const currentProfile = await getProfileById(session.user.id)

      if (!active) {
        return
      }

      setSessionUserId(session.user.id)
      setProfile(currentProfile)
      setFormData(currentProfile)

      const { data: favData } = await supabase
        .from('favorites')
        .select('post_id')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })

      if (favData && favData.length > 0) {
        const postIds = favData.map((f) => f.post_id).filter(Boolean)
        const { data: postsData } = await supabase
          .from('blog_posts')
          .select('*')
          .in('id', postIds)
        if (postsData) {
          setFavorites(postsData as BlogPost[])
        }
      }

      setChecking(false)
    }

    bootstrap().catch((error) => {
      console.error(error)
      navigate('/login', { replace: true })
    })

    return () => {
      active = false
    }
  }, [navigate])

  async function handleSaveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!sessionUserId || !formData) {
      return
    }

    setIsSaving(true)
    setStatusMessage(null)

    try {
      const { error } = await supabase.from('profiles').upsert({
        id: sessionUserId,
        name: formData.name,
        email: formData.email,
        role: formData.role,
        avatar_url: formData.avatar_url,
      })

      if (error) {
        setStatusMessage(error.message)
      } else {
        setStatusMessage('Profile updated successfully.')
        setProfile(formData)
        setEditMode(false)
      }
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'An error occurred')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  if (checking) {
    return (
      <div className="dashboard-loading">
        <div className="loading-card" />
      </div>
    )
  }

  if (!profile) {
    return <Navigate to="/login" replace />
  }

  return (
    <div className="profile-shell">
      <SectionHeading
        title="Your Profile"
        description="View and manage your profile information."
      />

      {statusMessage ? <div className="form-message info">{statusMessage}</div> : null}

      <div className="profile-container">
        <section className="panel">
          <div className="panel-header">
            <h2>Profile Information</h2>
            {!editMode && (
              <button
                className="secondary-button"
                onClick={() => {
                  setFormData(profile)
                  setEditMode(true)
                }}
              >
                <UserRound size={16} />
                Edit profile
              </button>
            )}
          </div>

          {editMode && formData ? (
            <form className="editor-form" onSubmit={handleSaveProfile}>
              <label>
                Name
                <input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </label>

              <label>
                Email
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                />
              </label>

              <label>
                Avatar URL
                <input
                  type="url"
                  value={formData.avatar_url || ''}
                  onChange={(e) => setFormData({ ...formData, avatar_url: e.target.value })}
                  placeholder="https://..."
                />
              </label>

              <label>
                Role
                <input type="text" value={formData.role} disabled className="disabled-input" />
              </label>

              <div className="form-row">
                <button type="submit" className="primary-button" disabled={isSaving}>
                  <Save size={16} />
                  {isSaving ? 'Saving...' : 'Save changes'}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    setEditMode(false)
                    setFormData(profile)
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : profile ? (
            <div className="profile-info">
              <div className="info-row">
                <span className="label">Name</span>
                <span className="value">{profile.name}</span>
              </div>
              <div className="info-row">
                <span className="label">Email</span>
                <span className="value">{profile.email}</span>
              </div>
              {profile.avatar_url && (
                <div className="info-row">
                  <span className="label">Avatar</span>
                  <img src={profile.avatar_url} alt={profile.name} className="profile-avatar" />
                </div>
              )}
              <div className="info-row">
                <span className="label">Role</span>
                <span className="value role-badge">{profile.role}</span>
              </div>
              {profile.created_at && (
                <div className="info-row">
                  <span className="label">Member since</span>
                  <span className="value">
                    {new Intl.DateTimeFormat('en', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    }).format(new Date(profile.created_at))}
                  </span>
                </div>
              )}
            </div>
          ) : null}
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>
              <Bookmark size={20} />
              Saved Posts
            </h2>
          </div>
          {favorites.length === 0 ? (
            <p className="muted">No saved posts yet. Bookmark posts from articles to see them here.</p>
          ) : (
            <div className="favorites-grid">
              {favorites.map((post) => (
                <div key={post.id} className="favorite-card">
                  {post.featured_image ? (
                    <img src={post.featured_image} alt={post.title} />
                  ) : (
                    <div className="favorite-image-fallback" />
                  )}
                  <div className="favorite-card-body">
                    <h3>{post.title}</h3>
                    <Link to={`/post/${post.slug}`} className="primary-button">
                      Read
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel danger-section">
          <div className="panel-header">
            <h2>Sign Out</h2>
          </div>
          <p>Sign out of your account and return to the login page.</p>
          <button className="danger-button" onClick={handleSignOut}>
            <LogOut size={16} />
            Sign out
          </button>
        </section>
      </div>
    </div>
  )
}
