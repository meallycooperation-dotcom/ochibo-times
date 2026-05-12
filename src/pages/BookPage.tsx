import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { CalendarDays, ChevronLeft, Sparkles } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Book, BookChapter } from '../lib/types'
import { EmptyState, SectionHeading } from '../components/SiteLayout'

function formatDate(date: string) {
  return new Intl.DateTimeFormat('en', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date))
}

export function BookPage() {
  const { slug } = useParams()
  const [book, setBook] = useState<Book | null>(null)
  const [chapters, setChapters] = useState<BookChapter[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeChapter, setActiveChapter] = useState<BookChapter | null>(null)

  useEffect(() => {
    if (!slug) {
      return
    }

    let active = true

    async function loadBook() {
      setLoading(true)
      const { data, error: fetchError } = await supabase
        .from('books')
        .select('*')
        .eq('slug', slug)
        .eq('published', true)
        .maybeSingle()

      if (!active) {
        return
      }

      if (fetchError) {
        setError(fetchError.message)
        setBook(null)
      } else {
        setBook((data as Book) ?? null)
        setError(null)

        if (data) {
          const { data: chaptersData } = await supabase
            .from('book_chapters')
            .select('*')
            .eq('book_id', data.id)
            .order('chapter_number', { ascending: true })

          if (chaptersData) {
            setChapters(chaptersData as BookChapter[])
            if (chaptersData.length > 0) {
              setActiveChapter(chaptersData[0] as BookChapter)
            }
          }
        }
      }

      setLoading(false)
    }

    loadBook()

    return () => {
      active = false
    }
  }, [slug])

  if (!slug) {
    return <Navigate to="/" replace />
  }

  if (loading) {
    return (
      <div className="content-section">
        <div className="loading-post" />
      </div>
    )
  }

  if (error) {
    return <EmptyState title="Could not load book" description={error} />
  }

  if (!book) {
    return (
      <EmptyState
        icon={<Sparkles size={20} />}
        title="Book not found"
        description="The book may have been removed or is still unpublished."
        action={
          <Link to="/" className="primary-button">
            <ChevronLeft size={16} />
            Back home
          </Link>
        }
      />
    )
  }

  return (
    <article className="post-shell">
      <Link to="/" className="back-link">
        <ChevronLeft size={16} />
        Back to home
      </Link>

      <SectionHeading
        eyebrow="Book"
        title={book.title}
        description={book.description || 'A book from Ochibo Times.'}
      />

      <div className="post-meta-row">
        <span>
          <CalendarDays size={14} />
          {formatDate(book.created_at)}
        </span>
        <span>{book.published ? 'Published' : 'Draft'}</span>
      </div>

      {book.cover_image ? (
        <img className="post-hero-image" src={book.cover_image} alt={book.title} />
      ) : null}

      {chapters.length > 0 ? (
        <div className="chapter-container">
          <label className="chapter-select-label">
            <span>Select chapter</span>
            <select
              className="chapter-select"
              value={activeChapter?.id || ''}
              onChange={(e) => {
                const chapter = chapters.find((c) => c.id === e.target.value)
                if (chapter) setActiveChapter(chapter)
              }}
            >
              {chapters.map((chapter) => (
                <option key={chapter.id} value={chapter.id}>
                  Chapter {chapter.chapter_number}: {chapter.title}
                </option>
              ))}
            </select>
          </label>

          {activeChapter && (
            <>
              <div className="chapter-header">
                <span className="chapter-badge">Chapter {activeChapter.chapter_number}</span>
                <h2>{activeChapter.title}</h2>
              </div>
              {activeChapter.image_url && (
                <img className="chapter-image" src={activeChapter.image_url} alt={activeChapter.title} />
              )}
              <div className="post-body">{activeChapter.content}</div>
            </>
          )}
        </div>
      ) : (
        <div className="post-body">
          <EmptyState
            title="No chapters yet"
            description="This book doesn't have any chapters available."
          />
        </div>
      )}

      <button className="back-to-top" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
        Back to top
      </button>
    </article>
  )
}
