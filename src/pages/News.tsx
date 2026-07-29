import { useEffect, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { sv } from 'date-fns/locale'
import { CheckCircle, Loader2, Plus, Save, Trash2, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useContentCards, useCreateContentCard, useDeleteContentCard, useUpdateContentCard } from '../hooks/useContentCards'
import { useEvents } from '../hooks/useEvents'
import type { ContentCard, ContentCardInput, ContentCardType } from '../services/contentCardsService'

type CardStatus = 'active' | 'draft' | 'upcoming' | 'expired'

type LinkType = 'external' | 'kurser' | 'schema' | 'course'

const LINK_TYPE_OPTIONS: Array<{ type: LinkType; label: string }> = [
  { type: 'external', label: 'Extern länk' },
  { type: 'kurser', label: 'Kurser-fliken (app)' },
  { type: 'schema', label: 'Schema-fliken (app)' },
  { type: 'course', label: 'En specifik kurs (app)' },
]

const TYPE_OPTIONS: Array<{ type: ContentCardType; label: string }> = [
  { type: 'news', label: 'Nyhet' },
  { type: 'event', label: 'Event' },
  { type: 'featured_course', label: 'Utvald kurs' },
  { type: 'banner', label: 'Banner' },
]

const TYPE_LABELS: Record<ContentCardType, string> = {
  news: 'Nyhet',
  event: 'Event',
  featured_course: 'Utvald kurs',
  banner: 'Banner',
}

const TYPE_BADGE_CLASS: Record<ContentCardType, string> = {
  news: 'bg-identity-sky text-brand-dark',
  event: 'bg-identity-violet text-brand-dark',
  featured_course: 'bg-identity-amber text-brand-dark',
  banner: 'bg-brand-mint text-brand-dark',
}

const STATUS_CONFIG: Record<CardStatus, { label: string; emoji: string; className: string }> = {
  active: { label: 'Aktiv nu', emoji: '🟢', className: 'bg-status-okSoft text-brand-forest' },
  draft: { label: 'Utkast', emoji: '⚪', className: 'bg-slate-100 text-slate-600' },
  upcoming: { label: 'Kommande', emoji: '🔵', className: 'bg-sky-100 text-sky-700' },
  expired: { label: 'Utgången', emoji: '⚫', className: 'bg-slate-200 text-slate-500' },
}

interface CardDraft {
  type: ContentCardType
  title: string
  body: string
  image_url: string
  link_url: string
  link_label: string
  link_type: LinkType
  course_event_id: string
  starts_at: string
  expires_at: string
  noEndDate: boolean
  published: boolean
  sort_order: string
  send_push: boolean
  show_on_web: boolean
  show_on_app: boolean
}

export function News() {
  const { session, usingLegacyAuth } = useAuth()
  const cardsQuery = useContentCards()
  const cards = cardsQuery.data ?? []
  const createCard = useCreateContentCard()
  const updateCard = useUpdateContentCard()
  const deleteCard = useDeleteContentCard()
  const [modalCard, setModalCard] = useState<ContentCard | 'new' | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const canManageCards = Boolean(session) && !usingLegacyAuth

  async function handleDelete(card: ContentCard, event: React.MouseEvent) {
    event.stopPropagation()
    if (!confirm(`Ta bort "${card.title}"?`)) return

    try {
      setListError(null)
      await deleteCard.mutateAsync(card.id)
    } catch (error) {
      setListError(errorMessage(error) ?? 'Kunde inte ta bort kortet. Försök igen.')
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-dark">Nyheter</h1>
          <p className="mt-1 text-sm text-slate-500">Hantera nyheter, events och banners som visas på appens Hem-sida.</p>
        </div>
        <button
          onClick={() => setModalCard('new')}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-dark px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-forest"
        >
          <Plus className="h-4 w-4" />
          Nytt kort
        </button>
      </div>

      {!canManageCards && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Nyheter kan bara sparas när du är inloggad med en CORE-användare. Logga ut från tillfälligt läge och logga in med e-post/lösenord.
        </div>
      )}

      {listError && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-status-critical">{listError}</p>}

      <div className="card overflow-hidden">
        {cardsQuery.isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-brand-forest" />
          </div>
        ) : cardsQuery.isError ? (
          <p className="px-4 py-8 text-sm text-status-critical">
            {errorMessage(cardsQuery.error) ?? 'Kunde inte hämta nyheter. Försök igen.'}
          </p>
        ) : cards.length === 0 ? (
          <div className="px-4 py-8 text-sm text-slate-500">Inga nyheter än.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-100 bg-slate-50/60">
                <tr>
                  <Th>Typ</Th>
                  <Th>Titel</Th>
                  <Th>Status</Th>
                  <Th>Visas från</Th>
                  <Th>Visas till</Th>
                  <Th>Publicerad</Th>
                  <Th>Notis</Th>
                  <Th>Plattform</Th>
                  <Th />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {cards.map((card) => (
                  <tr
                    key={card.id}
                    onClick={() => setModalCard(card)}
                    className="cursor-pointer hover:bg-slate-50/60"
                  >
                    <td className="whitespace-nowrap px-5 py-3 text-sm">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${TYPE_BADGE_CLASS[card.type]}`}>
                        {TYPE_LABELS[card.type]}
                      </span>
                    </td>
                    <td className="max-w-[280px] px-5 py-3 text-sm font-medium text-brand-dark">
                      <span className="line-clamp-1">{card.title}</span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-sm">
                      <StatusBadge status={computeStatus(card)} />
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-sm text-slate-600">{formatDateTime(card.starts_at)}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-sm text-slate-600">
                      {card.expires_at ? formatDateTime(card.expires_at) : 'Visas för alltid'}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-sm text-slate-600">{card.published ? 'Ja' : 'Nej'}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-sm">
                      <PushIndicator card={card} />
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-sm">
                      <PlatformIndicator card={card} />
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-right text-sm">
                      <button
                        onClick={(event) => handleDelete(card, event)}
                        disabled={!canManageCards}
                        className="rounded-lg p-2 text-status-critical hover:bg-red-50 disabled:opacity-30"
                        aria-label="Ta bort kort"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalCard && (
        <CardModal
          card={modalCard === 'new' ? null : modalCard}
          canManageCards={canManageCards}
          createCard={createCard}
          updateCard={updateCard}
          onClose={() => setModalCard(null)}
        />
      )}
    </div>
  )
}

function CardModal({
  card,
  canManageCards,
  createCard,
  updateCard,
  onClose,
}: {
  card: ContentCard | null
  canManageCards: boolean
  createCard: ReturnType<typeof useCreateContentCard>
  updateCard: ReturnType<typeof useUpdateContentCard>
  onClose: () => void
}) {
  const isEditing = Boolean(card)
  const [draft, setDraft] = useState<CardDraft>(() => toDraft(card))
  const [titleError, setTitleError] = useState<string | null>(null)
  const [destinationError, setDestinationError] = useState<string | null>(null)

  const eventsQuery = useEvents()
  const courseOptions = useMemo(
    () => [...(eventsQuery.data ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'sv')),
    [eventsQuery.data],
  )

  useEffect(() => {
    setDraft(toDraft(card))
    setTitleError(null)
    setDestinationError(null)
  }, [card])

  const saving = createCard.isLoading || updateCard.isLoading
  const mutationError = errorMessage(isEditing ? updateCard.error : createCard.error)

  async function handleSave() {
    if (!draft.title.trim()) {
      setTitleError('Titel är obligatoriskt')
      return
    }
    setTitleError(null)

    if (draft.link_type === 'course' && !draft.course_event_id) {
      setDestinationError('Välj vilken kurs kortet ska länka till')
      return
    }
    setDestinationError(null)

    const appDestination =
      draft.link_type === 'external'
        ? null
        : draft.link_type === 'course'
          ? `course:${draft.course_event_id}`
          : draft.link_type

    const input: ContentCardInput = {
      type: draft.type,
      title: draft.title.trim(),
      body: draft.body.trim() || null,
      image_url: draft.image_url.trim() || null,
      link_url: draft.link_type === 'external' ? draft.link_url.trim() || null : null,
      link_label: draft.link_label.trim() || null,
      app_destination: appDestination,
      starts_at: fromDatetimeLocal(draft.starts_at),
      expires_at: draft.noEndDate ? null : fromDatetimeLocal(draft.expires_at),
      published: draft.published,
      sort_order: Number(draft.sort_order) || 0,
      send_push: draft.send_push,
      show_on_web: draft.show_on_web,
      show_on_app: draft.show_on_app,
    }

    try {
      if (isEditing && card) {
        await updateCard.mutateAsync({ id: card.id, card: input })
      } else {
        await createCard.mutateAsync(input)
      }
      onClose()
    } catch (error) {
      console.error('Kunde inte spara nyhetskortet:', error)
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center px-4 pb-4 sm:items-center sm:pb-0">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      <div className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-y-auto rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 p-5">
          <h2 className="text-base font-bold text-brand-dark">{isEditing ? 'Redigera kort' : 'Nytt kort'}</h2>
          <button onClick={onClose} className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {!canManageCards && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Nyheter kan bara sparas när du är inloggad med en CORE-användare.
            </div>
          )}

          {mutationError && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-status-critical">{mutationError}</p>}

          <label className="block">
            <span className="text-xs font-semibold text-slate-600">Typ</span>
            <select
              value={draft.type}
              onChange={(event) => setDraft({ ...draft, type: event.target.value as ContentCardType })}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-mint"
            >
              {TYPE_OPTIONS.map((option) => (
                <option key={option.type} value={option.type}>{option.label}</option>
              ))}
            </select>
          </label>

          <div>
            <label className="block">
              <span className="text-xs font-semibold text-slate-600">Titel *</span>
              <input
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-mint ${titleError ? 'border-red-400' : 'border-slate-200'}`}
              />
            </label>
            {titleError && <p className="mt-1 text-xs text-status-critical">{titleError}</p>}
          </div>

          <label className="block">
            <span className="text-xs font-semibold text-slate-600">Text</span>
            <textarea
              value={draft.body}
              onChange={(event) => setDraft({ ...draft, body: event.target.value })}
              rows={4}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-mint"
            />
          </label>

          <div>
            <label className="block">
              <span className="text-xs font-semibold text-slate-600">Bild-URL</span>
              <input
                value={draft.image_url}
                onChange={(event) => setDraft({ ...draft, image_url: event.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-mint"
              />
            </label>
            {draft.image_url.trim() && (
              <img
                src={draft.image_url.trim()}
                alt="Förhandsvisning"
                className="mt-2 h-32 w-full rounded-xl border border-slate-100 object-cover"
                onError={(event) => { (event.target as HTMLImageElement).style.display = 'none' }}
                onLoad={(event) => { (event.target as HTMLImageElement).style.display = 'block' }}
              />
            )}
          </div>

          <div className="space-y-2">
            <label className="block">
              <span className="text-xs font-semibold text-slate-600">Länk-typ</span>
              <select
                value={draft.link_type}
                onChange={(event) => setDraft({ ...draft, link_type: event.target.value as LinkType })}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-mint"
              >
                {LINK_TYPE_OPTIONS.map((option) => (
                  <option key={option.type} value={option.type}>{option.label}</option>
                ))}
              </select>
            </label>
            <p className="text-xs text-slate-400">
              Detta styr vad som händer när kortet trycks i appen. Påverkar inte hemsidans nyhetsflöde.
            </p>
          </div>

          {draft.link_type === 'course' && (
            <div>
              <label className="block">
                <span className="text-xs font-semibold text-slate-600">Kurs</span>
                <select
                  value={draft.course_event_id}
                  onChange={(event) => setDraft({ ...draft, course_event_id: event.target.value })}
                  disabled={eventsQuery.isLoading}
                  className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-mint disabled:bg-slate-50 disabled:text-slate-400 ${destinationError ? 'border-red-400' : 'border-slate-200'}`}
                >
                  <option value="">{eventsQuery.isLoading ? 'Hämtar kurser…' : 'Välj kurs…'}</option>
                  {courseOptions.map((event) => (
                    <option key={event.id} value={event.id}>{event.name}</option>
                  ))}
                </select>
              </label>
              {destinationError && <p className="mt-1 text-xs text-status-critical">{destinationError}</p>}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {draft.link_type === 'external' && (
              <Input label="Länk-URL" value={draft.link_url} onChange={(link_url) => setDraft({ ...draft, link_url })} />
            )}
            <Input label="Länktext" value={draft.link_label} onChange={(link_label) => setDraft({ ...draft, link_label })} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold text-slate-600">Visas från</span>
              <input
                type="datetime-local"
                value={draft.starts_at}
                onChange={(event) => setDraft({ ...draft, starts_at: event.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-mint"
              />
            </label>
            <div>
              <label className="block">
                <span className="text-xs font-semibold text-slate-600">Visas till</span>
                <input
                  type="datetime-local"
                  value={draft.expires_at}
                  disabled={draft.noEndDate}
                  onChange={(event) => setDraft({ ...draft, expires_at: event.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-mint disabled:bg-slate-50 disabled:text-slate-400"
                />
              </label>
              <label className="mt-2 flex items-center gap-2 text-xs font-medium text-slate-600">
                <input
                  type="checkbox"
                  checked={draft.noEndDate}
                  onChange={(event) => setDraft({ ...draft, noEndDate: event.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-brand-forest focus:ring-brand-mint"
                />
                Ingen slutdag
              </label>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="mt-1 flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={draft.published}
                onChange={(event) => setDraft({ ...draft, published: event.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-brand-forest focus:ring-brand-mint"
              />
              Publicerad
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-600">Sorteringsordning</span>
              <input
                type="number"
                value={draft.sort_order}
                onChange={(event) => setDraft({ ...draft, sort_order: event.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-mint"
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={draft.show_on_web}
                onChange={(event) => setDraft({ ...draft, show_on_web: event.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-brand-forest focus:ring-brand-mint"
              />
              Visa på webben
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={draft.show_on_app}
                onChange={(event) => setDraft({ ...draft, show_on_app: event.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-brand-forest focus:ring-brand-mint"
              />
              Visa i appen
            </label>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={card?.push_sent_at ? true : draft.send_push}
                disabled={Boolean(card?.push_sent_at)}
                onChange={(event) => setDraft({ ...draft, send_push: event.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-brand-forest focus:ring-brand-mint disabled:opacity-60"
              />
              Skicka pushnotis när kortet publiceras
            </label>
            {card?.push_sent_at ? (
              <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-brand-forest">
                <CheckCircle className="h-3.5 w-3.5" />
                Notis skickad {formatTime(card.push_sent_at)}
              </p>
            ) : (
              <p className="mt-1.5 text-xs text-slate-400">
                Notisen skickas automatiskt inom ~15 minuter efter att kortet publiceras, till alla som har notiser för nyheter aktiverat.
              </p>
            )}
          </div>

          <button
            onClick={handleSave}
            disabled={!canManageCards || saving}
            className="inline-flex items-center gap-2 rounded-full bg-brand-dark px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-forest disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Spara
          </button>
        </div>
      </div>
    </div>
  )
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-600">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-mint"
      />
    </label>
  )
}

function Th({ children }: { children?: React.ReactNode }) {
  return <th className="whitespace-nowrap px-5 py-3 text-left text-xs font-semibold text-slate-600">{children}</th>
}

function PushIndicator({ card }: { card: ContentCard }) {
  if (!card.send_push) return <span className="text-xs text-slate-300">—</span>

  if (card.push_sent_at) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-forest">
        <CheckCircle className="h-3.5 w-3.5" />
        Skickad
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-identity-sky px-2.5 py-0.5 text-xs font-semibold text-brand-dark">
      🔔 Push
    </span>
  )
}

function PlatformIndicator({ card }: { card: ContentCard }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={card.show_on_web ? 'text-slate-600' : 'text-slate-300'} title={card.show_on_web ? 'Visas på webben' : 'Visas inte på webben'}>
        🌐 Webb
      </span>
      <span className={card.show_on_app ? 'text-slate-600' : 'text-slate-300'} title={card.show_on_app ? 'Visas i appen' : 'Visas inte i appen'}>
        📱 App
      </span>
    </span>
  )
}

function StatusBadge({ status }: { status: CardStatus }) {
  const config = STATUS_CONFIG[status]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${config.className}`}>
      <span aria-hidden>{config.emoji}</span>
      {config.label}
    </span>
  )
}

function computeStatus(card: ContentCard): CardStatus {
  const now = new Date()
  const startsAt = new Date(card.starts_at)
  const expiresAt = card.expires_at ? new Date(card.expires_at) : null

  if (!card.published) return 'draft'
  if (expiresAt && expiresAt < now) return 'expired'
  if (startsAt > now) return 'upcoming'
  return 'active'
}

function toDraft(card: ContentCard | null): CardDraft {
  if (!card) {
    return {
      type: 'news',
      title: '',
      body: '',
      image_url: '',
      link_url: '',
      link_label: '',
      link_type: 'external',
      course_event_id: '',
      starts_at: toDatetimeLocal(new Date().toISOString()),
      expires_at: '',
      noEndDate: true,
      published: false,
      sort_order: '0',
      send_push: false,
      show_on_web: true,
      show_on_app: true,
    }
  }

  const { link_type, course_event_id } = parseAppDestination(card.app_destination)

  return {
    type: card.type,
    title: card.title,
    body: card.body ?? '',
    image_url: card.image_url ?? '',
    link_url: card.link_url ?? '',
    link_label: card.link_label ?? '',
    link_type,
    course_event_id,
    starts_at: toDatetimeLocal(card.starts_at),
    expires_at: card.expires_at ? toDatetimeLocal(card.expires_at) : '',
    noEndDate: !card.expires_at,
    published: card.published,
    sort_order: String(card.sort_order),
    send_push: card.send_push,
    show_on_web: card.show_on_web,
    show_on_app: card.show_on_app,
  }
}

function parseAppDestination(value: string | null): { link_type: LinkType; course_event_id: string } {
  if (value === 'kurser' || value === 'schema') return { link_type: value, course_event_id: '' }
  if (value?.startsWith('course:')) return { link_type: 'course', course_event_id: value.slice('course:'.length) }
  return { link_type: 'external', course_event_id: '' }
}

function toDatetimeLocal(iso: string): string {
  const date = new Date(iso)
  const offset = date.getTimezoneOffset()
  const local = new Date(date.getTime() - offset * 60000)
  return local.toISOString().slice(0, 16)
}

function fromDatetimeLocal(value: string): string {
  return new Date(value).toISOString()
}

function formatDateTime(value: string): string {
  try {
    return format(parseISO(value), 'd MMM yyyy HH:mm', { locale: sv })
  } catch {
    return value
  }
}

function formatTime(value: string): string {
  try {
    return format(parseISO(value), 'HH:mm', { locale: sv })
  } catch {
    return value
  }
}

function errorMessage(error: unknown): string | null {
  if (!error) return null
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message
  return 'Kunde inte spara kortet. Kontrollera Supabase-behörigheter och försök igen.'
}
