import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  BookOpen,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Pause,
  Play,
  Sparkles,
} from 'lucide-react'
import type { Book, BookChapter } from '../lib/types'
import { Seo } from '../components/Seo'
import { EmptyState } from '../components/SiteLayout'
import { useAudioPlayer } from '../context/AudioContext'
import { getCachedBookChapters, getCachedBooks, syncBookChapters, syncBooks } from '../lib/cache'
import { SITE_NAME, buildAbsoluteUrl } from '../lib/seo'

function formatPlaybackTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '0:00'
  }

  const wholeSeconds = Math.floor(seconds)
  const minutes = Math.floor(wholeSeconds / 60)
  const remainingSeconds = wholeSeconds % 60
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`
}

export function BookAudioPage() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [book, setBook] = useState<Book | null>(null)
  const [chapters, setChapters] = useState<BookChapter[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const {
    currentTime,
    duration,
    isPlaying,
    sourceUrl,
    setSourceUrl,
    seek,
    play,
    pause,
  } = useAudioPlayer()

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
        const currentChapters = currentBook
          ? cachedChapters
              .filter((chapter) => chapter.book_id === currentBook.id && chapter.audio_url)
              .sort((left, right) => left.chapter_number - right.chapter_number)
          : []

        if (!active) {
          return
        }

        setBook(currentBook)
        setChapters(currentChapters)
        setError(null)
      } catch (fetchError) {
        if (!active) {
          return
        }

        setError(fetchError instanceof Error ? fetchError.message : 'Failed to load audiobook')
        setBook(null)
        setChapters([])
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

  useEffect(() => {
    if (!activeChapter?.audio_url) {
      return
    }

    if (sourceUrl !== activeChapter.audio_url) {
      setSourceUrl(activeChapter.audio_url)
    }
  }, [activeChapter?.audio_url, setSourceUrl, sourceUrl])

  if (!slug) {
    return <Navigate to="/" replace />
  }

  const pageTitle = book ? `${book.title} Audio Player` : 'Audiobook player'
  const pageDescription =
    book?.description || 'Listen to audiobook chapters from Ochibo Times with playback controls.'
  const pageImage = book?.cover_image ?? undefined
  const seo = (
    <Seo
      title={pageTitle}
      description={pageDescription}
      path={`/book/${slug}/audio`}
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
              url: buildAbsoluteUrl(`/book/${book.slug}/audio`),
              image: pageImage ? [buildAbsoluteUrl(pageImage)] : undefined,
              author: {
                '@type': 'Organization',
                name: SITE_NAME,
              },
            }
          : undefined
      }
    />
  )

  function getPlayableChapters() {
    return chapters.filter((chapter) => chapter.audio_url)
  }

  function getChapterIndex() {
    return getPlayableChapters().findIndex((chapter) => chapter.id === activeChapter?.id)
  }

  async function togglePlayback() {
    if (!activeChapter?.audio_url) {
      return
    }

    try {
      if (isPlaying) {
        pause()
        return
      }

      await play()
    } catch (playError) {
      console.error('Failed to play audiobook', playError)
    }
  }

  function goToAdjacent(direction: -1 | 1) {
    const playable = getPlayableChapters()
    if (!playable.length) {
      return
    }

    const currentIndex = getChapterIndex()
    const nextIndex = currentIndex === -1 ? 0 : currentIndex + direction
    if (nextIndex < 0 || nextIndex >= playable.length) {
      return
    }

    navigate(`/book/${slug}/audio?chapter=${playable[nextIndex].id}`, { replace: true })
  }

  function minimizePlayer() {
    if (slug && activeChapter) {
      navigate(`/book/${slug}?chapter=${activeChapter.id}`)
    } else if (slug) {
      navigate(`/book/${slug}`)
    } else {
      navigate('/')
    }
  }

  if (loading) {
    return (
      <>
        {seo}
        <div className="page-loading">
          <div className="loading-card" />
        </div>
      </>
    )
  }

  if (error) {
    return (
      <>
        {seo}
        <EmptyState title="Could not load audiobook" description={error} />
      </>
    )
  }

  if (!book) {
    return (
      <>
        {seo}
        <EmptyState
          icon={<Sparkles size={20} />}
          title="Audiobook not found"
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

  const playableChapters = getPlayableChapters()
  const currentIndex = getChapterIndex()
  const canGoPrev = currentIndex > 0
  const canGoNext = currentIndex >= 0 && currentIndex < playableChapters.length - 1

  return (
    <article className="audio-page-shell">
      {seo}
      <div className="audio-page-topbar">
        <Link to={`/book/${book.slug}`} className="audio-back-link" aria-label="Back to book">
          <ArrowLeft size={16} />
        </Link>
        <button type="button" className="audio-top-icon" onClick={minimizePlayer} aria-label="Collapse player">
          <ChevronDown size={16} />
        </button>
      </div>
      <div className="audio-player-layout">
        <div className="audio-player-main">
          <div className="audio-player-card audio-hero-card">
            <div className="audio-cover-frame">
              {book.cover_image ? (
                <img className="audio-player-cover" src={book.cover_image} alt={book.title} />
              ) : (
                <div className="audio-player-cover audio-player-cover-fallback">
                  <BookOpen size={28} />
                </div>
              )}
            </div>

            <div className="audio-hero-copy">
              <h1>{book.title}</h1>
              <p className="audio-player-subtitle">
                {activeChapter ? `Chapter ${activeChapter.chapter_number}: ${activeChapter.title}` : 'Select a chapter'}
              </p>
              <p className="audio-book-about">
                {book.description || 'A book from Ochibo Times.'}
              </p>
            </div>

            {activeChapter ? (
              <>
                <div className="audio-timeline">
                  <span>{formatPlaybackTime(currentTime)}</span>
                  <input
                    type="range"
                    className="audio-player-seek"
                    min={0}
                    max={Number.isFinite(duration) && duration > 0 ? duration : 0}
                    step="0.1"
                    value={Math.min(currentTime, duration || 0)}
                    onChange={(event) => seek(Number(event.target.value))}
                    aria-label="Seek audiobook"
                  />
                  <span>{formatPlaybackTime(duration)}</span>
                </div>

                <div className="audio-transport">
                  <button
                    type="button"
                    className="audio-ghost-button"
                    onClick={() => goToAdjacent(-1)}
                    disabled={!canGoPrev}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button type="button" className="audio-play-button" onClick={() => void togglePlayback()}>
                    {isPlaying ? <Pause size={18} /> : <Play size={18} />}
                  </button>
                  <button
                    type="button"
                    className="audio-ghost-button"
                    onClick={() => goToAdjacent(1)}
                    disabled={!canGoNext}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </>
            ) : (
              <EmptyState
                title="No playable audio chapter"
                description="This book does not have an audio chapter yet."
              />
            )}
          </div>
        </div>

        <aside className="audio-player-sidebar">
          {playableChapters.length > 1 ? (
            <div className="panel">
              <h2>Chapters with audio</h2>
              <div className="audio-chapter-pills">
                {playableChapters.map((chapter) => (
                  <button
                    type="button"
                    key={chapter.id}
                    className={`audio-chapter-pill ${chapter.id === activeChapter?.id ? 'active' : ''}`}
                    onClick={() => {
                      navigate(`/book/${slug}/audio?chapter=${chapter.id}`, { replace: true })
                    }}
                  >
                    Chapter {chapter.chapter_number}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </article>
  )
}
