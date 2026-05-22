import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import {
  BarChart3,
  BookOpen,
  FileText,
  Home,
  MapPin,
  LogOut,
  PencilLine,
  PlusCircle,
  Save,
  Settings2,
  ShoppingBag,
  Trash2,
  UserRound,
} from 'lucide-react'
import { SectionHeading, EmptyState } from '../components/SiteLayout'
import { Seo } from '../components/Seo'
import { getCurrentSession, getProfileById, isAdminSession } from '../lib/auth'
import { supabase } from '../lib/supabase'
import type { BlogPost, Book, Draft, PostStatus, Profile } from '../lib/types'
import {
  getCachedPageViewCounts,
  getCachedPosts,
  getCachedBooks,
  getLatestCachedDraft,
  removeCachedBook,
  removeCachedPost,
  removeCachedDraft,
  replaceCachedChapters,
  saveCachedDraft,
  syncBlogPosts,
  syncBooks,
  syncPageViews,
  syncDrafts,
  upsertCachedPost,
} from '../lib/cache'
import { BooksEditor } from './BooksEditor'
import { LocationsPage } from './LocationsPage'
import { DraftsPage } from './DraftsPage'
import { ProductsPage } from './ProductsPage'
import { SentWorkPage } from './SentWorkPage'

type Tab =
  | 'posts'
  | 'new-post'
  | 'books'
  | 'new-book'
  | 'products'
  | 'locations'
  | 'analytics'
  | 'drafts'
  | 'sent-work'
  | 'profile'

type PostFormState = {
  id: string
  title: string
  slug: string
  excerpt: string
  featured_image: string
  content: string
  published: boolean
  status: PostStatus
  category: string
}

type DraftFormSnapshot = {
  slug: string
  content: string
  excerpt: string
  featured_image: string
  category: string
}

const emptyPostForm: PostFormState = {
  id: '',
  title: '',
  slug: '',
  excerpt: '',
  featured_image: '',
  content: '',
  published: false,
  status: 'pending',
  category: '',
}

function getPostStatus(post: BlogPost) {
  return post.status ?? (post.published ? 'published' : 'pending')
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

function parseDraftSnapshot(raw: string | null): DraftFormSnapshot {
  if (!raw) {
    return {
      slug: '',
      content: '',
      excerpt: '',
      featured_image: '',
      category: '',
    }
  }

  try {
    const parsed = JSON.parse(raw) as Partial<DraftFormSnapshot>
    return {
      slug: typeof parsed.slug === 'string' ? parsed.slug : '',
      content: typeof parsed.content === 'string' ? parsed.content : '',
      excerpt: typeof parsed.excerpt === 'string' ? parsed.excerpt : '',
      featured_image: typeof parsed.featured_image === 'string' ? parsed.featured_image : '',
      category: typeof parsed.category === 'string' ? parsed.category : '',
    }
  } catch {
    return {
      slug: '',
      content: raw,
      excerpt: '',
      featured_image: '',
      category: '',
    }
  }
}

function buildBlogDraftContent(form: PostFormState) {
  return JSON.stringify({
    slug: form.slug || slugify(form.title),
    content: form.content,
    excerpt: form.excerpt,
    featured_image: form.featured_image,
    category: form.category,
  })
}

export function DashboardPage() {
  const navigate = useNavigate()
  const [checking, setChecking] = useState(true)
  const [sessionUserId, setSessionUserId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('posts')
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [views, setViews] = useState<Record<string, number>>({})
  const [profile, setProfile] = useState<Profile | null>(null)
  const [postForm, setPostForm] = useState<PostFormState>(emptyPostForm)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [loadingPosts, setLoadingPosts] = useState(false)
  const [savingPost, setSavingPost] = useState(false)
  const [savingPostDraft, setSavingPostDraft] = useState(false)
  const [books, setBooks] = useState<Book[]>([])
  const [loadingBooks, setLoadingBooks] = useState(false)
  const [editingBook, setEditingBook] = useState<Book | null>(null)
  const [bookDraftSeed, setBookDraftSeed] = useState<Draft | null>(null)
  const [postDraftId, setPostDraftId] = useState<string | null>(null)
  const [postDraftOwnerId, setPostDraftOwnerId] = useState<string | null>(null)
  const [postDraftLoaded, setPostDraftLoaded] = useState(false)

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

  async function loadPosts() {
    setLoadingPosts(true)
    try {
      await syncBlogPosts()
      const cachedPosts = await getCachedPosts()
      setPosts(
        cachedPosts
          .filter((post) => post.author_id === sessionUserId)
          .sort((left, right) => right.created_at.localeCompare(left.created_at)),
      )
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Failed to load posts')
      setPosts([])
    }
    setLoadingPosts(false)
  }

  async function loadAnalytics() {
    try {
      await Promise.all([syncBlogPosts(), syncPageViews()])
      const [cachedPosts, viewCounts] = await Promise.all([getCachedPosts(), getCachedPageViewCounts()])
      setPosts(
        cachedPosts
          .filter((post) => post.author_id === sessionUserId)
          .sort((left, right) => right.created_at.localeCompare(left.created_at)),
      )
      setViews(viewCounts)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Failed to load analytics')
    }
  }

  async function loadBooks() {
    setLoadingBooks(true)
    try {
      await syncBooks()
      const cachedBooks = await getCachedBooks()
      setBooks(
        cachedBooks
          .filter((book) => book.author_id === sessionUserId)
          .sort((left, right) => right.created_at.localeCompare(left.created_at)),
      )
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Failed to load books')
      setBooks([])
    }
    setLoadingBooks(false)
  }

  useEffect(() => {
    if (checking || !sessionUserId) {
      return
    }

    let active = true

    async function bootstrapDashboardData() {
      setLoadingPosts(true)
      try {
        await syncBlogPosts()
        const cachedPosts = await getCachedPosts()
        if (!active) return
        setPosts(
          cachedPosts
            .filter((post) => post.author_id === sessionUserId)
            .sort((left, right) => right.created_at.localeCompare(left.created_at)),
        )
      } catch (error) {
        if (!active) return
        setStatusMessage(error instanceof Error ? error.message : 'Failed to load posts')
        setPosts([])
      } finally {
        if (active) {
          setLoadingPosts(false)
        }
      }

      try {
        await Promise.all([syncBlogPosts(), syncPageViews()])
        const [cachedPosts, viewCounts] = await Promise.all([getCachedPosts(), getCachedPageViewCounts()])
        if (!active) return
        setPosts(
          cachedPosts
            .filter((post) => post.author_id === sessionUserId)
            .sort((left, right) => right.created_at.localeCompare(left.created_at)),
        )
        setViews(viewCounts)
      } catch (error) {
        if (!active) return
        setStatusMessage(error instanceof Error ? error.message : 'Failed to load analytics')
      }
    }

    void bootstrapDashboardData()

    return () => {
      active = false
    }
  }, [checking, sessionUserId])

  useEffect(() => {
    if (activeTab !== 'new-post' || !sessionUserId || postForm.id || postDraftLoaded) {
      return
    }

    const userId = sessionUserId
    let active = true

    async function loadPostDraft() {
      try {
        await syncDrafts(userId)
        const draft = await getLatestCachedDraft(userId, 'blog')
        if (!active || !draft) {
          return
        }

        const snapshot = parseDraftSnapshot(draft.content)
        setPostDraftId(draft.id)
        setPostDraftOwnerId(userId)
        setPostDraftLoaded(true)
        setPostForm({
          id: '',
          title: draft.title,
          slug: snapshot.slug || slugify(draft.title),
          excerpt: draft.excerpt ?? snapshot.excerpt,
          featured_image: draft.cover_image ?? snapshot.featured_image,
          content: snapshot.content,
          published: false,
          status: 'pending',
          category: draft.category ?? snapshot.category,
        })
      } catch (error) {
        if (!active) {
          return
        }

        setStatusMessage(error instanceof Error ? error.message : 'Failed to load draft')
      }
    }

    void loadPostDraft()

    return () => {
      active = false
    }
  }, [activeTab, sessionUserId, postForm.id, postDraftLoaded])

  async function deleteBook(id: string) {
    const confirmed = window.confirm('Are you sure you want to delete this book?')
    if (!confirmed) return

    const { error } = await supabase.from('books').delete().eq('id', id)
    if (error) {
      setStatusMessage(error.message)
    } else {
      setBooks((prev) => prev.filter((b) => b.id !== id))
      await removeCachedBook(id)
      await replaceCachedChapters(id, [])
    }
  }

  const analytics = useMemo(() => {
    return posts.map((post) => ({
      ...post,
      views: views[post.id] ?? 0,
    }))
  }, [posts, views])
  const isSuperAdmin = profile?.role === 'super-admin'

  function startNewPost() {
    setPostForm(emptyPostForm)
    setPostDraftId(null)
    setPostDraftOwnerId(null)
    setPostDraftLoaded(false)
    setBookDraftSeed(null)
    setActiveTab('new-post')
    setStatusMessage(null)
  }

  function editPost(post: BlogPost) {
    const postStatus = getPostStatus(post)
    if (postStatus === 'published' && !isSuperAdmin) {
      setStatusMessage('Published posts can only be edited by a super-admin.')
      return
    }

    setPostForm({
      id: post.id,
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt ?? '',
      featured_image: post.featured_image ?? '',
      content: post.content,
      published: post.published,
      status: postStatus,
      category: post.category ?? '',
    })
    setPostDraftId(null)
    setPostDraftOwnerId(null)
    setPostDraftLoaded(true)
    setBookDraftSeed(null)
    setActiveTab('new-post')
  }

  function startNewBook() {
    setEditingBook(null)
    setBookDraftSeed(null)
    setActiveTab('new-book')
    setStatusMessage(null)
  }

  function editBook(book: Book) {
    setEditingBook(book)
    setBookDraftSeed(null)
    setActiveTab('new-book')
  }

  function openDraft(draft: Draft) {
    setStatusMessage(null)
    if (draft.type === 'blog') {
      const snapshot = parseDraftSnapshot(draft.content)
      setPostForm({
        id: '',
        title: draft.title,
        slug: snapshot.slug || slugify(draft.title),
        excerpt: draft.excerpt ?? snapshot.excerpt,
        featured_image: draft.cover_image ?? snapshot.featured_image,
        content: snapshot.content,
        published: false,
        status: 'pending',
        category: draft.category ?? snapshot.category,
      })
      setEditingBook(null)
      setBookDraftSeed(null)
      setPostDraftId(draft.id)
      setPostDraftOwnerId(draft.user_id)
      setPostDraftLoaded(true)
      setActiveTab('new-post')
      return
    }

    setPostDraftId(null)
    setPostDraftOwnerId(null)
    setPostDraftLoaded(false)
    setEditingBook(null)
    setBookDraftSeed(draft)
    setActiveTab('new-book')
  }

  async function clearPostDraft() {
    const ownerId = postDraftOwnerId ?? sessionUserId
    if (!ownerId || !postDraftId) {
      return
    }

    await supabase.from('drafts').delete().eq('id', postDraftId).eq('user_id', ownerId)
    await removeCachedDraft(ownerId, postDraftId)
    setPostDraftId(null)
    setPostDraftOwnerId(null)
  }

  async function savePostDraft() {
    const ownerId = postDraftOwnerId ?? sessionUserId
    if (!ownerId || !postForm.title.trim()) {
      setStatusMessage('Draft title is required.')
      return
    }

    setSavingPostDraft(true)
    setStatusMessage(null)

    const now = new Date().toISOString()
    const draftRecord: Draft = {
      id: postDraftId ?? crypto.randomUUID(),
      user_id: ownerId,
      type: 'blog',
      title: postForm.title.trim(),
      content: buildBlogDraftContent(postForm),
      excerpt: postForm.excerpt || null,
      cover_image: postForm.featured_image || null,
      chapter_title: null,
      chapter_number: null,
      category: postForm.category || null,
      source_id: postForm.id || null,
      last_saved_at: now,
      is_ready: false,
      created_at: now,
      updated_at: now,
    }

    const { data, error } = await supabase.from('drafts').upsert(draftRecord).select('*').single()
    if (error) {
      setStatusMessage(error.message)
      setSavingPostDraft(false)
      return
    }

    await saveCachedDraft(data as Draft)
    setPostDraftId((data as Draft).id)
    setPostDraftOwnerId(ownerId)
    setPostDraftLoaded(true)
    setStatusMessage('Draft saved.')
    setSavingPostDraft(false)
  }

  async function savePost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!sessionUserId) {
      return
    }

    setSavingPost(true)
    setStatusMessage(null)

    const nextStatus: PostStatus = postForm.id
      ? isSuperAdmin
        ? 'published'
        : postForm.status
      : 'pending'
    const payload = {
      title: postForm.title,
      slug: postForm.slug || slugify(postForm.title),
      content: postForm.content,
      excerpt: postForm.excerpt || null,
      featured_image: postForm.featured_image || null,
      category: postForm.category || null,
      status: nextStatus,
      published: nextStatus === 'published',
      author_id: sessionUserId,
    }

    const query = postForm.id
      ? supabase.from('blog_posts').update(payload).eq('id', postForm.id)
      : supabase.from('blog_posts').insert(payload)

    const { error } = await query

    if (error) {
      setStatusMessage(error.message)
    } else {
      const cachedPost: BlogPost = {
        id: postForm.id || crypto.randomUUID(),
        title: payload.title,
        slug: payload.slug,
        content: payload.content,
        excerpt: payload.excerpt,
        featured_image: payload.featured_image,
        category: payload.category,
        published: payload.published,
        status: payload.status,
        author_id: payload.author_id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      await upsertCachedPost(cachedPost)
      await clearPostDraft()
      setStatusMessage('Post saved successfully.')
      setPostForm(emptyPostForm)
      setPostDraftId(null)
      setPostDraftOwnerId(null)
      setPostDraftLoaded(false)
      setBookDraftSeed(null)
      setActiveTab('posts')
      await loadPosts()
      await loadAnalytics()
    }

    setSavingPost(false)
    setSavingPostDraft(false)
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

    await removeCachedPost(id)
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
      <Seo title="Dashboard" description="Ochibo Times admin dashboard." noindex />
      <aside className="dashboard-sidebar">
        <div className="dashboard-brand">
          <strong>Ochibo</strong>
          <span>Admin studio</span>
        </div>

        <button className="sidebar-item" onClick={() => navigate('/')}>
          <Home size={16} />
          Home
        </button>

        <button className={activeTab === 'posts' ? 'sidebar-item active' : 'sidebar-item'} onClick={() => setActiveTab('posts')}>
          <FileText size={16} />
          Posts
        </button>
        <button className={activeTab === 'new-post' ? 'sidebar-item active' : 'sidebar-item'} onClick={startNewPost}>
          <PlusCircle size={16} />
          New post
        </button>
        <button className={activeTab === 'books' ? 'sidebar-item active' : 'sidebar-item'} onClick={() => { setActiveTab('books'); void loadBooks() }}>
          <BookOpen size={16} />
          Books
        </button>
        <button className={activeTab === 'new-book' ? 'sidebar-item active' : 'sidebar-item'} onClick={() => { setActiveTab('new-book'); setStatusMessage(null) }}>
          <PlusCircle size={16} />
          New book
        </button>
        <button className={activeTab === 'products' ? 'sidebar-item active' : 'sidebar-item'} onClick={() => setActiveTab('products')}>
          <ShoppingBag size={16} />
          Products
        </button>
        <button className={activeTab === 'locations' ? 'sidebar-item active' : 'sidebar-item'} onClick={() => setActiveTab('locations')}>
          <MapPin size={16} />
          Locations
        </button>
        <button className={activeTab === 'analytics' ? 'sidebar-item active' : 'sidebar-item'} onClick={() => setActiveTab('analytics')}>
          <BarChart3 size={16} />
          Analytics
        </button>
        {isSuperAdmin ? (
          <button className={activeTab === 'sent-work' ? 'sidebar-item active' : 'sidebar-item'} onClick={() => setActiveTab('sent-work')}>
            <FileText size={16} />
            Sent work
          </button>
        ) : null}
        <button className={activeTab === 'drafts' ? 'sidebar-item active' : 'sidebar-item'} onClick={() => setActiveTab('drafts')}>
          <FileText size={16} />
          Drafts
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
                      <span>
                        {getPostStatus(post).charAt(0).toUpperCase() + getPostStatus(post).slice(1)}
                      </span>
                      <span>{formatDate(post.created_at)}</span>
                    </div>
                    <h3>{post.title}</h3>
                    <p>{post.excerpt || post.content.slice(0, 140)}</p>
                    <div className="card-actions">
                      <button
                        className="secondary-button small"
                        onClick={() => editPost(post)}
                        disabled={getPostStatus(post) === 'published' && !isSuperAdmin}
                      >
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
              <h2>{postForm.id && isSuperAdmin ? 'Review post' : postForm.id ? 'Edit post' : 'Create new post'}</h2>
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
                Category
                <select
                  value={postForm.category}
                  onChange={(event) =>
                    setPostForm((current) => ({ ...current, category: event.target.value }))
                  }
                >
                  <option value="">Select a category</option>
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

              <div className="form-row">
                <button type="submit" className="primary-button" disabled={savingPost}>
                  <Save size={16} />
                  {savingPost
                    ? 'Saving...'
                    : postForm.id && isSuperAdmin && postForm.status !== 'published'
                      ? 'Publish post'
                      : 'Save post'}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    void savePostDraft()
                  }}
                  disabled={savingPostDraft}
                >
                  <Save size={16} />
                  {savingPostDraft ? 'Saving draft...' : 'Save draft'}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    setPostForm(emptyPostForm)
                    setPostDraftId(null)
                    setPostDraftLoaded(true)
                  }}
                >
                  Reset
                </button>
              </div>
            </form>
          </section>
        ) : null}

        {activeTab === 'books' ? (
          <section className="panel">
            <div className="panel-header">
              <h2>Books</h2>
              <button className="primary-button" onClick={startNewBook}>
                <PlusCircle size={16} />
                New book
              </button>
            </div>

            {loadingBooks ? (
              <div className="dashboard-loading">
                <div className="loading-card" />
              </div>
            ) : books.length === 0 ? (
              <EmptyState
                title="No books yet"
                description="Create your first book to get started."
                action={
                  <button className="primary-button" onClick={startNewBook}>
                    <PlusCircle size={16} />
                    Create book
                  </button>
                }
              />
            ) : (
              <div className="dashboard-grid">
                {books.map((book) => (
                  <article key={book.id} className="dashboard-card">
                    <div className="card-topline">
                      <span>{book.published ? 'Published' : 'Draft'}</span>
                      <span>{formatDate(book.created_at)}</span>
                    </div>
                    {book.cover_image && (
                      <img src={book.cover_image} alt={book.title} className="dashboard-card-thumb" />
                    )}
                    <h3>{book.title}</h3>
                    <p>{book.description || 'No description'}</p>
                    <div className="card-actions">
                      <button className="secondary-button small" onClick={() => editBook(book)}>
                        <PencilLine size={16} />
                        Edit
                      </button>
                      <button className="danger-button small" onClick={() => deleteBook(book.id)}>
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

        {activeTab === 'new-book' ? (
          <BooksEditor
            sessionUserId={sessionUserId}
            editingBook={editingBook}
            draftSeed={bookDraftSeed}
            onDraftConsumed={() => setBookDraftSeed(null)}
            onSave={() => {
              setActiveTab('books')
              setEditingBook(null)
              setBookDraftSeed(null)
            }}
          />
        ) : null}

        {activeTab === 'products' ? <ProductsPage /> : null}

        {activeTab === 'locations' ? <LocationsPage sessionUserId={sessionUserId} /> : null}

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

        {activeTab === 'sent-work' && isSuperAdmin ? (
          <SentWorkPage
            sessionUserId={sessionUserId}
            onReviewPost={editPost}
            onPublished={async () => {
              await loadPosts()
              await loadBooks()
              await loadAnalytics()
            }}
          />
        ) : null}

        {activeTab === 'drafts' ? (
          <DraftsPage sessionUserId={sessionUserId} onOpenDraft={openDraft} />
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
