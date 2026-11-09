import { useEffect, useState, type FormEvent } from "react"
import { useParams } from "react-router"
import { CalendarDays, Check } from "lucide-react"
import { EventField, EventSelect } from "@/components/event-editor"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { eventDateTime, eventError, fetchInvitation, respondToEvent, responseLabels, submitEventFeedback, type PublicInvitation } from "@/lib/events"

export function EventRSVPPage() {
  const { token } = useParams()
  return <RSVPView key={token} token={token!} />
}

function RSVPView({ token }: { token: string }) {
  const [invitation, setInvitation] = useState<PublicInvitation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [rating, setRating] = useState("5")
  const [feedback, setFeedback] = useState("")
  useEffect(() => {
    const controller = new AbortController()
    fetchInvitation(token, controller.signal).then(data => {
      if (!controller.signal.aborted) { setInvitation(data); setRating(String(data.rating ?? 5)); setFeedback(data.feedback ?? "") }
    }).catch(cause => { if (!controller.signal.aborted) setError(eventError(cause)) })
    return () => controller.abort()
  }, [token])
  async function perform(action: () => Promise<PublicInvitation>, message: string) {
    setBusy(true); setError(null); setMessage("")
    try { setInvitation(await action()); setMessage(message) }
    catch (cause) { setError(eventError(cause)) }
    finally { setBusy(false) }
  }
  async function sendFeedback(e: FormEvent) {
    e.preventDefault()
    await perform(() => submitEventFeedback(token, Number(rating), feedback), "بازخورد شما ثبت شد. ممنون که همراه ما بودید.")
  }
  return <main className="mx-auto flex min-h-svh max-w-2xl flex-col justify-center gap-6 px-5 py-12">
    <meta name="referrer" content="no-referrer" /><meta name="robots" content="noindex, nofollow" />
    <div className="flex items-center gap-2 text-sm text-muted-foreground"><CalendarDays size={20} aria-hidden="true" />دعوت به رویداد</div>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    {!invitation && !error && <Spinner aria-label="بارگذاری دعوت‌نامه" />}
    {invitation && <><header><p className="mb-3 text-muted-foreground">{invitation.guest_name} عزیز،</p><h1 className="text-3xl font-bold break-words">{invitation.title}</h1><p className="mt-5">{eventDateTime(invitation.starts_at)}</p><p className="mt-1 text-sm text-muted-foreground">پایان: {eventDateTime(invitation.ends_at)}</p>{invitation.location && <p className="mt-3 break-words">{invitation.location}</p>}</header>
      {invitation.description && <p className="whitespace-pre-wrap break-words text-muted-foreground">{invitation.description}</p>}
      {invitation.status === "cancelled" ? <Alert><AlertDescription>برگزارکننده این رویداد را لغو کرده است.</AlertDescription></Alert> : <section className="flex flex-col gap-5 rounded-xl border bg-card p-6"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">پاسخ شما به دعوت</h2><Badge variant={invitation.response === "accepted" ? "default" : "secondary"}>{responseLabels[invitation.response]}</Badge></div>{invitation.can_respond ? <><p className="text-sm text-muted-foreground">تا پیش از شروع رویداد می‌توانید پاسخ خود را تغییر دهید.</p><div className="flex flex-wrap gap-3"><Button disabled={busy || invitation.response === "accepted"} onClick={() => void perform(() => respondToEvent(token, "accepted"), "حضور شما تأیید شد.")}><Check data-icon="inline-start" />شرکت می‌کنم</Button><Button variant="outline" disabled={busy || invitation.response === "declined"} onClick={() => void perform(() => respondToEvent(token, "declined"), "پاسخ شما ثبت شد.")}>شرکت نمی‌کنم</Button></div></> : <p className="text-sm text-muted-foreground">مهلت تغییر پاسخ به دعوت پایان یافته است.</p>}</section>}
      {invitation.can_feedback && <section className="rounded-xl border bg-card p-6"><h2 className="mb-4 font-semibold">تجربهٔ شما از این رویداد</h2><form onSubmit={sendFeedback}><FieldGroup><EventField id="event-rating" label="امتیاز شما از ۵"><EventSelect id="event-rating" label="امتیاز رویداد" value={rating} onChange={setRating} disabled={busy} options={[1, 2, 3, 4, 5].map(value => ({ value: String(value), label: `${value.toLocaleString("fa-IR")} از ۵` }))} /></EventField><EventField id="event-feedback" label="چه چیزی خوب بود و چه چیزی بهتر شود؟" description="بازخورد با نام شما برای تیم برگزارکننده قابل مشاهده است."><Textarea id="event-feedback" value={feedback} onChange={e => setFeedback(e.target.value)} maxLength={2000} disabled={busy} /></EventField><Button disabled={busy} type="submit">{invitation.rating ? "ویرایش بازخورد" : "ثبت بازخورد"}</Button></FieldGroup></form></section>}
      {busy && <Spinner aria-label="ثبت پاسخ" />}{message && <p role="status">{message}</p>}
      <p className="text-xs text-muted-foreground">این دعوت‌نامه شخصی است و برای پاسخ‌دادن نیازی به ساخت حساب ندارید. زمان‌ها در منطقهٔ زمانی دستگاه شما نمایش داده می‌شوند.</p>
    </>}
  </main>
}
