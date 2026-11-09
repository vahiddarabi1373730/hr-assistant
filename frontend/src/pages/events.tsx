import { useCallback, useEffect, useState } from "react"
import { Link, useNavigate } from "react-router"
import { ArrowLeft, CalendarDays, MapPin, Plus } from "lucide-react"
import { EventEditor, EventSelect } from "@/components/event-editor"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { eventDateTime, eventError, eventStatusLabels, fetchEvents, type OrganisationalEvent } from "@/lib/events"

export function EventsPage() {
  const [events, setEvents] = useState<OrganisationalEvent[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState("all")
  const navigate = useNavigate()
  const load = useCallback(async (signal?: AbortSignal) => {
    try { const result = await fetchEvents(signal); if (!signal?.aborted) { setEvents(result.items); setError(null) } }
    catch (cause) { if (!signal?.aborted) setError(eventError(cause)) }
  }, [])
  useEffect(() => { const controller = new AbortController(); void Promise.resolve().then(() => load(controller.signal)); return () => controller.abort() }, [load])
  const visible = events?.filter(event => (status === "all" || event.status === status) && `${event.title} ${event.location}`.includes(query.trim())).sort((a, b) => {
    const terminalA = ["completed", "cancelled"].includes(a.status)
    const terminalB = ["completed", "cancelled"].includes(b.status)
    return Number(terminalA) - Number(terminalB) || (terminalA ? b.starts_at.localeCompare(a.starts_at) : a.starts_at.localeCompare(b.starts_at))
  })
  return <div className="mx-auto flex max-w-5xl flex-col gap-7">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-bold">رویدادهای سازمانی</h1></div>
      <Button onClick={() => setCreating(true)}><Plus data-icon="inline-start" />رویداد جدید</Button>
    </div>
    <div className="grid gap-3 sm:grid-cols-[1fr_200px]"><Input aria-label="جست‌وجوی رویداد" placeholder="جست‌وجو در عنوان یا محل رویداد…" value={query} onChange={e => setQuery(e.target.value)} /><EventSelect value={status} onChange={setStatus} label="وضعیت رویداد" options={[{ value: "all", label: "همهٔ وضعیت‌ها" }, ...Object.entries(eventStatusLabels).map(([value, label]) => ({ value, label }))]} /></div>
    {error && <Alert variant="destructive"><AlertDescription>{error}<Button variant="ghost" onClick={() => void load()}>تلاش دوباره</Button></AlertDescription></Alert>}
    {!events && !error && <Spinner aria-label="بارگذاری رویدادها" />}
    {visible?.length === 0 && <Empty className="border py-16"><EmptyHeader><EmptyMedia variant="icon"><CalendarDays /></EmptyMedia><EmptyTitle>{events?.length ? "رویدادی با این فیلتر پیدا نشد" : "رویدادی ثبت نشده"}</EmptyTitle></EmptyHeader>{!events?.length && <Button onClick={() => setCreating(true)}>ساخت اولین رویداد</Button>}</Empty>}
    {Boolean(visible?.length) && <div className="overflow-hidden rounded-xl border bg-card">{visible?.map(event => {
      const date = new Date(event.starts_at)
      return <article key={event.id} className="grid gap-5 border-b p-5 last:border-b-0 sm:grid-cols-[80px_1fr_auto] sm:items-center sm:p-6">
        <div className="flex items-baseline gap-2 sm:flex-col sm:items-center sm:gap-0"><span className="text-3xl font-semibold tabular-nums">{new Intl.DateTimeFormat("fa-IR", { day: "numeric" }).format(date)}</span><span className="text-sm text-muted-foreground">{new Intl.DateTimeFormat("fa-IR", { month: "long", year: "numeric" }).format(date)}</span></div>
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-3"><Link to={`/events/${event.id}`} className="font-semibold hover:underline">{event.title}</Link><Badge variant={event.status === "published" ? "default" : "secondary"}>{eventStatusLabels[event.status]}</Badge></div><p className="mt-2 text-sm text-muted-foreground">{eventDateTime(event.starts_at)}</p><div className="mt-2 flex flex-wrap gap-4 text-sm text-muted-foreground">{event.location && <span className="flex items-center gap-1"><MapPin size={14} aria-hidden="true" />{event.location}</span>}<span>{event.accepted_count.toLocaleString("fa-IR")} تأیید حضور از {event.guest_count.toLocaleString("fa-IR")} دعوت{event.capacity !== null && ` · ظرفیت ${event.capacity.toLocaleString("fa-IR")} نفر`}</span></div></div>
        <Button variant="outline" render={<Link to={`/events/${event.id}`} />} nativeButton={false}>جزئیات رویداد<ArrowLeft data-icon="inline-end" /></Button>
      </article>
    })}</div>}
    {creating && <EventEditor onClose={() => setCreating(false)} onSaved={event => navigate(`/events/${event.id}`)} />}
  </div>
}
