import { useState, useEffect, type FormEvent } from 'react'
import { ArrowLeft, Plus, Save, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Book, BookChapter, BookFormat, Draft } from '../lib/types'
import {
  getCachedBookChapters,
  getLatestCachedDraft,
  replaceCachedChapters,
  removeCachedDraft,
  saveCachedDraft,
  syncBookChapters,
  syncDrafts,
  upsertCachedBook,
} from '../lib/cache'

/* eslint-disable react-hooks/set-state-in-effect */

type BookFormState = {
  id: string
  title: string
  slug: string
  description: string
  cover_image: string
  price: string
  published: boolean
}

type ChapterFormState = {
  id?: string
  title: string
  chapter_number: number
  content: string
  image_url: string
  audio_url: string
  audio_file: File | null
}

const emptyBookForm: BookFormState = {
  id: '',
  title: '',
  slug: '',
  description: '',
  cover_image: '',
  price: '',
  published: true,
}

const emptyChapter: ChapterFormState = {
  title: '',
  chapter_number: 1,
  content: '',
  image_url: '',
  audio_url: '',
  audio_file: null,
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
}

type BookDraftSnapshot = {
  slug: string
  description: string
  price: string
  chapters: ChapterFormState[]
}

function sanitizeFileName(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/(^-|-$)+/g, '')
}

function parseBookDraftContent(raw: string | null): BookDraftSnapshot {
  if (!raw) {
    return { slug: '', description: '', price: '', chapters: [] }
  }

  try {
    const parsed = JSON.parse(raw) as Partial<BookDraftSnapshot>
    return {
      slug: typeof parsed.slug === 'string' ? parsed.slug : '',
      description: typeof parsed.description === 'string' ? parsed.description : '',
      price: typeof parsed.price === 'string' ? parsed.price : '',
      chapters: Array.isArray(parsed.chapters)
        ? parsed.chapters
            .map((chapter) => ({
              title: typeof chapter?.title === 'string' ? chapter.title : '',
              chapter_number: typeof chapter?.chapter_number === 'number' ? chapter.chapter_number : 1,
              content: typeof chapter?.content === 'string' ? chapter.content : '',
              image_url: typeof chapter?.image_url === 'string' ? chapter.image_url : '',
              audio_url: typeof chapter?.audio_url === 'string' ? chapter.audio_url : '',
              audio_file: null,
              id: typeof chapter?.id === 'string' ? chapter.id : undefined,
            }))
            .filter((chapter) => chapter.title || chapter.content)
        : [],
    }
  } catch {
    return { slug: '', description: raw, price: '', chapters: [] }
  }
}

function buildBookDraftContent(bookForm: BookFormState, chapters: ChapterFormState[]) {
  return JSON.stringify({
    slug: bookForm.slug || slugify(bookForm.title),
    description: bookForm.description,
    price: bookForm.price,
    chapters: chapters.map((chapter) => ({
      id: chapter.id,
      title: chapter.title,
      chapter_number: chapter.chapter_number,
      content: chapter.content,
      image_url: chapter.image_url,
      audio_url: chapter.audio_url,
    })),
  })
}

async function uploadChapterAudio(params: {
  scope: string
  chapterNumber: number
  file: File
}) {
  const safeName = sanitizeFileName(params.file.name) || 'audio-file'
  const path = `${params.scope}/chapter-${params.chapterNumber}-${Date.now()}-${safeName}`

  const { error: uploadError } = await supabase.storage.from('book-audio').upload(path, params.file, {
    upsert: true,
  })

  if (uploadError) {
    console.error('Audio upload failed', uploadError)
    return null
  }

  const { data } = supabase.storage.from('book-audio').getPublicUrl(path)
  return data.publicUrl
}

interface BooksEditorProps {
  sessionUserId: string | null
  editingBook?: Book | null
  draftSeed?: Draft | null
  onDraftConsumed?: () => void
  onSave: () => void
}

export function BooksEditor({ sessionUserId, editingBook, draftSeed, onDraftConsumed, onSave }: BooksEditorProps) {
  const [bookForm, setBookForm] = useState<BookFormState>(emptyBookForm)
  const [chapters, setChapters] = useState<ChapterFormState[]>([{ ...emptyChapter }])
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const [draftId, setDraftId] = useState<string | null>(null)
  const [draftLoaded, setDraftLoaded] = useState(false)
  const [bookFormatId, setBookFormatId] = useState<string | null>(null)

  useEffect(() => {
    if (editingBook) {
      const book = editingBook
      setDraftId(null)
      setDraftLoaded(true)
      setBookForm({
        id: book.id,
        title: book.title,
        slug: book.slug,
        description: book.description ?? '',
        cover_image: book.cover_image ?? '',
        price: '',
        published: book.published,
      })
      void (async () => {
        const { data: bookFormat } = await supabase
          .from('book_formats')
          .select('id, price')
          .eq('book_id', book.id)
          .eq('type', 'ebook')
          .maybeSingle()

        if (bookFormat) {
          const format = bookFormat as BookFormat
          setBookFormatId(format.id)
          setBookForm((current) => ({
            ...current,
            price: String(format.price ?? ''),
          }))
        } else {
          setBookFormatId(null)
        }
      })()
    } else {
      setBookForm(emptyBookForm)
      setDraftLoaded(false)
      setBookFormatId(null)
    }
  }, [editingBook])

  useEffect(() => {
    if (!editingBook) {
      setChapters([{ ...emptyChapter }])
      return
    }

    const bookId = editingBook.id

    async function load() {
      await syncBookChapters()
      const cachedChapters = await getCachedBookChapters()
      const data = cachedChapters
        .filter((chapter) => chapter.book_id === bookId)
        .sort((left, right) => left.chapter_number - right.chapter_number)

      if (data.length > 0) {
        setChapters(
          data.map((c: BookChapter) => ({
            id: c.id,
            title: c.title,
            chapter_number: c.chapter_number,
            content: c.content,
            image_url: c.image_url ?? '',
            audio_url: c.audio_url ?? '',
            audio_file: null,
          })),
        )
      } else {
        setChapters([{ ...emptyChapter }])
      }
    }
    void load()
  }, [editingBook])

  useEffect(() => {
    if (editingBook || !sessionUserId || draftLoaded || draftSeed) {
      return
    }

    const userId = sessionUserId
    let active = true

    async function loadDraft() {
      try {
        await syncDrafts(userId)
        const draft = await getLatestCachedDraft(userId, 'book')
        if (!active || !draft) {
          return
        }

        const snapshot = parseBookDraftContent(draft.content)
        setDraftId(draft.id)
        setDraftLoaded(true)
        setBookForm({
          id: '',
          title: draft.title,
          slug: snapshot.slug || slugify(draft.title),
          description: draft.excerpt ?? snapshot.description,
          cover_image: draft.cover_image ?? '',
          price: snapshot.price,
          published: true,
        })
        if (snapshot.chapters.length > 0) {
          setChapters(
            snapshot.chapters.map((chapter, index) => ({
              id: chapter.id,
              title: chapter.title,
              chapter_number: chapter.chapter_number || index + 1,
              content: chapter.content,
              image_url: chapter.image_url,
              audio_url: chapter.audio_url,
              audio_file: null,
            })),
          )
        }
      } catch (error) {
        if (!active) {
          return
        }

        setStatusMessage(error instanceof Error ? error.message : 'Failed to load draft')
      }
    }

    void loadDraft()

    return () => {
      active = false
    }
  }, [editingBook, sessionUserId, draftLoaded, draftSeed])

  useEffect(() => {
    if (editingBook || !draftSeed) {
      return
    }

    const snapshot = parseBookDraftContent(draftSeed.content)
    setDraftId(draftSeed.id)
    setDraftLoaded(true)
    setBookForm({
      id: '',
      title: draftSeed.title,
      slug: snapshot.slug || slugify(draftSeed.title),
      description: draftSeed.excerpt ?? snapshot.description,
      cover_image: draftSeed.cover_image ?? '',
      price: snapshot.price,
      published: true,
    })
    if (snapshot.chapters.length > 0) {
      setChapters(
        snapshot.chapters.map((chapter, index) => ({
          id: chapter.id,
          title: chapter.title,
          chapter_number: chapter.chapter_number || index + 1,
          content: chapter.content,
          image_url: chapter.image_url,
          audio_url: chapter.audio_url,
          audio_file: null,
        })),
      )
    } else {
      setChapters([{ ...emptyChapter }])
    }

    onDraftConsumed?.()
  }, [editingBook, draftSeed, onDraftConsumed])

  function addChapter() {
    setChapters([...chapters, { ...emptyChapter, chapter_number: chapters.length + 1 }])
  }

  function removeChapter(index: number) {
    const updated = chapters.filter((_, i) => i !== index).map((c, i) => ({
      ...c,
      chapter_number: i + 1,
    }))
    setChapters(updated)
  }

  function updateChapter(index: number, field: keyof ChapterFormState, value: string | number | File | null) {
    const updated = [...chapters]
    updated[index] = { ...updated[index], [field]: value }
    setChapters(updated)
  }

  async function clearDraft() {
    const ownerId = draftSeed?.user_id ?? sessionUserId
    if (!ownerId || !draftId) {
      return
    }

    await supabase.from('drafts').delete().eq('id', draftId).eq('user_id', ownerId)
    await removeCachedDraft(ownerId, draftId)
    setDraftId(null)
  }

  async function saveDraft() {
    const ownerId = draftSeed?.user_id ?? sessionUserId
    if (!ownerId || !bookForm.title.trim()) {
      setStatusMessage('Draft title is required.')
      return
    }

    setSavingDraft(true)
    setStatusMessage(null)

    try {
      const now = new Date().toISOString()
      const validChapters = chapters.filter((chapter) => chapter.title.trim() || chapter.content.trim())
      const firstChapter = validChapters[0]
      const draftScope = draftId ?? crypto.randomUUID()
      const resolvedChapters = await Promise.all(
        validChapters.map(async (chapter) => {
          const audioUrl = chapter.audio_file
            ? await uploadChapterAudio({
                scope: `drafts/${ownerId}/${draftScope}`,
                chapterNumber: chapter.chapter_number,
                file: chapter.audio_file,
              })
            : chapter.audio_url || null

          return {
            ...chapter,
            audio_url: audioUrl ?? '',
          }
        }),
      )
      const draftRecord: Draft = {
        id: draftScope,
        user_id: ownerId,
        type: 'book',
        title: bookForm.title.trim(),
        content: buildBookDraftContent(bookForm, resolvedChapters),
        excerpt: bookForm.description || null,
        cover_image: bookForm.cover_image || null,
        chapter_title: firstChapter?.title ?? null,
        chapter_number: firstChapter?.chapter_number ?? null,
        category: null,
        source_id: editingBook?.id ?? null,
        last_saved_at: now,
        is_ready: false,
        created_at: now,
        updated_at: now,
      }

      const { data, error } = await supabase.from('drafts').upsert(draftRecord).select('*').single()
      if (error) {
        setStatusMessage(error.message)
        return
      }

      await saveCachedDraft(data as Draft)
      setDraftId((data as Draft).id)
      setDraftLoaded(true)
      setChapters((current) =>
        current.map((chapter) => ({
          ...chapter,
          audio_file: null,
        })),
      )
      setStatusMessage('Draft saved.')
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Failed to save draft')
    } finally {
      setSavingDraft(false)
    }
  }

  async function saveBook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!sessionUserId) {
      return
    }

    setSaving(true)
    setStatusMessage(null)

    try {
      const bookPayload = {
        title: bookForm.title,
        slug: bookForm.slug || slugify(bookForm.title),
        description: bookForm.description || null,
        cover_image: bookForm.cover_image || null,
        published: bookForm.published,
        author_id: sessionUserId,
      }

      let bookId: string

      if (editingBook) {
        const { error } = await supabase.from('books').update(bookPayload).eq('id', editingBook.id)
        if (error) {
          setStatusMessage(error.message)
          return
        }
        bookId = editingBook.id
        await upsertCachedBook({
          ...editingBook,
          ...bookPayload,
          id: editingBook.id,
          created_at: editingBook.created_at,
          updated_at: new Date().toISOString(),
        })
      } else {
        const { data: bookData, error: bookError } = await supabase.from('books').insert(bookPayload).select().single()
        if (bookError) {
          setStatusMessage(bookError.message)
          return
        }
        bookId = bookData.id
        await upsertCachedBook(bookData as Book)
      }

      let resolvedBookFormatId = bookFormatId
      if (editingBook && !resolvedBookFormatId) {
        const { data: existingFormat } = await supabase
          .from('book_formats')
          .select('id')
          .eq('book_id', bookId)
          .eq('type', 'ebook')
          .maybeSingle()

        if (existingFormat) {
          resolvedBookFormatId = (existingFormat as BookFormat).id
        }
      }

      const ebookFormatPayload = {
        book_id: bookId,
        type: 'ebook' as const,
        price: Number(bookForm.price) || 0,
        stock: null,
        ebook_file_url: null,
        active: true,
      }

      if (resolvedBookFormatId) {
        const { error: formatError } = await supabase
          .from('book_formats')
          .update(ebookFormatPayload)
          .eq('id', resolvedBookFormatId)
        if (formatError) {
          setStatusMessage('Book saved but price failed: ' + formatError.message)
          return
        }
      } else {
        const { data: formatData, error: formatError } = await supabase
          .from('book_formats')
          .insert(ebookFormatPayload)
          .select('id')
          .single()

        if (formatError) {
          setStatusMessage('Book saved but price failed: ' + formatError.message)
          return
        }

        setBookFormatId((formatData as BookFormat).id)
      }

      if (editingBook) {
        await supabase.from('book_chapters').delete().eq('book_id', bookId)
      }

      const validChapters = chapters.filter((c) => c.title.trim() && c.content.trim())
      if (validChapters.length > 0) {
        const resolvedChapters = await Promise.all(
          validChapters.map(async (chapter) => {
            const audioUrl = chapter.audio_file
              ? await uploadChapterAudio({
                  scope: `books/${bookId}`,
                  chapterNumber: chapter.chapter_number,
                  file: chapter.audio_file,
                })
              : chapter.audio_url || null

            return {
              book_id: bookId,
              title: chapter.title,
              chapter_number: chapter.chapter_number,
              content: chapter.content,
              image_url: chapter.image_url || null,
              audio_url: audioUrl,
            }
          }),
        )

        const { error: chaptersError } = await supabase.from('book_chapters').insert(resolvedChapters)
        if (chaptersError) {
          setStatusMessage('Book saved but chapters failed: ' + chaptersError.message)
          return
        }
      }

      await replaceCachedChapters(
        bookId,
        validChapters.map(
          (chapter) =>
            ({
              id: chapter.id ?? crypto.randomUUID(),
              book_id: bookId,
              title: chapter.title,
              chapter_number: chapter.chapter_number,
              content: chapter.content,
              image_url: chapter.image_url || null,
              audio_url: chapter.audio_url || null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }) as BookChapter,
        ),
      )
      setChapters((current) =>
        current.map((chapter) => ({
          ...chapter,
          audio_file: null,
        })),
      )
      await clearDraft()
      setDraftLoaded(false)

      setStatusMessage('Book saved successfully.')
      setTimeout(() => {
        onSave()
      }, 1000)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Failed to save book')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>{editingBook ? 'Edit book' : 'Create new book'}</h2>
        <button className="secondary-button" onClick={onSave}>
          <ArrowLeft size={16} />
          Back to books
        </button>
      </div>

      {statusMessage ? <div className="form-message info">{statusMessage}</div> : null}

      <form className="editor-form" onSubmit={saveBook}>
        <label>
          Title
          <input
            value={bookForm.title}
            onChange={(event) => {
              const title = event.target.value
              setBookForm((current) => ({
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
            value={bookForm.slug}
            onChange={(event) =>
              setBookForm((current) => ({ ...current, slug: slugify(event.target.value) }))
            }
            placeholder="your-book-slug"
            required
          />
        </label>

        <label>
          Description
          <textarea
            value={bookForm.description}
            onChange={(event) => setBookForm((current) => ({ ...current, description: event.target.value }))}
            rows={4}
          />
        </label>

        <label>
          Cover image URL
          <input
            value={bookForm.cover_image}
            onChange={(event) =>
              setBookForm((current) => ({ ...current, cover_image: event.target.value }))
            }
          />
        </label>

        <label>
          Price
          <input
            type="number"
            min="0"
            step="0.01"
            value={bookForm.price}
            onChange={(event) => setBookForm((current) => ({ ...current, price: event.target.value }))}
            placeholder="0.00"
          />
        </label>

        <label className="checkbox-line">
          <input
            type="checkbox"
            checked={bookForm.published}
            onChange={(event) =>
              setBookForm((current) => ({ ...current, published: event.target.checked }))
            }
          />
          Publish immediately
        </label>

        <hr className="section-divider" />

        <div className="chapters-header">
          <h3>Chapters</h3>
          <button type="button" className="secondary-button small" onClick={addChapter}>
            <Plus size={16} />
            Add chapter
          </button>
        </div>

        {chapters.map((chapter, index) => (
          <div key={index} className="chapter-block">
            <div className="chapter-header">
              <span>Chapter {chapter.chapter_number}</span>
              {chapters.length > 1 && (
                <button
                  type="button"
                  className="danger-button small"
                  onClick={() => removeChapter(index)}
                >
                  <Trash2 size={14} />
                  Remove
                </button>
              )}
            </div>

            <label>
              Chapter title
              <input
                value={chapter.title}
                onChange={(event) => updateChapter(index, 'title', event.target.value)}
                placeholder="Chapter title"
              />
            </label>

            <label>
              Content
              <textarea
                value={chapter.content}
                onChange={(event) => updateChapter(index, 'content', event.target.value)}
                rows={6}
                placeholder="Chapter content..."
              />
            </label>

            <label>
              Image URL (optional)
              <input
                value={chapter.image_url}
                onChange={(event) => updateChapter(index, 'image_url', event.target.value)}
                placeholder="https://..."
              />
            </label>

            <label>
              Audio attachment (optional)
              <input
                type="file"
                accept="audio/*"
                onChange={(event) =>
                  updateChapter(index, 'audio_file', event.target.files?.[0] ?? null)
                }
              />
            </label>

            {chapter.audio_url ? <p className="chapter-audio-note">Audio attached</p> : null}
          </div>
        ))}

        <div className="form-row">
          <button type="submit" className="primary-button" disabled={saving}>
            <Save size={16} />
            {saving ? 'Saving...' : 'Save book'}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              void saveDraft()
            }}
            disabled={savingDraft}
          >
            <Save size={16} />
            {savingDraft ? 'Saving draft...' : 'Save draft'}
          </button>
          <button
            type="button"
            className="secondary-button"
          onClick={() => {
            setBookForm(emptyBookForm)
            setChapters([{ ...emptyChapter }])
            setDraftId(null)
            setDraftLoaded(true)
          }}
        >
            Reset
          </button>
        </div>
      </form>
    </section>
  )
}
