import { useEffect, useState } from "react"
import { useParams } from "react-router"
import { Alert, Box, Button, CircularProgress, Paper, Stack, Typography } from "@/components/ui-compat"
import { persianError } from "@/lib/api"
import { formatJalali } from "@/lib/jalali"

type Booking = { title: string; candidate_name: string; status: string; duration_minutes: number; slots: { id: string; starts_at: string; ends_at: string }[]; interviewers: { name: string }[] }

export function BookingPage() {
  const { token = "" } = useParams()
  const [booking, setBooking] = useState<Booking | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmed, setConfirmed] = useState<{ meet_url: string | null; starts_at: string } | null>(null)
  useEffect(() => { fetch(`/api/public/bookings/${encodeURIComponent(token)}`).then(async response => { if (!response.ok) throw new Error(); return response.json() }).then(setBooking).catch(() => setError("این لینک رزرو معتبر نیست یا دیگر در دسترس نیست.")) }, [token])
  async function choose(slotId: string) {
    setBusy(true); setError(null)
    try {
      const response = await fetch(`/api/public/bookings/${encodeURIComponent(token)}/confirm`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slot_id: slotId }) })
      if (!response.ok) throw new Error()
      setConfirmed(await response.json())
    } catch (cause) { setError(persianError(cause)) } finally { setBusy(false) }
  }
  return <Box sx={{ minHeight: "100svh", display: "grid", placeItems: "center", p: 2, bgcolor: "#f8fafc" }} dir="rtl">
    <Paper sx={{ width: "min(100%, 620px)", p: { xs: 3, sm: 5 }, borderTop: "4px solid var(--primary)" }}>
      {!booking && !error && <CircularProgress aria-label="بارگذاری زمان‌های مصاحبه" />}
      {error && <Alert severity="error">{error}</Alert>}
      {confirmed && <Stack spacing={2}><Typography variant="h4">زمان مصاحبه ثبت شد</Typography><Typography>دعوت‌نامهٔ تقویم برای شما و مصاحبه‌کنندگان ارسال شده است.</Typography><Typography>{formatJalali(confirmed.starts_at)}</Typography>{confirmed.meet_url && <Button variant="contained" component="a" href={confirmed.meet_url}>ورود به Google Meet</Button>}</Stack>}
      {booking && !confirmed && <Stack spacing={3}><Box><Typography variant="h4">{booking.title}</Typography><Typography color="text.secondary" sx={{ mt: 1 }}>سلام {booking.candidate_name}، یکی از زمان‌ها را برای مصاحبه انتخاب کنید.</Typography></Box><Typography variant="body2">مدت: {booking.duration_minutes.toLocaleString("fa-IR")} دقیقه · مصاحبه‌کنندگان: {booking.interviewers.map(person => person.name).join("، ") || "تیم جذب"}</Typography>{booking.status !== "open" ? <Alert severity="info">این نوبت قبلاً رزرو یا بسته شده است.</Alert> : <Stack spacing={1}>{booking.slots.map(slot => <Button key={slot.id} variant="outlined" disabled={busy} onClick={() => void choose(slot.id)} sx={{ justifyContent: "space-between", py: 2 }}>{formatJalali(slot.starts_at)} <span>انتخاب</span></Button>)}</Stack>}</Stack>}
    </Paper>
  </Box>
}
