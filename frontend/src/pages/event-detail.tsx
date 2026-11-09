import { useCallback, useEffect, useState, type FormEvent } from "react"
import { Link, useParams } from "react-router"
import { ArrowRight, Check, ClipboardList, Copy, Link2, Mail, Plus, Trash2, Users } from "lucide-react"
import { useAuth } from "@/auth"
import { EventEditor, EventField, EventSelect } from "@/components/event-editor"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty"
import { FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { PipelineOwner } from "@/lib/api"
import {
  addEventGuest, addEventTask, changeEventStatus, createInvitationLink, eventDateTime,
  eventError, eventStatusLabels, fetchEvent, fetchEventMembers, removeEventGuest,
  removeEventTask, responseLabels, setAttendance, setTaskDone,
  type EventDetail, type EventGuest, type EventStatus,
} from "@/lib/events"

export function EventDetailPage() {
  const { eventId } = useParams()
  return <EventDetailView key={eventId} eventId={eventId!} />
}

function EventDetailView({ eventId }: { eventId: string }) {
  const { me } = useAuth()
  const [event, setEvent] = useState<EventDetail | null>(null)
  const [members, setMembers] = useState<PipelineOwner[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [editing, setEditing] = useState(false)
  const [guestName, setGuestName] = useState("")
  const [guestEmail, setGuestEmail] = useState("")
  const [taskTitle, setTaskTitle] = useState("")
  const [taskOwner, setTaskOwner] = useState("none")
  const [taskDue, setTaskDue] = useState("")
  const [invitation, setInvitation] = useState<{ url: string; guest: EventGuest } | null>(null)
  const [copyMessage, setCopyMessage] = useState("")
  const [confirmation, setConfirmation] = useState<{ title: string; description: string; run: () => Promise<unknown> } | null>(null)
  const load = useCallback(async (signal?: AbortSignal) => {
    const [detail, people] = await Promise.all([fetchEvent(eventId, signal), fetchEventMembers(signal)])
    if (!signal?.aborted) { setEvent(detail); setMembers(people.items); setError(null) }
  }, [eventId])
  useEffect(() => { const controller = new AbortController(); void Promise.resolve().then(() => load(controller.signal)).catch(cause => { if (!controller.signal.aborted) setError(eventError(cause)) }); return () => controller.abort() }, [load])
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer) }, [])
  async function perform(action: () => Promise<unknown>) {
    setBusy(true); setError(null)
    try { await action(); await load(); setConfirmation(null) }
    catch (cause) { setError(eventError(cause)) }
    finally { setBusy(false) }
  }
  function transition(status: EventStatus) {
    if (!event) return
    setConfirmation({
      title: status === "published" ? "انتشار رویداد" : status === "cancelled" ? "لغو رویداد" : "ثبت پایان رویداد",
      description: status === "published" ? "پاسخ‌دادن مهمان‌ها از طریق لینک شخصی فعال می‌شود. دعوت‌نامه‌ای خودکار ارسال نمی‌شود و یادآوری داخلی برای برگزارکننده فعال خواهد شد." : status === "cancelled" ? "پاسخ‌دادن و ثبت بازخورد غیرفعال می‌شود. اطلاعات مهمان‌ها و سابقهٔ رویداد باقی می‌ماند." : "رویداد به بخش برگزارشده منتقل می‌شود و برنامه و چک‌لیست دیگر قابل ویرایش نخواهند بود.",
      run: () => changeEventStatus(event, status),
    })
  }
  async function addGuest(e: FormEvent) {
    e.preventDefault()
    await perform(async () => { await addEventGuest(eventId, { name: guestName, email: guestEmail }); setGuestName(""); setGuestEmail("") })
  }
  async function addTask(e: FormEvent) {
    e.preventDefault()
    await perform(async () => {
      await addEventTask(eventId, { title: taskTitle, assignee_id: taskOwner === "none" ? null : taskOwner, due_at: taskDue ? new Date(taskDue).toISOString() : null })
      setTaskTitle(""); setTaskDue("")
    })
  }
  if (!event) return <div className="flex flex-col gap-4">{error ? <Alert variant="destructive"><AlertDescription>{error}<Button variant="ghost" onClick={() => void load().catch(cause => setError(eventError(cause)))}>تلاش دوباره</Button></AlertDescription></Alert> : <Spinner aria-label="بارگذاری رویداد" />}</div>
  const active = event.status === "draft" || event.status === "published"
  const manage = event.can_manage
  const accepted = event.guests.filter(guest => guest.response === "accepted").length
  const ratings = event.guests.flatMap(guest => guest.rating === null ? [] : [guest.rating])
  const invitationBody = invitation ? `سلام ${invitation.guest.name}،\nبرای «${event.title}» دعوت هستید.\n${eventDateTime(event.starts_at)}\n${event.location}\nلطفاً از لینک شخصی زیر حضور خود را مشخص کنید:\n${invitation.url}` : ""
  return <div className="mx-auto flex max-w-6xl flex-col gap-6">
    <Button variant="ghost" className="w-fit" render={<Link to="/events" />} nativeButton={false}><ArrowRight data-icon="inline-start" />همهٔ رویدادها</Button>
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><div className="mb-2 flex flex-wrap items-center gap-3"><h1 className="text-2xl font-bold break-words">{event.title}</h1><Badge variant={event.status === "published" ? "default" : "secondary"}>{eventStatusLabels[event.status]}</Badge></div><p className="text-muted-foreground">{eventDateTime(event.starts_at)} تا {eventDateTime(event.ends_at)}</p><p className="mt-1 text-muted-foreground break-words">{event.location || "محل برگزاری مشخص نشده"}</p></div>
      {manage && active && <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => setEditing(true)}>ویرایش رویداد</Button>{event.status === "draft" ? <Button disabled={busy} onClick={() => transition("published")}>انتشار رویداد</Button> : <Button disabled={busy || new Date(event.ends_at).getTime() > now} onClick={() => transition("completed")}>ثبت برگزاری</Button>}<Button variant="ghost" disabled={busy} onClick={() => transition("cancelled")}>لغو رویداد</Button></div>}
    </header>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    {event.status === "draft" && <Alert><AlertDescription>این رویداد پیش‌نویس است. پس از تکمیل برنامه، آن را منتشر کنید تا ساخت لینک دعوت فعال شود.</AlertDescription></Alert>}
    <div className="grid gap-6 lg:grid-cols-[1fr_290px]">
      <div className="flex min-w-0 flex-col gap-6">
        {event.description && <section className="rounded-xl border bg-card p-5"><h2 className="mb-2 font-semibold">دربارهٔ رویداد</h2><p className="whitespace-pre-wrap break-words text-muted-foreground">{event.description}</p></section>}
        <section className="overflow-hidden rounded-xl border bg-card" aria-labelledby="event-guests-title">
          <div className="flex items-center gap-2 border-b p-5"><Users size={18} aria-hidden="true" /><h2 id="event-guests-title" className="font-semibold">مهمان‌ها</h2><Badge variant="secondary">{event.guests.length.toLocaleString("fa-IR")}</Badge></div>
          {manage && active && <form onSubmit={addGuest} className="border-b p-5"><FieldGroup className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"><EventField id="guest-name" label="نام مهمان"><Input id="guest-name" required maxLength={160} value={guestName} onChange={e => setGuestName(e.target.value)} disabled={busy} /></EventField><EventField id="guest-email" label="ایمیل"><Input id="guest-email" required type="email" dir="ltr" maxLength={320} value={guestEmail} onChange={e => setGuestEmail(e.target.value)} disabled={busy} /></EventField><Button type="submit" disabled={busy}><Plus data-icon="inline-start" />افزودن مهمان</Button></FieldGroup></form>}
          {!event.guests.length ? <Empty><EmptyHeader><EmptyTitle>هنوز مهمانی اضافه نشده</EmptyTitle><EmptyDescription>نام و ایمیل مهمان‌ها را ثبت کنید؛ هر مهمان لینک پاسخ مخصوص خودش را خواهد داشت.</EmptyDescription></EmptyHeader></Empty> : <Table><TableHeader><TableRow><TableHead>مهمان</TableHead><TableHead>پاسخ دعوت</TableHead><TableHead>حضور</TableHead>{manage && <TableHead>مدیریت</TableHead>}</TableRow></TableHeader><TableBody>{event.guests.map(guest => <TableRow key={guest.id}>
            <TableCell><p>{guest.name}</p><p dir="ltr" className="text-xs text-muted-foreground">{guest.email}</p></TableCell><TableCell><Badge variant={guest.response === "accepted" ? "default" : "secondary"}>{responseLabels[guest.response]}</Badge></TableCell><TableCell>{manage && event.status !== "cancelled" && new Date(event.starts_at).getTime() <= now && guest.response === "accepted" ? <Button variant="ghost" size="sm" disabled={busy} onClick={() => void perform(() => setAttendance(eventId, guest.id, !guest.attended))}>{guest.attended ? <Check data-icon="inline-start" /> : null}{guest.attended ? "حاضر" : "ثبت حضور"}</Button> : guest.attended ? "حاضر" : "—"}</TableCell>
            {manage && <TableCell><div className="flex gap-1">{["published", "completed"].includes(event.status) && <Button variant="outline" size="sm" disabled={busy} onClick={() => void perform(async () => { const link = await createInvitationLink(eventId, guest.id); setInvitation({ ...link, guest }); setCopyMessage("") })}><Link2 data-icon="inline-start" />لینک دعوت تازه</Button>}{active && <Button variant="ghost" size="icon-sm" aria-label={`حذف ${guest.name}`} disabled={busy} onClick={() => setConfirmation({ title: "حذف مهمان", description: `«${guest.name}» از فهرست حذف می‌شود و لینک دعوت او از اعتبار می‌افتد.`, run: () => removeEventGuest(eventId, guest.id) })}><Trash2 /></Button>}</div></TableCell>}
          </TableRow>)}</TableBody></Table>}
        </section>
        <section className="rounded-xl border bg-card" aria-labelledby="event-checklist-title"><div className="flex items-center gap-2 border-b p-5"><ClipboardList size={18} aria-hidden="true" /><h2 id="event-checklist-title" className="font-semibold">چک‌لیست برگزاری</h2><span className="text-sm text-muted-foreground">{event.tasks.filter(task => task.done).length.toLocaleString("fa-IR")} از {event.tasks.length.toLocaleString("fa-IR")} انجام‌شده</span></div>
          {manage && active && <form onSubmit={addTask} className="border-b p-5"><FieldGroup><EventField id="task-title" label="کار جدید"><Input id="task-title" required maxLength={300} value={taskTitle} onChange={e => setTaskTitle(e.target.value)} disabled={busy} placeholder="مثلاً هماهنگی پذیرایی" /></EventField><div className="grid gap-3 sm:grid-cols-2"><EventField id="task-owner" label="مسئول"><EventSelect id="task-owner" value={taskOwner} onChange={setTaskOwner} label="مسئول کار" disabled={busy} options={[{ value: "none", label: "بدون مسئول" }, ...members.filter(member => member.active).map(member => ({ value: member.id, label: member.email }))]} /></EventField><EventField id="task-due" label="مهلت انجام (اختیاری)"><Input id="task-due" type="datetime-local" dir="ltr" value={taskDue} onChange={e => setTaskDue(e.target.value)} disabled={busy} /></EventField></div><Button type="submit" className="w-fit" disabled={busy}>افزودن کار</Button></FieldGroup></form>}
          {!event.tasks.length && <p className="p-5 text-sm text-muted-foreground">کارهای آماده‌سازی، مسئول هر کار و مهلت انجام را اینجا ثبت کنید.</p>}
          <ul>{event.tasks.map(task => <li key={task.id} className="flex items-start justify-between gap-3 border-b p-5 last:border-b-0"><div className="flex min-w-0 items-start gap-3"><Button variant={task.done ? "secondary" : "outline"} size="icon-sm" aria-label={`${task.done ? "بازگشایی" : "تکمیل"} ${task.title}`} aria-pressed={task.done} disabled={busy || !active || (!manage && task.assignee_id !== me?.id)} onClick={() => void perform(() => setTaskDone(eventId, task.id, !task.done))}>{task.done ? <Check /> : <span aria-hidden="true">○</span>}</Button><div><p className={task.done ? "line-through text-muted-foreground" : "break-words"}>{task.title}</p><p className="mt-1 text-xs text-muted-foreground">{members.find(member => member.id === task.assignee_id)?.email ?? "بدون مسئول"}{task.due_at && ` · ${eventDateTime(task.due_at)}`}</p></div></div>{manage && active && <Button variant="ghost" size="icon-sm" disabled={busy} aria-label={`حذف کار ${task.title}`} onClick={() => setConfirmation({ title: "حذف کار", description: `«${task.title}» از چک‌لیست حذف شود؟`, run: () => removeEventTask(eventId, task.id) })}><Trash2 /></Button>}</li>)}</ul>
        </section>
        {ratings.length > 0 && <section className="rounded-xl border bg-card p-5"><h2 className="font-semibold">بازخورد مهمان‌ها</h2><p className="mt-1 text-sm text-muted-foreground">میانگین {(ratings.reduce((sum, value) => sum + value, 0) / ratings.length).toLocaleString("fa-IR", { maximumFractionDigits: 1 })} از ۵ · {ratings.length.toLocaleString("fa-IR")} پاسخ</p><ul>{event.guests.filter(guest => guest.rating !== null).map(guest => <li className="mt-4 border-t pt-4" key={guest.id}><p>{guest.name} · {guest.rating?.toLocaleString("fa-IR")} از ۵</p><p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{guest.feedback || "بدون توضیح"}</p></li>)}</ul></section>}
      </div>
      <aside className="flex flex-col gap-5"><section className="rounded-xl border bg-card p-5"><h2 className="mb-4 font-semibold">در یک نگاه</h2><dl className="flex flex-col gap-4"><div><dt className="text-sm text-muted-foreground">تأیید حضور</dt><dd className="text-2xl font-semibold">{accepted.toLocaleString("fa-IR")} <span className="text-sm font-normal text-muted-foreground">{event.capacity === null ? "نفر، بدون محدودیت ظرفیت" : `از ${event.capacity.toLocaleString("fa-IR")} نفر`}</span></dd></div><div><dt className="text-sm text-muted-foreground">بودجهٔ برنامه‌ریزی‌شده</dt><dd>{event.budget_toman === null ? "تعیین نشده" : `${event.budget_toman.toLocaleString("fa-IR")} تومان`}</dd></div><div><dt className="text-sm text-muted-foreground">برگزارکننده</dt><dd className="break-all">{members.find(member => member.id === event.organiser_id)?.email ?? "عضو پیشین سازمان"}</dd></div></dl></section><p className="text-sm text-muted-foreground">مهمان با لینک شخصی و بدون ساخت حساب پاسخ می‌دهد. ساخت لینک تازه، لینک قبلی همان مهمان را باطل می‌کند. یادآوری ۲۴ ساعت و ۱ ساعت قبل، برای برگزارکننده داخل برنامه نمایش داده می‌شود.</p></aside>
    </div>
    {editing && <EventEditor event={event} onClose={() => setEditing(false)} onSaved={result => { setEvent(result); setEditing(false) }} />}
    <Dialog open={Boolean(confirmation)} onOpenChange={open => { if (!open && !busy) setConfirmation(null) }}><DialogContent showCloseButton={!busy}><DialogHeader><DialogTitle>{confirmation?.title}</DialogTitle><DialogDescription>{confirmation?.description}</DialogDescription></DialogHeader>{error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}<div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setConfirmation(null)}>انصراف</Button><Button disabled={busy} onClick={() => confirmation && void perform(confirmation.run)}>{busy && <Spinner data-icon="inline-start" />}تأیید</Button></div></DialogContent></Dialog>
    <Dialog open={Boolean(invitation)} onOpenChange={open => { if (!open) setInvitation(null) }}><DialogContent><DialogHeader><DialogTitle>دعوت {invitation?.guest.name}</DialogTitle><DialogDescription>این لینک شخصی است؛ فقط برای همین مهمان بفرستید. لینک قبلی او باطل شده است.</DialogDescription></DialogHeader><Input readOnly dir="ltr" aria-label="لینک شخصی دعوت" value={invitation?.url ?? ""} onFocus={e => e.currentTarget.select()} /><div className="flex flex-wrap gap-2"><Button onClick={async () => { try { await navigator.clipboard.writeText(invitationBody); setCopyMessage("متن دعوت و لینک کپی شد.") } catch { setCopyMessage("کپی خودکار ممکن نشد؛ لینک را از کادر بالا انتخاب و کپی کنید.") } }}><Copy data-icon="inline-start" />کپی دعوت‌نامه</Button><Button variant="outline" render={<a href={`mailto:${encodeURIComponent(invitation?.guest.email ?? "")}?subject=${encodeURIComponent(`دعوت به ${event.title}`)}&body=${encodeURIComponent(invitationBody)}`} />} nativeButton={false}><Mail data-icon="inline-start" />بازکردن در ایمیل</Button></div>{copyMessage && <p role="status" className="text-sm">{copyMessage}</p>}</DialogContent></Dialog>
  </div>
}
