import { useCallback, useEffect, useState } from 'react'
import { BadgeCheck, BookOpen, FileText, RefreshCw, Trash2 } from 'lucide-react'
import { EmptyState } from '../components/SiteLayout'
import { supabase } from '../lib/supabase'
import type { Draft } from '../lib/types'
import { getCachedDrafts, removeCachedDraft, saveCachedDraft, syncDrafts } from '../lib/cache'

/* eslint-disable react-hooks/set-state-in-effect */

type DraftPreview = {
  summary: string
  title: string
  subtitle: string
  chapterCount?: number
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date))
}

function parseDraftPreview(draft: Draft): DraftPreview {
  try {
    const payload = JSON.parse(draft.content ?? '{}') as Record<string, unknown>
    if (draft.type === 'blog') {
      return {
        title: draft.title,
        subtitle: String(payload.slug ?? draft.category ?? 'Blog draft'),
        summary: String(payload.excerpt ?? payload.content ?? draft.excerpt ?? draft.title),
      }
    }

    const chapters = Array.isArray(payload.chapters) ? payload.chapters : []
    return {
      title: draft.title,
      subtitle: String(payload.slug ?? draft.excerpt ?? 'Book draft'),
      summary: String(payload.description ?? draft.excerpt ?? draft.title),
      chapterCount: chapters.length,
    }
  } catch {
    return {
      title: draft.title,
      subtitle: draft.type === 'blog' ? 'Blog draft' : 'Book draft',
      summary: draft.excerpt ?? draft.title,
    }
  }
}

interface DraftsPageProps {
  sessionUserId: string | null
  onOpenDraft: (draft: Draft) => void
}

export function DraftsPage({ sessionUserId, onOpenDraft }: DraftsPageProps) {
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const loadDrafts = useCallback(async () => {
    if (!sessionUserId) {
      setDrafts([])
      setLoading(false)
      return
    }

    setRefreshing(true)
    try {
      await syncDrafts(sessionUserId)
      const cachedDrafts = await getCachedDrafts(sessionUserId)
      setDrafts(
        cachedDrafts.sort((left, right) => right.last_saved_at.localeCompare(left.last_saved_at)),
      )
      setMessage(null)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load drafts')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [sessionUserId])

  useEffect(() => {
    void loadDrafts()
  }, [loadDrafts])

  async function deleteDraft(draft: Draft) {
    const confirmed = window.confirm('Delete this draft?')
    if (!confirmed || !sessionUserId) {
      return
    }

    const { error } = await supabase.from('drafts').delete().eq('id', draft.id).eq('user_id', sessionUserId)
    if (error) {
      setMessage(error.message)
      return
    }

    await removeCachedDraft(sessionUserId, draft.id)
    setDrafts((current) => current.filter((entry) => entry.id !== draft.id))
  }

  async function toggleReady(draft: Draft) {
    if (!sessionUserId) {
      return
    }

    const nextDraft = {
      ...draft,
      is_ready: !draft.is_ready,
      updated_at: new Date().toISOString(),
      last_saved_at: new Date().toISOString(),
    }

    const { error } = await supabase
      .from('drafts')
      .update({ is_ready: nextDraft.is_ready, updated_at: nextDraft.updated_at, last_saved_at: nextDraft.last_saved_at })
      .eq('id', draft.id)
      .eq('user_id', sessionUserId)

    if (error) {
      setMessage(error.message)
      return
    }

    await saveCachedDraft(nextDraft)
    setDrafts((current) => current.map((entry) => (entry.id === draft.id ? nextDraft : entry)))
  }

  const emptyState = loading ? (
    <div className="loading-grid">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="loading-card" />
      ))}
    </div>
  ) : drafts.length === 0 ? (
    <EmptyState
      icon={<FileText size={20} />}
      title="No drafts yet"
      description="Save a draft from the post or book editor and it will appear here."
    />
  ) : null

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Drafts</h2>
        <button className="secondary-button" onClick={() => void loadDrafts()} disabled={refreshing}>
          <RefreshCw size={16} />
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {message ? <div className="form-message info">{message}</div> : null}

      {emptyState}

      {drafts.length > 0 ? (
        <div className="dashboard-grid">
          {drafts.map((draft) => {
            const preview = parseDraftPreview(draft)
            return (
              <article key={draft.id} className="dashboard-card">
                <div className="card-topline">
                  <span>{draft.type === 'blog' ? 'Blog draft' : 'Book draft'}</span>
                  <span>{formatDate(draft.last_saved_at)}</span>
                </div>
                <h3>{preview.title}</h3>
                <p>{preview.summary}</p>
                <div className="card-topline" style={{ marginTop: '0.75rem' }}>
                  <span>{preview.subtitle}</span>
                  {draft.is_ready ? (
                    <span className="role-badge">
                      <BadgeCheck size={14} />
                      Ready
                    </span>
                  ) : (
                    <span>Not ready</span>
                  )}
                </div>
                {typeof preview.chapterCount === 'number' ? (
                  <p className="muted">{preview.chapterCount} chapter(s)</p>
                ) : null}
                <div className="card-actions">
                  <button className="secondary-button small" onClick={() => onOpenDraft(draft)}>
                    {draft.type === 'blog' ? <FileText size={16} /> : <BookOpen size={16} />}
                    Continue editing
                  </button>
                  <button className="secondary-button small" onClick={() => void toggleReady(draft)}>
                    <BadgeCheck size={16} />
                    {draft.is_ready ? 'Unfinalize' : 'Finalize'}
                  </button>
                  <button className="danger-button small" onClick={() => void deleteDraft(draft)}>
                    <Trash2 size={16} />
                    Delete
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      ) : null}
    </section>
  )
}
