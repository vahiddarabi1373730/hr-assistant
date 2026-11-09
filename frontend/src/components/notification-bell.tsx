import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router"
import { Bell, RefreshCw } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty"
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import { fetchNotifications, persianError, setNotificationRead, type InAppNotification } from "@/lib/api"
import { formatJalali } from "@/lib/jalali"

export function NotificationBell() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<{ items: InAppNotification[]; unread_count: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const load = useCallback(async (signal?: AbortSignal) => {
    try { const result = await fetchNotifications(signal); if (!signal?.aborted) { setData(result); setError(null) } }
    catch (cause) { if (!signal?.aborted) setError(persianError(cause)) }
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    const refresh = () => void load(controller.signal)
    refresh()
    window.addEventListener("focus", refresh)
    window.addEventListener("notifications-changed", refresh)
    const timer = window.setInterval(refresh, 60000)
    return () => { controller.abort(); window.clearInterval(timer); window.removeEventListener("focus", refresh); window.removeEventListener("notifications-changed", refresh) }
  }, [load])
  async function update(item: InAppNotification, read: boolean, open = false) {
    setBusy(item.id); setError(null)
    try {
      await setNotificationRead(item.id, read)
      await load()
      // Accept only the server's narrow, structured internal Candidate deep-link shape.
      if (open && item.href && (/^\/candidates\/[0-9a-f-]{36}\?tab=notes(?:&[a-z]+=[0-9a-f-]{36})*$/.test(item.href) || /^\/events\/[0-9a-f-]{36}$/.test(item.href))) {
        setOpen(false); navigate(item.href)
      }
    } catch (cause) { setError(persianError(cause)) } finally { setBusy(null) }
  }

  return <Popover open={open} onOpenChange={value => { setOpen(value); if (value) void load() }}>
    <PopoverTrigger render={<Button variant="ghost" size="icon" />} aria-label={`اعلان‌ها؛ ${data?.unread_count ?? 0} خوانده‌نشده`}>
      <Bell />
      {Boolean(error || data?.unread_count) && <Badge variant="default" className="absolute -end-1 -top-1 min-w-4 justify-center px-1 text-[10px]">{error ? "!" : data!.unread_count.toLocaleString("fa-IR")}</Badge>}
    </PopoverTrigger>
    <PopoverContent align="end" className="notification-panel p-0">
      <div className="flex items-center justify-between p-5"><PopoverTitle>اعلان‌های شما</PopoverTitle><Button variant="ghost" size="icon-sm" onClick={() => void load()} aria-label="تازه‌سازی اعلان‌ها"><RefreshCw /></Button></div>
      <Separator />
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {!data && !error && <div className="grid place-items-center p-8"><Spinner aria-label="بارگذاری اعلان‌ها" /></div>}
      {data && !data.items.length && <Empty className="py-10"><EmptyHeader><EmptyMedia variant="icon"><Bell /></EmptyMedia><EmptyTitle>همه‌چیز را دیده‌اید</EmptyTitle><EmptyDescription>اشاره همکاران و رویدادهای جدید اینجا نمایش داده می‌شوند.</EmptyDescription></EmptyHeader></Empty>}
      {data?.items.map(item => <article key={item.id} className="border-b p-5" style={{ background: item.read_at ? "var(--card)" : "var(--accent)" }}>
        <p className="text-xs font-semibold">{item.kind === "note_mention" ? "در یک یادداشت به شما اشاره شده است" : item.kind === "event_reminder" ? "رویداد سازمانی شما به‌زودی شروع می‌شود" : "رویداد جدید در درخواست شغلی"}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">{formatJalali(item.created_at)} / {item.read_at ? "خوانده‌شده" : "خوانده‌نشده"}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {item.href && <Button variant="outline" size="sm" disabled={Boolean(busy)} onClick={() => void update(item, true, true)}>{item.kind === "event_reminder" ? "مشاهدهٔ رویداد" : "مشاهده یادداشت"}</Button>}
          <Button variant="ghost" size="sm" disabled={Boolean(busy)} onClick={() => void update(item, !item.read_at)}>{item.read_at ? "خوانده‌نشده" : "خواندم"}</Button>
        </div>
      </article>)}
    </PopoverContent>
  </Popover>
}
