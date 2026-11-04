import { useEffect, useState } from "react"
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Stack, TextField, Typography } from "@/components/ui-compat"
import { connectGoogle, createInterview, fetchGoogleConnection, fetchInterviews, persianError, sendInterviewInvitation, type Interview } from "@/lib/api"

type Person = { name: string; email: string }
type Slot = { starts_at: string; ends_at: string }

function localDate(hoursFromNow: number) {
  const date = new Date(Date.now() + hoursFromNow * 3_600_000)
  date.setMinutes(0, 0, 0)
  return date.toISOString().slice(0, 16)
}

export function InterviewSchedulerDialog({ applicationId, candidateName, open, onClose }: { applicationId: string | null; candidateName: string; open: boolean; onClose: () => void }) {
  const [connected, setConnected] = useState<boolean | null>(null)
  const [interviews, setInterviews] = useState<Interview[]>([])
  const [title, setTitle] = useState("مصاحبهٔ تخصصی")
  const [duration, setDuration] = useState("60")
  const [slots, setSlots] = useState<Slot[]>([{ starts_at: localDate(48), ends_at: localDate(49) }, { starts_at: localDate(72), ends_at: localDate(73) }])
  const [people, setPeople] = useState<Person[]>([{ name: "", email: "" }])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [bookingUrl, setBookingUrl] = useState<string | null>(null)
  const load = async () => {
    if (!applicationId) return
    const [google, scheduled] = await Promise.all([fetchGoogleConnection(), fetchInterviews(applicationId)])
    setConnected(google.connected); setInterviews(scheduled.items)
  }
  useEffect(() => { if (open) void load().catch(cause => setError(persianError(cause))) }, [open, applicationId])
  async function authorize() {
    setBusy(true); setError(null)
    try { window.location.assign((await connectGoogle()).authorization_url) } catch (cause) { setError(persianError(cause)); setBusy(false) }
  }
  async function create() {
    if (!applicationId) return
    setBusy(true); setError(null)
    try {
      const result = await createInterview(applicationId, { title, duration_minutes: Number(duration), slots: slots.map(slot => ({ starts_at: new Date(slot.starts_at).toISOString(), ends_at: new Date(slot.ends_at).toISOString() })), interviewers: people.filter(person => person.name.trim() && person.email.trim()) })
      setBookingUrl(result.booking_url ?? null); await load()
    } catch (cause) { setError(persianError(cause)) } finally { setBusy(false) }
  }
  async function send(interview: Interview) {
    setBusy(true); setError(null)
    try { const result = await sendInterviewInvitation(interview.id); setBookingUrl(result.booking_url); await load() } catch (cause) { setError(persianError(cause)) } finally { setBusy(false) }
  }
  return <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="md">
    <DialogTitle>برنامه‌ریزی مصاحبه برای {candidateName}</DialogTitle>
    <DialogContent><Stack spacing={3} sx={{ pt: 1 }}>
      {error && <Alert severity="error">{error}</Alert>}
      {connected === false && <Alert severity="warning" action={<Button disabled={busy} onClick={() => void authorize()}>اتصال Google</Button>}>ابتدا حساب Google خود را متصل کنید تا دعوت‌نامه و Google Meet ساخته شود.</Alert>}
      {connected && <Typography variant="body2" color="text.secondary">۲ تا ۴ زمان پیشنهادی ثبت می‌شود. دعوت‌نامه فقط با انتخاب صریح «ارسال دعوت‌نامه» فرستاده خواهد شد.</Typography>}
      {bookingUrl && <Alert severity="success">لینک رزرو آماده است: <a href={bookingUrl} target="_blank" rel="noreferrer">باز کردن صفحهٔ رزرو</a></Alert>}
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <TextField label="عنوان مصاحبه" value={title} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setTitle(event.target.value)} />
        <TextField label="مدت (دقیقه)" type="number" value={duration} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setDuration(event.target.value)} />
      </Stack>
      <Divider />
      <Typography variant="h6">زمان‌های پیشنهادی</Typography>
      {slots.map((slot, index) => <Stack key={index} direction={{ xs: "column", sm: "row" }} spacing={1}>
        <TextField label={`شروع ${index + 1}`} type="datetime-local" value={slot.starts_at} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setSlots(previous => previous.map((item, i) => i === index ? { ...item, starts_at: event.target.value } : item))} />
        <TextField label="پایان" type="datetime-local" value={slot.ends_at} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setSlots(previous => previous.map((item, i) => i === index ? { ...item, ends_at: event.target.value } : item))} />
        {slots.length > 2 && <Button variant="outlined" onClick={() => setSlots(previous => previous.filter((_, i) => i !== index))}>حذف</Button>}
      </Stack>)}
      {slots.length < 4 && <Button variant="outlined" onClick={() => setSlots(previous => [...previous, { starts_at: localDate(96), ends_at: localDate(97) }])}>افزودن زمان</Button>}
      <Divider />
      <Typography variant="h6">مصاحبه‌کنندگان</Typography>
      {people.map((person, index) => <Stack key={index} direction={{ xs: "column", sm: "row" }} spacing={1}>
        <TextField label="نام" value={person.name} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setPeople(previous => previous.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} />
        <TextField label="ایمیل" type="email" value={person.email} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setPeople(previous => previous.map((item, i) => i === index ? { ...item, email: event.target.value } : item))} />
        {people.length > 1 && <Button variant="outlined" onClick={() => setPeople(previous => previous.filter((_, i) => i !== index))}>حذف</Button>}
      </Stack>)}
      <Button variant="outlined" onClick={() => setPeople(previous => [...previous, { name: "", email: "" }])}>افزودن مصاحبه‌کننده</Button>
      {interviews.length > 0 && <><Divider /><Typography variant="h6">مصاحبه‌های ثبت‌شده</Typography>{interviews.map(interview => <Stack key={interview.id} direction="row" spacing={1} sx={{ justifyContent: "space-between", alignItems: "center", borderBottom: 1, borderColor: "divider", pb: 1 }}><Typography>{interview.title} · {interview.status === "open" ? "در انتظار رزرو" : "رزرو شده"}</Typography>{interview.status === "open" && <Button disabled={busy || !connected} size="small" onClick={() => void send(interview)}>ارسال دعوت‌نامه</Button>}</Stack>)}</>}
    </Stack></DialogContent>
    <DialogActions sx={{ p: 3 }}><Button disabled={busy} onClick={onClose}>بستن</Button><Button variant="contained" disabled={busy || !connected || !title.trim() || slots.length < 2} onClick={() => void create()}>{busy ? "در حال ثبت…" : "ساخت صفحهٔ رزرو"}</Button></DialogActions>
  </Dialog>
}
