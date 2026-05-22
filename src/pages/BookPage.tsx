import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { CalendarDays, ChevronLeft, Maximize2, Pause, Play, Sparkles } from 'lucide-react'
import type { Book, BookChapter, BookFormat } from '../lib/types'
import { Seo } from '../components/Seo'
import { EmptyState, SectionHeading } from '../components/SiteLayout'
import { useAudioPlayer } from '../context/AudioContext'
import { getCurrentSession } from '../lib/auth'
import { getCachedBookChapters, getCachedBooks, syncBookChapters, syncBooks } from '../lib/cache'
import { SITE_NAME, buildAbsoluteUrl } from '../lib/seo'
import { supabase } from '../lib/supabase'
import { initializePayment } from '../lib/payments'

function formatDate(date: string) {
  return new Intl.DateTimeFormat('en', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date))
}

function formatPlaybackTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '0:00'
  }

  const wholeSeconds = Math.floor(seconds)
  const minutes = Math.floor(wholeSeconds / 60)
  const remainingSeconds = wholeSeconds % 60
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`
}

function trimToWords(text: string, maxWords: number) {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (words.length <= maxWords) {
    return text.trim()
  }

  return `${words.slice(0, maxWords).join(' ')}...`
}

export function BookPage() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [book, setBook] = useState<Book | null>(null)
  const [chapters, setChapters] = useState<BookChapter[]>([])
  const [bookPrice, setBookPrice] = useState<number>(0)
  const [bookFormats, setBookFormats] = useState<BookFormat[]>([])
  const [isPurchaseOpen, setIsPurchaseOpen] = useState(false)
  const [checkoutMessage, setCheckoutMessage] = useState<string | null>(null)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { currentTime, duration, isPlaying, sourceUrl, setSourceUrl, play } = useAudioPlayer()

  useEffect(() => {
    if (!slug) {
      return
    }

    let active = true

    async function loadBook() {
      setLoading(true)

      try {
        await Promise.all([syncBooks(), syncBookChapters()])
        const [cachedBooks, cachedChapters] = await Promise.all([getCachedBooks(), getCachedBookChapters()])
        const currentBook = cachedBooks.find((entry) => entry.slug === slug && entry.published) ?? null
        const { data: formats } = currentBook
          ? await supabase
              .from('book_formats')
              .select('id, book_id, type, price, stock, ebook_file_url, active, created_at')
              .eq('book_id', currentBook.id)
              .eq('active', true)
          : { data: null }
        const currentChapters = currentBook
          ? cachedChapters
              .filter((chapter) => chapter.book_id === currentBook.id)
              .sort((left, right) => left.chapter_number - right.chapter_number)
          : []

        if (!active) {
          return
        }

        setBook(currentBook)
        const activeFormats = ((formats ?? []) as BookFormat[]).filter(
          (format) => format.type === 'ebook' || format.type === 'physical',
        )
        setBookFormats(activeFormats)
        setBookPrice(activeFormats.length > 0 ? Math.min(...activeFormats.map((format) => Number(format.price) || 0)) : 0)
        setChapters(currentChapters)
        setError(null)
      } catch (fetchError) {
        if (!active) {
          return
        }

        setError(fetchError instanceof Error ? fetchError.message : 'Failed to load book')
        setBook(null)
        setChapters([])
        setBookFormats([])
        setBookPrice(0)
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    loadBook()

    return () => {
      active = false
    }
  }, [slug])

  const activeChapter = useMemo(() => {
    if (!chapters.length) {
      return null
    }

    const searchParams = new URLSearchParams(location.search)
    const requestedChapterId = searchParams.get('chapter')
    return chapters.find((chapter) => chapter.id === requestedChapterId) ?? chapters[0] ?? null
  }, [chapters, location.search])
  const activeChapterPreview = useMemo(() => {
    if (!activeChapter) {
      return ''
    }

    return bookPrice > 0 ? trimToWords(activeChapter.content, 130) : activeChapter.content
  }, [activeChapter, bookPrice])
  const isPaidBook = bookPrice > 0

  async function purchaseBook(format: BookFormat) {
    if (!book) {
      return
    }

    try {
      setCheckoutLoading(true)
      setCheckoutMessage(null)

      const session = await getCurrentSession()
      const email = session?.user?.email
      const userId = session?.user?.id

      if (!session || !email || !userId) {
        navigate('/login')
        return
      }

      const response = await initializePayment({
        email,
        amount: Number(format.price) || 0,
        orderItems: [
          {
            item_type: 'book',
            quantity: 1,
            unit_price: Number(format.price) || 0,
            book_format_id: format.id,
            label: `${book.title} (${format.type})`,
          },
        ],
        metadata: {
          userId,
          kind: 'book',
          bookId: book.id,
          bookFormatId: format.id,
          formatType: format.type,
        },
        callbackUrl: `${window.location.origin}/book/${book.slug}`,
      })

      if (response.authorization_url) {
        window.location.assign(response.authorization_url)
        return
      }

      setCheckoutMessage('Payment could not be started.')
    } catch (purchaseError) {
      setCheckoutMessage(purchaseError instanceof Error ? purchaseError.message : 'Purchase failed.')
    } finally {
      setCheckoutLoading(false)
    }
  }

  if (!slug) {
    return <Navigate to="/" replace />
  }

  const pageTitle = book ? `${book.title}` : 'Book not found'
  const pageDescription = book?.description || 'Read books and long-form stories from Ochibo Times.'
  const pageImage = book?.cover_image ?? undefined
  const seo = (
    <Seo
      title={pageTitle}
      description={pageDescription}
      path={`/book/${slug}`}
      image={pageImage}
      noindex={!book}
      type="book"
      publishedTime={book?.created_at}
      modifiedTime={book?.updated_at ?? book?.created_at}
      author={SITE_NAME}
      jsonLd={
        book
          ? {
              '@context': 'https://schema.org',
              '@type': 'Book',
              name: book.title,
              description: pageDescription,
              url: buildAbsoluteUrl(`/book/${book.slug}`),
              image: pageImage ? [buildAbsoluteUrl(pageImage)] : undefined,
              author: {
                '@type': 'Organization',
                name: SITE_NAME,
              },
              publisher: {
                '@type': 'Organization',
                name: SITE_NAME,
                logo: {
                  '@type': 'ImageObject',
                  url: buildAbsoluteUrl('/favicon.svg'),
                },
              },
            }
          : undefined
      }
    />
  )

  if (loading) {
    return (
      <>
        {seo}
        <div className="content-section">
          <div className="loading-post" />
        </div>
      </>
    )
  }

  if (error) {
    return (
      <>
        {seo}
        <EmptyState title="Could not load book" description={error} />
      </>
    )
  }

  if (!book) {
    return (
      <>
        {seo}
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
      </>
    )
  }

  return (
    <article className="post-shell">
      {seo}
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
        {isPaidBook ? <span>Price: {bookPrice.toLocaleString()}</span> : null}
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
                if (chapter) {
                  navigate(`/book/${slug}?chapter=${chapter.id}`, { replace: true })
                }
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
              <div className="post-body">{activeChapterPreview}</div>
              {isPaidBook ? (
                <div className="book-purchase-box">
                  <p className="book-purchase-note">
                    This book is a paid title. Preview ends after 130 words.
                  </p>
                  <button type="button" className="primary-button" onClick={() => setIsPurchaseOpen(true)}>
                    Purchase book
                  </button>
                  {checkoutMessage ? <p className="book-purchase-note">{checkoutMessage}</p> : null}
                </div>
              ) : null}
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

      {activeChapter?.audio_url ? (
        <div className="audio-fab audio-fab-compact" aria-label="Audiobook controls">
          <Link
            to={`/book/${slug}/audio?chapter=${activeChapter.id}`}
            className="audio-fab-main"
            aria-label="Open audiobook player"
          >
            <span className="audio-fab-compact-icon">
              <Maximize2 size={16} />
            </span>
            {sourceUrl === activeChapter.audio_url && (isPlaying || currentTime > 0 || duration > 0) ? (
              <span className="audio-fab-progress-wrap">
                <span className="audio-fab-progress-track" aria-hidden="true">
                  <span
                    className="audio-fab-progress-fill"
                    style={{
                      width:
                        duration > 0 ? `${Math.min(100, Math.max(0, (currentTime / duration) * 100))}%` : '0%',
                    }}
                  />
                </span>
                <span className="audio-fab-progress-meta">
                  {formatPlaybackTime(currentTime)} / {formatPlaybackTime(duration)}
                </span>
              </span>
            ) : (
              <span className="audio-fab-compact-text">Audiobook</span>
            )}
          </Link>
          <button
            type="button"
            className="audio-fab-action"
            onClick={async (event) => {
              event.preventDefault()
              event.stopPropagation()
              setSourceUrl(activeChapter.audio_url)
              try {
                await play()
              } catch (playError) {
                console.error('Failed to play audiobook', playError)
              }
            }}
            aria-label="Play audiobook"
          >
            {isPlaying ? <Pause size={16} /> : <Play size={16} />}
          </button>
        </div>
      ) : null}

      {isPurchaseOpen ? (
        <div className="search-overlay" onClick={() => setIsPurchaseOpen(false)}>
          <div className="search-modal purchase-modal" onClick={(event) => event.stopPropagation()}>
            <div className="search-header">
              <h2>Choose a format</h2>
              <button
                type="button"
                className="search-close"
                onClick={() => setIsPurchaseOpen(false)}
                aria-label="Close purchase options"
              >
                <ChevronLeft size={20} />
              </button>
            </div>

            <div className="purchase-options">
              {bookFormats.length > 0 ? (
                bookFormats.map((format) => (
                  <button
                    key={format.id}
                    type="button"
                    className="purchase-option"
                    onClick={() => void purchaseBook(format)}
                    disabled={checkoutLoading}
                  >
                    <span>{format.type === 'ebook' ? 'Ebook' : 'Physical'}</span>
                    <strong>{Number(format.price).toLocaleString()}</strong>
                  </button>
                ))
              ) : (
                <p className="search-status">No active purchase formats are available.</p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </article>
  )
}
