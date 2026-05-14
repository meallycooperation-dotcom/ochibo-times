import Dexie, { type Table } from 'dexie'
import { supabase } from './supabase'
import type { BlogPost, Book, BookChapter, Draft, DraftType, PageView, Profile } from './types'

type SyncMeta = {
  key: string
  fingerprint: string
  syncedAt: string
}

type FavoriteRecord = {
  id: string
  user_id: string
  post_id: string
  created_at?: string
}

class OchiboCacheDatabase extends Dexie {
  blogPosts!: Table<BlogPost, string>
  books!: Table<Book, string>
  bookChapters!: Table<BookChapter, string>
  profiles!: Table<Profile, string>
  drafts!: Table<Draft, string>
  favorites!: Table<FavoriteRecord, string>
  pageViews!: Table<PageView, string>
  syncMeta!: Table<SyncMeta, string>

  constructor() {
    super('ochibo-times-cache')

    this.version(1).stores({
      blogPosts: 'id, slug, published, author_id, category, created_at, updated_at',
      books: 'id, slug, published, author_id, created_at, updated_at',
      bookChapters: 'id, book_id, chapter_number, created_at, updated_at',
      profiles: 'id, email, role, created_at',
    })

    this.version(2).stores({
      blogPosts: 'id, slug, published, author_id, category, created_at, updated_at',
      books: 'id, slug, published, author_id, created_at, updated_at',
      bookChapters: 'id, book_id, chapter_number, created_at, updated_at',
      profiles: 'id, email, role, created_at',
      drafts: 'id, user_id, type, source_id, last_saved_at, updated_at, created_at',
      favorites: 'id, user_id, post_id, created_at',
      pageViews: 'id, post_id, viewed_at',
      syncMeta: 'key, fingerprint, syncedAt',
    })
  }
}

const db = new OchiboCacheDatabase()

const inFlight = new Map<string, Promise<unknown>>()

function runOnce<T>(key: string, loader: () => Promise<T>) {
  const existing = inFlight.get(key)
  if (existing) {
    return existing as Promise<T>
  }

  const task = loader().finally(() => {
    inFlight.delete(key)
  })
  inFlight.set(key, task)
  return task
}

function fingerprintRows(rows: Record<string, unknown>[], fields: string[]) {
  return rows
    .slice()
    .sort((left, right) => String(left.id ?? '').localeCompare(String(right.id ?? '')))
    .map((row) =>
      fields
        .map((field) => {
          const value = row[field]
          return value == null ? '' : String(value)
        })
        .join('|'),
    )
    .join('::')
}

function draftFingerprint(drafts: Draft[]) {
  return fingerprintRows(
    drafts as unknown as Record<string, unknown>[],
    ['id', 'user_id', 'type', 'title', 'source_id', 'updated_at', 'last_saved_at', 'is_ready'],
  )
}

async function syncCollection<T extends { id: string }>(params: {
  key: string
  readCache: () => Promise<T[]>
  readRemote: () => Promise<T[]>
  readFingerprint: () => Promise<string>
  writeCache: (rows: T[]) => Promise<void>
}) {
  return runOnce(params.key, async () => {
    const [cachedRows, cachedMeta, remoteFingerprint] = await Promise.all([
      params.readCache(),
      db.syncMeta.get(params.key),
      params.readFingerprint().catch(() => ''),
    ])

    if (cachedRows.length > 0 && cachedMeta?.fingerprint === remoteFingerprint) {
      return cachedRows
    }

    try {
      const remoteRows = await params.readRemote()
      await params.writeCache(remoteRows)
      await db.syncMeta.put({
        key: params.key,
        fingerprint: remoteFingerprint,
        syncedAt: new Date().toISOString(),
      })
      return remoteRows
    } catch (error) {
      if (cachedRows.length > 0) {
        return cachedRows
      }

      throw error
    }
  })
}

async function cacheAll<T>(table: Table<T, string>, rows: T[]) {
  await table.clear()
  if (rows.length > 0) {
    await table.bulkPut(rows)
  }
}

export async function warmContentCache() {
  await Promise.all([syncBlogPosts(), syncBooks()])
}

export async function syncBlogPosts() {
  return syncCollection<BlogPost>({
    key: 'blogPosts',
    readCache: () => db.blogPosts.toArray(),
    readFingerprint: async () => {
      const { data, error } = await supabase
        .from('blog_posts')
        .select('id, status, published, updated_at, created_at')

      if (error) throw error

      return fingerprintRows((data as Record<string, unknown>[]) ?? [], [
        'id',
        'status',
        'published',
        'updated_at',
        'created_at',
      ])
    },
    readRemote: async () => {
      const { data, error } = await supabase.from('blog_posts').select('*')
      if (error) throw error
      return ((data as BlogPost[]) ?? []).slice()
    },
    writeCache: async (rows) => {
      await cacheAll(db.blogPosts, rows)
    },
  })
}

export async function syncBooks() {
  return syncCollection<Book>({
    key: 'books',
    readCache: () => db.books.toArray(),
    readFingerprint: async () => {
      const { data, error } = await supabase
        .from('books')
        .select('id, updated_at, created_at')

      if (error) throw error

      return fingerprintRows((data as Record<string, unknown>[]) ?? [], ['id', 'updated_at', 'created_at'])
    },
    readRemote: async () => {
      const { data, error } = await supabase.from('books').select('*')
      if (error) throw error
      return ((data as Book[]) ?? []).slice()
    },
    writeCache: async (rows) => {
      await cacheAll(db.books, rows)
    },
  })
}

export async function syncBookChapters() {
  return syncCollection<BookChapter>({
    key: 'bookChapters',
    readCache: () => db.bookChapters.toArray(),
    readFingerprint: async () => {
      const { data, error } = await supabase
        .from('book_chapters')
        .select('id, book_id, chapter_number, audio_url, updated_at, created_at')

      if (error) throw error

      return fingerprintRows(
        (data as Record<string, unknown>[]) ?? [],
        ['id', 'book_id', 'chapter_number', 'audio_url', 'updated_at', 'created_at'],
      )
    },
    readRemote: async () => {
      const { data, error } = await supabase.from('book_chapters').select('*')
      if (error) throw error
      return ((data as BookChapter[]) ?? []).slice()
    },
    writeCache: async (rows) => {
      await cacheAll(db.bookChapters, rows)
    },
  })
}

export async function syncPageViews() {
  return syncCollection<PageView>({
    key: 'pageViews',
    readCache: () => db.pageViews.toArray(),
    readFingerprint: async () => {
      const { data, error } = await supabase
        .from('page_views')
        .select('id, post_id, viewed_at')

      if (error) throw error

      return fingerprintRows((data as Record<string, unknown>[]) ?? [], ['id', 'post_id', 'viewed_at'])
    },
    readRemote: async () => {
      const { data, error } = await supabase.from('page_views').select('*')
      if (error) throw error
      return ((data as PageView[]) ?? []).slice()
    },
    writeCache: async (rows) => {
      await cacheAll(db.pageViews, rows)
    },
  })
}

export async function syncProfile(userId: string) {
  return runOnce(`profile:${userId}`, async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, email, role, avatar_url, created_at')
      .eq('id', userId)
      .maybeSingle()

    if (error) throw error

    if (!data) {
      return null
    }

    const profile = data as Profile
    await db.profiles.put(profile)
    await db.syncMeta.put({
      key: `profile:${userId}`,
      fingerprint: fingerprintRows([profile as unknown as Record<string, unknown>], [
        'id',
        'name',
        'email',
        'role',
        'avatar_url',
        'created_at',
      ]),
      syncedAt: new Date().toISOString(),
    })
    return profile
  })
}

export async function syncDrafts(userId: string) {
  return syncCollection<Draft>({
    key: `drafts:${userId}`,
    readCache: () => db.drafts.where('user_id').equals(userId).toArray(),
    readFingerprint: async () => {
      const { data, error } = await supabase
        .from('drafts')
        .select('id, user_id, type, title, source_id, updated_at, last_saved_at, is_ready')
        .eq('user_id', userId)

      if (error) throw error

      return fingerprintRows(
        (data as Record<string, unknown>[]) ?? [],
        ['id', 'user_id', 'type', 'title', 'source_id', 'updated_at', 'last_saved_at', 'is_ready'],
      )
    },
    readRemote: async () => {
      const { data, error } = await supabase
        .from('drafts')
        .select('*')
        .eq('user_id', userId)

      if (error) throw error

      return ((data as Draft[]) ?? []).slice()
    },
    writeCache: async (rows) => {
      await db.drafts.where('user_id').equals(userId).delete()
      if (rows.length > 0) {
        await db.drafts.bulkPut(rows)
      }
    },
  })
}

export async function syncAllDrafts() {
  return syncCollection<Draft>({
    key: 'drafts:all',
    readCache: () => db.drafts.toArray(),
    readFingerprint: async () => {
      const { data, error } = await supabase
        .from('drafts')
        .select('id, user_id, type, title, source_id, updated_at, last_saved_at, is_ready')

      if (error) throw error

      return fingerprintRows(
        (data as Record<string, unknown>[]) ?? [],
        ['id', 'user_id', 'type', 'title', 'source_id', 'updated_at', 'last_saved_at', 'is_ready'],
      )
    },
    readRemote: async () => {
      const { data, error } = await supabase.from('drafts').select('*')

      if (error) throw error

      return ((data as Draft[]) ?? []).slice()
    },
    writeCache: async (rows) => {
      await db.drafts.clear()
      if (rows.length > 0) {
        await db.drafts.bulkPut(rows)
      }
    },
  })
}

export async function syncFavorites(userId: string) {
  return syncCollection<FavoriteRecord>({
    key: `favorites:${userId}`,
    readCache: () => db.favorites.where('user_id').equals(userId).toArray(),
    readFingerprint: async () => {
      const { data, error } = await supabase
        .from('favorites')
        .select('id, user_id, post_id, created_at')
        .eq('user_id', userId)

      if (error) throw error

      return fingerprintRows(
        (data as Record<string, unknown>[]) ?? [],
        ['id', 'user_id', 'post_id', 'created_at'],
      )
    },
    readRemote: async () => {
      const { data, error } = await supabase
        .from('favorites')
        .select('id, user_id, post_id, created_at')
        .eq('user_id', userId)

      if (error) throw error

      return ((data as FavoriteRecord[]) ?? []).slice()
    },
    writeCache: async (rows) => {
      await db.favorites.where('user_id').equals(userId).delete()
      if (rows.length > 0) {
        await db.favorites.bulkPut(rows)
      }
    },
  })
}

export async function getCachedPosts() {
  return db.blogPosts.toArray()
}

export async function getCachedBooks() {
  return db.books.toArray()
}

export async function getCachedBookChapters() {
  return db.bookChapters.toArray()
}

export async function getCachedProfile(userId: string) {
  return db.profiles.get(userId)
}

export async function getCachedDrafts(userId: string) {
  return db.drafts.where('user_id').equals(userId).toArray()
}

export async function getAllCachedDrafts() {
  return db.drafts.toArray()
}

export async function getLatestCachedDraft(userId: string, type: DraftType) {
  const drafts = await getCachedDrafts(userId)
  return drafts
    .filter((draft) => draft.type === type)
    .sort((left, right) => right.last_saved_at.localeCompare(left.last_saved_at))[0] ?? null
}

export async function getCachedFavorites(userId: string) {
  return db.favorites.where('user_id').equals(userId).toArray()
}

export async function getCachedPageViews() {
  return db.pageViews.toArray()
}

export async function upsertCachedPost(post: BlogPost) {
  await db.blogPosts.put(post)
}

export async function removeCachedPost(postId: string) {
  await db.blogPosts.delete(postId)
}

export async function upsertCachedBook(book: Book) {
  await db.books.put(book)
}

export async function removeCachedBook(bookId: string) {
  await db.books.delete(bookId)
}

export async function replaceCachedChapters(bookId: string, chapters: BookChapter[]) {
  await db.bookChapters.where('book_id').equals(bookId).delete()
  if (chapters.length > 0) {
    await db.bookChapters.bulkPut(chapters)
  }
}

export async function upsertCachedProfile(profile: Profile) {
  await db.profiles.put(profile)
}

export async function replaceCachedFavorites(userId: string, favorites: FavoriteRecord[]) {
  await db.favorites.where('user_id').equals(userId).delete()
  if (favorites.length > 0) {
    await db.favorites.bulkPut(favorites)
  }
}

export async function addCachedFavorite(record: FavoriteRecord) {
  await db.favorites.put(record)
}

export async function removeCachedFavorite(userId: string, postId: string) {
  const favorite = await db.favorites
    .where('user_id')
    .equals(userId)
    .and((row) => row.post_id === postId)
    .first()

  if (favorite) {
    await db.favorites.delete(favorite.id)
  }
}

export async function addCachedPageView(view: PageView) {
  await db.pageViews.put(view)
}

async function refreshDraftSyncMeta(userId: string) {
  const drafts = await db.drafts.where('user_id').equals(userId).toArray()
  await db.syncMeta.put({
    key: `drafts:${userId}`,
    fingerprint: draftFingerprint(drafts),
    syncedAt: new Date().toISOString(),
  })
}

export async function saveCachedDraft(draft: Draft) {
  await db.drafts.put(draft)
  await refreshDraftSyncMeta(draft.user_id)
}

export async function removeCachedDraft(userId: string, draftId: string) {
  await db.drafts.delete(draftId)
  await refreshDraftSyncMeta(userId)
}

export async function getCachedPageViewCounts() {
  const views = await db.pageViews.toArray()
  const counts: Record<string, number> = {}

  views.forEach((view) => {
    if (!view.post_id) {
      return
    }

    counts[view.post_id] = (counts[view.post_id] ?? 0) + 1
  })

  return counts
}

export async function getCachedFavoritePostIds(userId: string) {
  const favorites = await getCachedFavorites(userId)
  return favorites.map((favorite) => favorite.post_id).filter(Boolean)
}
