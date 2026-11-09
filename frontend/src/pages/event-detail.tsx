import { useCallback, useEffect, useState, type FormEvent } from "react"
import { Link, useParams } from "react-router"
import { ArrowRight, Check, Copy, Link2, Mail, Search, Trash2, Users } from "lucide-react"
import { EventEditor } from "@/components/event-editor"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldContent, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ApiError, type PipelineOwner } from "@/lib/api"
import {
  changeEventStatus, createInvitationLink, eventDateTime, eventError, eventStatusLabels,
  fetchEvent, fetchEventMembers, inviteEventMembers, removeEventGuest, responseLabels,
  setAttendance, type EventDetail, type EventGuest,
} from "@/lib/events"

export function EventDetailPage() {
  const { eventId } = useParams()
  return <EventDetailView key={eventId} eventId={eventId!} />
}

function EventDetailView({ eventId }: { eventId: string }) {
  const [event, setEvent] = useState<EventDetail | null>(null)
  const [members, setMembers] = useState<PipelineOwner[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [editing, setEditing] = useState(false)
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([])
  const [memberSearch, setMemberSearch] = useState("")
  const [memberPickerOpen, setMemberPickerOpen] = useState(false)
  const [invitationResult, setInvitationResult] = useState<{ sent: string[]; failed: { email: string; reason: string }[]; skipped: string[] } | null>(null)
  const [invitation, setInvitation] = useState<{ url: string; guest: EventGuest } | null>(null)
  const [copyMessage, setCopyMessage] = useState("")
  const [confirmation, setConfirmation] = useState<{ title: string; description: string; variant: "default" | "destructive"; run: () => Promise<unknown> } | null>(null)
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
  function transition(status: "completed" | "cancelled") {
    if (!event) return
    setConfirmation({
      title: status === "cancelled" ? "لغو رویداد" : "ثبت برگزاری",
      description: status === "cancelled" ? "رویداد لغو می‌شود و امکان پاسخ‌دادن به دعوت‌ها از بین می‌رود." : "رویداد به‌عنوان برگزارشده ثبت می‌شود.",
      variant: status === "cancelled" ? "destructive" : "default",
      run: () => changeEventStatus(event, status),
    })
  }
  async function sendInvitations(e: FormEvent) {
    e.preventDefault()
    if (!selectedMemberIds.length) return
    setBusy(true)
    setError(null)
    setInvitationResult(null)
    try {
      const result = await inviteEventMembers(eventId, selectedMemberIds)
      setInvitationResult(result)
      const failedEmails = new Set(result.failed.map(item => item.email.toLowerCase()))
      setSelectedMemberIds(members.filter(member => failedEmails.has(member.email.toLowerCase())).map(member => member.id))
      await load()
    } catch (cause) {
      setError(eventError(cause))
    } finally {
      setBusy(false)
    }
  }
  if (!event) return <div className="flex flex-col gap-4">{error ? <Alert variant="destructive"><AlertDescription>{error}<Button variant="ghost" onClick={() => void load().catch(cause => setError(eventError(cause)))}>تلاش دوباره</Button></AlertDescription></Alert> : <Spinner aria-label="بارگذاری رویداد" />}</div>
  const active = event.status === "draft" || event.status === "published"
  const manage = event.can_manage
  const accepted = event.guests.filter(guest => guest.response === "accepted").length
  const acceptedGuests = event.guests.filter(guest => guest.response === "accepted")
  const ratings = event.guests.flatMap(guest => guest.rating === null ? [] : [guest.rating])
  const visibleMembers = members.filter(member => member.active && member.email.toLowerCase().includes(memberSearch.trim().toLowerCase()))
  const selectedMembers = members.filter(member => selectedMemberIds.includes(member.id))
  const invitationBody = invitation ? `سلام ${invitation.guest.name}،\nبرای «${event.title}» دعوت هستید.\n${eventDateTime(event.starts_at)}\n${event.location}\nلطفاً از لینک شخصی زیر حضور خود را مشخص کنید:\n${invitation.url}` : ""
  return <div className="mx-auto flex max-w-6xl flex-col gap-6">
    <Button variant="ghost" className="w-fit" render={<Link to="/events" />} nativeButton={false}><ArrowRight data-icon="inline-start" />همهٔ رویدادها</Button>
    <header className="flex flex-wrap items-start justify-between gap-4">
      {manage && active && <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => setEditing(true)}>ویرایش رویداد</Button><Button disabled={busy || new Date(event.ends_at).getTime() > now} onClick={() => transition("completed")}>ثبت برگزاری</Button><Button variant="destructive" disabled={busy} onClick={() => transition("cancelled")}>لغو رویداد</Button></div>}
    </header>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    <Card>
      <CardHeader>
        <CardAction><Badge variant={event.status === "published" ? "default" : "secondary"}>{eventStatusLabels[event.status]}</Badge></CardAction>
        <CardTitle role="heading" aria-level={1} className="text-xl font-bold break-words">{event.title}</CardTitle>
        {event.description && <CardDescription className="whitespace-pre-wrap break-words">{event.description}</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Separator />
        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
          <div><dt className="text-sm text-muted-foreground">زمان رویداد</dt><dd className="mt-1">{eventDateTime(event.starts_at)} تا {eventDateTime(event.ends_at)}</dd></div>
          <div><dt className="text-sm text-muted-foreground">محل برگزاری</dt><dd className="mt-1 break-words">{event.location || "مشخص نشده"}</dd></div>
          <div><dt className="text-sm text-muted-foreground">تأیید حضور</dt><dd className="mt-1 font-semibold">{accepted.toLocaleString("fa-IR")} <span className="font-normal text-muted-foreground">{event.capacity === null ? "نفر، بدون محدودیت ظرفیت" : `از ${event.capacity.toLocaleString("fa-IR")} نفر`}</span></dd></div>
          <div><dt className="text-sm text-muted-foreground">بودجهٔ برنامه‌ریزی‌شده</dt><dd className="mt-1">{event.budget_toman === null ? "تعیین نشده" : `${event.budget_toman.toLocaleString("fa-IR")} تومان`}</dd></div>
          <div><dt className="text-sm text-muted-foreground">برگزارکننده</dt><dd className="mt-1 break-all">{members.find(member => member.id === event.organiser_id)?.email ?? "عضو پیشین سازمان"}</dd></div>
        </dl>
      </CardContent>
    </Card>
    <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(240px,1fr)]">
        <section className="overflow-hidden rounded-xl border bg-card" aria-labelledby="event-guests-title">
          <div className="flex items-center gap-2 border-b p-5"><Users size={18} aria-hidden="true" /><h2 id="event-guests-title" className="font-semibold">مهمان‌ها</h2><Badge variant="secondary">{event.guests.length.toLocaleString("fa-IR")}</Badge></div>
          {manage && active && <form onSubmit={sendInvitations} className="flex flex-col gap-3 border-b p-5">
            <FieldGroup className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <Field>
                <FieldLabel htmlFor="event-member-select">انتخاب همکاران سازمان</FieldLabel>
                <Popover open={memberPickerOpen} onOpenChange={setMemberPickerOpen}>
                  <PopoverTrigger render={<Button id="event-member-select" type="button" variant="outline" className="w-full justify-between font-normal" disabled={busy} aria-expanded={memberPickerOpen} />}>
                    {selectedMembers.length ? `${selectedMembers.length.toLocaleString("fa-IR")} همکار انتخاب‌شده` : "جست‌وجو و انتخاب همکاران"}
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-[var(--anchor-width)] max-w-[calc(100vw-2rem)]">
                    <div className="relative">
                      <Search className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                      <Input autoFocus value={memberSearch} onChange={event => setMemberSearch(event.target.value)} placeholder="جست‌وجو بر اساس ایمیل" aria-label="جست‌وجوی همکاران" className="ps-9" />
                    </div>
                    <div className="max-h-60 overflow-y-auto">
                      {visibleMembers.length ? <FieldGroup className="gap-1">
                        {visibleMembers.map(member => {
                          const guest = event.guests.find(item => item.email.toLowerCase() === member.email.toLowerCase())
                          const acceptedMember = guest?.response === "accepted"
                          const checked = selectedMemberIds.includes(member.id)
                          return <Field key={member.id} orientation="horizontal" className="rounded-md p-2 hover:bg-muted/50" data-disabled={acceptedMember}>
                            <Checkbox
                              id={`event-member-${member.id}`}
                              checked={checked}
                              disabled={busy || acceptedMember}
                              onCheckedChange={value => setSelectedMemberIds(current => value
                                ? [...current, member.id]
                                : current.filter(id => id !== member.id))}
                            />
                            <FieldContent>
                              <FieldLabel htmlFor={`event-member-${member.id}`} className="min-w-0 flex-col gap-0">
                                <span dir="ltr" className="truncate">{member.email}</span>
                                <span className="text-xs text-muted-foreground">{member.role === "admin" ? "مدیر" : "عضو"}{acceptedMember ? " · حضور را تأیید کرده" : guest ? " · دعوت‌شده" : ""}</span>
                              </FieldLabel>
                            </FieldContent>
                          </Field>
                        })}
                      </FieldGroup> : <p className="p-3 text-center text-sm text-muted-foreground">همکاری با این مشخصات پیدا نشد.</p>}
                    </div>
                  </PopoverContent>
                </Popover>
              </Field>
              <Button type="submit" disabled={busy || selectedMemberIds.length === 0}>
                {busy ? <Spinner data-icon="inline-start" /> : <Mail data-icon="inline-start" />}
                ارسال دعوت‌نامه ایمیلی
              </Button>
            </FieldGroup>
            {invitationResult && <Alert variant={invitationResult.failed.length ? "destructive" : "default"}>
              <AlertDescription>
                {invitationResult.sent.length > 0 && <p>{invitationResult.sent.length.toLocaleString("fa-IR")} دعوت‌نامه ایمیل شد: {invitationResult.sent.join("، ")}</p>}
                {invitationResult.failed.map(item => <p key={item.email}>ارسال به {item.email} ناموفق بود: {eventError(new ApiError(502, item.reason))}</p>)}
                {invitationResult.skipped.length > 0 && <p>این همکاران قبلاً حضور را تأیید کرده‌اند و دوباره دعوت نشدند: {invitationResult.skipped.join("، ")}</p>}
                {!invitationResult.sent.length && !invitationResult.failed.length && invitationResult.skipped.length > 0 && <p>همهٔ همکاران انتخاب‌شده قبلاً حضور را تأیید کرده‌اند.</p>}
              </AlertDescription>
            </Alert>}
          </form>}
          <div className="p-4">
            <div className="max-h-[28rem] overflow-auto rounded-lg">
              {!event.guests.length ? <Empty><EmptyHeader><EmptyTitle>هنوز مهمانی اضافه نشده</EmptyTitle></EmptyHeader></Empty> : <Table dir="rtl" className="min-w-[600px] [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-card [&_th]:text-right [&_td]:text-right"><TableHeader><TableRow><TableHead>مهمان</TableHead><TableHead>پاسخ دعوت</TableHead><TableHead>حضور</TableHead>{manage && <TableHead>مدیریت</TableHead>}</TableRow></TableHeader><TableBody>{event.guests.map(guest => <TableRow key={guest.id}>
                <TableCell><p>{guest.name}</p>{guest.name.trim().toLowerCase() !== guest.email.trim().toLowerCase() && <p dir="ltr" className="text-xs text-muted-foreground">{guest.email}</p>}</TableCell><TableCell><Badge variant={guest.response === "accepted" ? "default" : "secondary"}>{responseLabels[guest.response]}</Badge></TableCell><TableCell>{manage && event.status !== "cancelled" && new Date(event.starts_at).getTime() <= now && guest.response === "accepted" ? <Button variant="ghost" size="sm" disabled={busy} onClick={() => void perform(() => setAttendance(eventId, guest.id, !guest.attended))}>{guest.attended ? <Check data-icon="inline-start" /> : null}{guest.attended ? "حاضر" : "ثبت حضور"}</Button> : guest.attended ? "حاضر" : "—"}</TableCell>
                {manage && <TableCell>{guest.response !== "accepted" && <div className="flex gap-1">{event.status !== "cancelled" && <Button variant="outline" size="sm" disabled={busy} onClick={() => void perform(async () => { const link = await createInvitationLink(eventId, guest.id); setInvitation({ ...link, guest }); setCopyMessage("") })}><Link2 data-icon="inline-start" />لینک دعوت تازه</Button>}{active && <Button variant="ghost" size="icon-sm" aria-label={`حذف ${guest.name}`} disabled={busy} onClick={() => setConfirmation({ title: "حذف مهمان", description: `«${guest.name}» از فهرست حذف می‌شود و لینک دعوت او از اعتبار می‌افتد.`, variant: "default", run: () => removeEventGuest(eventId, guest.id) })}><Trash2 /></Button>}</div>}</TableCell>}
              </TableRow>)}</TableBody></Table>}
            </div>
          </div>
        </section>
        <Card size="sm">
          <CardHeader>
            <CardAction><Badge variant="secondary">{acceptedGuests.length.toLocaleString("fa-IR")}</Badge></CardAction>
            <CardTitle>تأیید حضور</CardTitle>
          </CardHeader>
          <CardContent>
            {acceptedGuests.length ? <ul className="flex flex-wrap gap-2">{acceptedGuests.map(guest => <li key={guest.id}><Badge variant="secondary" className="h-auto border-success/30 bg-success/10 py-1 text-success">{guest.name}</Badge></li>)}</ul> : <p className="text-sm text-muted-foreground">هنوز کسی تأیید نکرده است.</p>}
          </CardContent>
        </Card>
        {ratings.length > 0 && <section className="rounded-xl border bg-card p-5"><h2 className="font-semibold">بازخورد مهمان‌ها</h2><p className="mt-1 text-sm text-muted-foreground">میانگین {(ratings.reduce((sum, value) => sum + value, 0) / ratings.length).toLocaleString("fa-IR", { maximumFractionDigits: 1 })} از ۵ · {ratings.length.toLocaleString("fa-IR")} پاسخ</p><ul>{event.guests.filter(guest => guest.rating !== null).map(guest => <li className="mt-4 border-t pt-4" key={guest.id}><p>{guest.name} · {guest.rating?.toLocaleString("fa-IR")} از ۵</p><p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{guest.feedback || "بدون توضیح"}</p></li>)}</ul></section>}
    </div>
    {editing && <EventEditor event={event} onClose={() => setEditing(false)} onSaved={result => { setEvent(result); setEditing(false) }} />}
    <Dialog open={Boolean(confirmation)} onOpenChange={open => { if (!open && !busy) setConfirmation(null) }}><DialogContent showCloseButton={!busy}><DialogHeader><DialogTitle>{confirmation?.title}</DialogTitle><DialogDescription>{confirmation?.description}</DialogDescription></DialogHeader>{error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}<div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setConfirmation(null)}>انصراف</Button><Button variant={confirmation?.variant} disabled={busy} onClick={() => confirmation && void perform(confirmation.run)}>{busy && <Spinner data-icon="inline-start" />}تأیید</Button></div></DialogContent></Dialog>
    <Dialog open={Boolean(invitation)} onOpenChange={open => { if (!open) setInvitation(null) }}><DialogContent><DialogHeader><DialogTitle>دعوت {invitation?.guest.name}</DialogTitle><DialogDescription>این لینک شخصی است؛ فقط برای همین مهمان بفرستید. لینک قبلی او باطل شده است.</DialogDescription></DialogHeader><Input readOnly dir="ltr" aria-label="لینک شخصی دعوت" value={invitation?.url ?? ""} onFocus={e => e.currentTarget.select()} /><div className="flex flex-wrap gap-2"><Button onClick={async () => { try { await navigator.clipboard.writeText(invitationBody); setCopyMessage("متن دعوت و لینک کپی شد.") } catch { setCopyMessage("کپی خودکار ممکن نشد؛ لینک را از کادر بالا انتخاب و کپی کنید.") } }}><Copy data-icon="inline-start" />کپی دعوت‌نامه</Button><Button variant="outline" render={<a href={`mailto:${encodeURIComponent(invitation?.guest.email ?? "")}?subject=${encodeURIComponent(`دعوت به ${event.title}`)}&body=${encodeURIComponent(invitationBody)}`} />} nativeButton={false}><Mail data-icon="inline-start" />بازکردن در ایمیل</Button></div>{copyMessage && <p role="status" className="text-sm">{copyMessage}</p>}</DialogContent></Dialog>
  </div>
}
