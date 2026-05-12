import { useState, useEffect, useMemo, type FormEvent } from 'react'
import { ArrowLeft, Plus, Save, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Book, BookChapter } from '../lib/types'

/* eslint-disable react-hooks/set-state-in-effect */

type BookFormState = {
  id: string
  title: string
  slug: string
  description: string
  cover_image: string
  published: boolean
}

type ChapterFormState = {
  id?: string
  title: string
  chapter_number: number
  content: string
  image_url: string
}

const emptyBookForm: BookFormState = {
  id: '',
  title: '',
  slug: '',
  description: '',
  cover_image: '',
  published: true,
}

const emptyChapter: ChapterFormState = {
  title: '',
  chapter_number: 1,
  content: '',
  image_url: '',
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
}

interface BooksEditorProps {
  sessionUserId: string | null
  editingBook?: Book | null
  onSave: () => void
}

export function BooksEditor({ sessionUserId, editingBook, onSave }: BooksEditorProps) {
  const [chapters, setChapters] = useState<ChapterFormState[]>([{ ...emptyChapter }])
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const bookForm = useMemo<BookFormState>(() => {
    if (editingBook) {
      return {
        id: editingBook.id,
        title: editingBook.title,
        slug: editingBook.slug,
        description: editingBook.description ?? '',
        cover_image: editingBook.cover_image ?? '',
        published: editingBook.published,
      }
    }
    return emptyBookForm
  }, [editingBook])

  useEffect(() => {
    if (!editingBook) {
      setChapters([{ ...emptyChapter }])
      return
    }

    async function load() {
      const { data } = await supabase
        .from('book_chapters')
        .select('*')
        .eq('book_id', editingBook.id)
        .order('chapter_number', { ascending: true })

      if (data && data.length > 0) {
        setChapters(
          data.map((c: BookChapter) => ({
            id: c.id,
            title: c.title,
            chapter_number: c.chapter_number,
            content: c.content,
            image_url: c.image_url ?? '',
          })),
        )
      }
    }
    void load()
  }, [editingBook])

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

  function updateChapter(index: number, field: keyof ChapterFormState, value: string | number) {
    const updated = [...chapters]
    updated[index] = { ...updated[index], [field]: value }
    setChapters(updated)
  }

  async function saveBook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!sessionUserId) {
      return
    }

    setSaving(true)
    setStatusMessage(null)

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
        setSaving(false)
        return
      }
      bookId = editingBook.id
    } else {
      const { data: bookData, error: bookError } = await supabase.from('books').insert(bookPayload).select().single()
      if (bookError) {
        setStatusMessage(bookError.message)
        setSaving(false)
        return
      }
      bookId = bookData.id
    }

    if (editingBook) {
      await supabase.from('book_chapters').delete().eq('book_id', bookId)
    }

    const validChapters = chapters.filter((c) => c.title.trim() && c.content.trim())
    if (validChapters.length > 0) {
      const chaptersPayload = validChapters.map((c) => ({
        book_id: bookId,
        title: c.title,
        chapter_number: c.chapter_number,
        content: c.content,
        image_url: c.image_url || null,
      }))

      const { error: chaptersError } = await supabase.from('book_chapters').insert(chaptersPayload)
      if (chaptersError) {
        setStatusMessage('Book saved but chapters failed: ' + chaptersError.message)
        setSaving(false)
        return
      }
    }

    setStatusMessage('Book saved successfully.')
    setTimeout(() => {
      onSave()
    }, 1000)
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
              setBookForm(emptyBookForm)
              setChapters([{ ...emptyChapter }])
            }}
          >
            Reset
          </button>
        </div>
      </form>
    </section>
  )
}
