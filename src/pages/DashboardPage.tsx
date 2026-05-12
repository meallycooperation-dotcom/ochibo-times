import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import {
  BarChart3,
  FileText,
  LogOut,
  PencilLine,
  PlusCircle,
  Save,
  Settings2,
  Trash2,
  UserRound,
} from 'lucide-react'
import { SectionHeading, EmptyState } from '../components/SiteLayout'
import { getCurrentSession, getProfileById, isAdminSession } from '../lib/auth'
import { supabase } from '../lib/supabase'
import type { BlogPost, Profile } from '../lib/types'

type Tab = 'posts' | 'new-post' | 'analytics' | 'profile'

type PostFormState = {
  id: string
  title: string
  slug: string
  excerpt: string
  featured_image: string
  content: string
  published: boolean
}

const emptyPostForm: PostFormState = {
  id: '',
  title: '',
  slug: '',
  excerpt: '',
  featured_image: '',
  content: '',
  published: false,
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date))
}

export function DashboardPage() {
  const navigate = useNavigate()
  const [checking, setChecking] = useState(true)
  const [sessionUserId, setSessionUserId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('posts')
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [views, setViews] = useState<{ post_id: string | null }[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [postForm, setPostForm] = useState<PostFormState>(emptyPostForm)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [loadingPosts, setLoadingPosts] = useState(false)
  const [savingPost, setSavingPost] = useState(false)

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

      const admin = await isAdminSession(session)
      if (!admin) {
        navigate('/', { replace: true })
        return
      }

      const currentProfile = await getProfileById(session.user.id)

      if (!active) {
        return
      }

      setSessionUserId(session.user.id)
      setProfile(currentProfile)
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

  useEffect(() => {
    if (!checking) {
      void loadPosts()
      void loadAnalytics()
    }
  }, [checking])

  async function loadPosts() {
    setLoadingPosts(true)
    const { data, error } = await supabase
      .from('blog_posts')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      setStatusMessage(error.message)
      setPosts([])
    } else {
      setPosts((data as BlogPost[]) ?? [])
    }
    setLoadingPosts(false)
  }

  async function loadAnalytics() {
    const [postsResult, viewsResult] = await Promise.all([
      supabase.from('blog_posts').select('*').order('created_at', {
        ascending: false,
      }),
      supabase.from('page_views').select('post_id'),
    ])

    if (postsResult.error) {
      setStatusMessage(postsResult.error.message)
      return
    }

    if (viewsResult.error) {
      setStatusMessage(viewsResult.error.message)
      return
    }

    setPosts((postsResult.data as BlogPost[]) ?? [])
    setViews((viewsResult.data as { post_id: string | null }[]) ?? [])
  }

  const analytics = useMemo(() => {
    const counts = new Map<string, number>()
    views.forEach((view) => {
      if (!view.post_id) {
        return
      }
      counts.set(view.post_id, (counts.get(view.post_id) ?? 0) + 1)
    })

    return posts.map((post) => ({
      ...post,
      views: counts.get(post.id) ?? 0,
    }))
  }, [posts, views])

  function startNewPost() {
    setPostForm(emptyPostForm)
    setActiveTab('new-post')
    setStatusMessage(null)
  }

  function editPost(post: BlogPost) {
    setPostForm({
      id: post.id,
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt ?? '',
      featured_image: post.featured_image ?? '',
      content: post.content,
      published: post.published,
    })
    setActiveTab('new-post')
  }

  async function savePost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!sessionUserId) {
      return
    }

    setSavingPost(true)
    setStatusMessage(null)

    const payload = {
      title: postForm.title,
      slug: postForm.slug || slugify(postForm.title),
      content: postForm.content,
      excerpt: postForm.excerpt || null,
      featured_image: postForm.featured_image || null,
      published: postForm.published,
      author_id: sessionUserId,
    }

    const query = postForm.id
      ? supabase.from('blog_posts').update(payload).eq('id', postForm.id)
      : supabase.from('blog_posts').insert(payload)

    const { error } = await query

    if (error) {
      setStatusMessage(error.message)
    } else {
      setStatusMessage('Post saved successfully.')
      setPostForm(emptyPostForm)
      setActiveTab('posts')
      await loadPosts()
      await loadAnalytics()
    }

    setSavingPost(false)
  }

  async function removePost(id: string) {
    const confirmed = window.confirm('Delete this post?')
    if (!confirmed) {
      return
    }

    const { error } = await supabase.from('blog_posts').delete().eq('id', id)
    if (error) {
      setStatusMessage(error.message)
      return
    }

    await loadPosts()
    await loadAnalytics()
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!sessionUserId || !profile) {
      return
    }

    const { error } = await supabase.from('profiles').upsert({
      id: sessionUserId,
      name: profile.name,
      email: profile.email,
      role: profile.role,
      avatar_url: profile.avatar_url,
    })

    if (error) {
      setStatusMessage(error.message)
      return
    }

    setStatusMessage('Profile updated.')
  }

  async function signOut() {
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
    <div className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <div className="dashboard-brand">
          <strong>Ochibo</strong>
          <span>Admin studio</span>
        </div>

        <button className={activeTab === 'posts' ? 'sidebar-item active' : 'sidebar-item'} onClick={() => setActiveTab('posts')}>
          <FileText size={16} />
          Posts
        </button>
        <button className={activeTab === 'new-post' ? 'sidebar-item active' : 'sidebar-item'} onClick={startNewPost}>
          <PlusCircle size={16} />
          New post
        </button>
        <button className={activeTab === 'analytics' ? 'sidebar-item active' : 'sidebar-item'} onClick={() => setActiveTab('analytics')}>
          <BarChart3 size={16} />
          Analytics
        </button>
        <button className={activeTab === 'profile' ? 'sidebar-item active' : 'sidebar-item'} onClick={() => setActiveTab('profile')}>
          <UserRound size={16} />
          Profile
        </button>

        <button className="sidebar-item danger" onClick={signOut}>
          <LogOut size={16} />
          Logout
        </button>
      </aside>

      <main className="dashboard-main">
        <SectionHeading
          eyebrow="Dashboard"
          title="Manage posts, analytics, and profile details."
          description="This is the React version of the old admin pages."
        />

        {statusMessage ? <div className="form-message info">{statusMessage}</div> : null}

        {activeTab === 'posts' ? (
          <section className="panel">
            <div className="panel-header">
              <h2>All posts</h2>
              <button className="secondary-button" onClick={startNewPost}>
                <PlusCircle size={16} />
                New post
              </button>
            </div>

            {loadingPosts ? (
              <div className="loading-grid">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="loading-card" />
                ))}
              </div>
            ) : posts.length === 0 ? (
              <EmptyState
                title="No posts yet"
                description="Create your first article to get the blog rolling."
                action={
                  <button className="primary-button" onClick={startNewPost}>
                    <PlusCircle size={16} />
                    Create post
                  </button>
                }
              />
            ) : (
              <div className="dashboard-grid">
                {posts.map((post) => (
                  <article key={post.id} className="dashboard-card">
                    <div className="card-topline">
                      <span>{post.published ? 'Published' : 'Draft'}</span>
                      <span>{formatDate(post.created_at)}</span>
                    </div>
                    <h3>{post.title}</h3>
                    <p>{post.excerpt || post.content.slice(0, 140)}</p>
                    <div className="card-actions">
                      <button className="secondary-button small" onClick={() => editPost(post)}>
                        <PencilLine size={16} />
                        Edit
                      </button>
                      <button className="danger-button small" onClick={() => removePost(post.id)}>
                        <Trash2 size={16} />
                        Delete
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {activeTab === 'new-post' ? (
          <section className="panel">
            <div className="panel-header">
              <h2>{postForm.id ? 'Edit post' : 'Create new post'}</h2>
              <button className="secondary-button" onClick={() => setActiveTab('posts')}>
                Back to posts
              </button>
            </div>

            <form className="editor-form" onSubmit={savePost}>
              <label>
                Title
                <input
                  value={postForm.title}
                  onChange={(event) => {
                    const title = event.target.value
                    setPostForm((current) => ({
                      ...current,
                      title,
                      slug: current.slug || slugify(title),
                    }))
                  }}
                  required
                />
              </label>

              <label>
                Slug
                <input
                  value={postForm.slug}
                  onChange={(event) =>
                    setPostForm((current) => ({ ...current, slug: slugify(event.target.value) }))
                  }
                  placeholder="your-post-slug"
                  required
                />
              </label>

              <label>
                Excerpt
                <textarea
                  value={postForm.excerpt}
                  onChange={(event) => setPostForm((current) => ({ ...current, excerpt: event.target.value }))}
                  rows={3}
                />
              </label>

              <label>
                Featured image URL
                <input
                  value={postForm.featured_image}
                  onChange={(event) =>
                    setPostForm((current) => ({ ...current, featured_image: event.target.value }))
                  }
                />
              </label>

              <label>
                Content
                <textarea
                  value={postForm.content}
                  onChange={(event) => setPostForm((current) => ({ ...current, content: event.target.value }))}
                  rows={12}
                  required
                />
              </label>

              <label className="checkbox-line">
                <input
                  type="checkbox"
                  checked={postForm.published}
                  onChange={(event) =>
                    setPostForm((current) => ({ ...current, published: event.target.checked }))
                  }
                />
                Publish immediately
              </label>

              <div className="form-row">
                <button type="submit" className="primary-button" disabled={savingPost}>
                  <Save size={16} />
                  {savingPost ? 'Saving...' : 'Save post'}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setPostForm(emptyPostForm)}
                >
                  Reset
                </button>
              </div>
            </form>
          </section>
        ) : null}

        {activeTab === 'analytics' ? (
          <section className="panel">
            <div className="panel-header">
              <h2>Analytics</h2>
              <button className="secondary-button" onClick={loadAnalytics}>
                <Settings2 size={16} />
                Refresh
              </button>
            </div>

            <div className="analytics-strip">
              <div className="metric-card">
                <strong>{analytics.reduce((sum, post) => sum + post.views, 0)}</strong>
                <span>Total views</span>
              </div>
              <div className="metric-card">
                <strong>{posts.length}</strong>
                <span>Tracked posts</span>
              </div>
            </div>

            {analytics.length === 0 ? (
              <EmptyState title="No analytics yet" description="Publish a post and open it to collect views." />
            ) : (
              <div className="dashboard-grid">
                {analytics.map((post) => (
                  <article key={post.id} className="dashboard-card">
                    <div className="card-topline">
                      <span>{formatDate(post.created_at)}</span>
                      <span>{post.slug}</span>
                    </div>
                    <h3>{post.title}</h3>
                    <p>{post.views} views</p>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {activeTab === 'profile' ? (
          <section className="panel">
            <div className="panel-header">
              <h2>Profile</h2>
            </div>

            <form className="editor-form" onSubmit={saveProfile}>
              <label>
                Name
                <input
                  value={profile.name}
                  onChange={(event) => setProfile({ ...profile, name: event.target.value })}
                  required
                />
              </label>

              <label>
                Email
                <input value={profile.email} readOnly />
              </label>

              <label>
                Role
                <input value={profile.role} readOnly />
              </label>

              <label>
                Avatar URL
                <input
                  value={profile.avatar_url ?? ''}
                  onChange={(event) => setProfile({ ...profile, avatar_url: event.target.value })}
                />
              </label>

              <button type="submit" className="primary-button">
                <Save size={16} />
                Save profile
              </button>
            </form>
          </section>
        ) : null}
      </main>
    </div>
  )
}
