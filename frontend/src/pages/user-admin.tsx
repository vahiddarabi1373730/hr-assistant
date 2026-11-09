import { useCallback, useEffect, useState, type FormEvent } from "react"
import { Navigate, useSearchParams } from "react-router"
import { Check, Clock3, Mail, RefreshCw, Shield, UserRoundPlus, UserX, UsersRound } from "lucide-react"
import { useAuth } from "@/auth"
import {
  Alert,
  AlertDescription,
} from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  ApiError,
  connectSystemMailbox,
  deactivateUser,
  fetchAdminUsers,
  fetchSystemMailbox,
  inviteUser,
  persianError,
  requestEmailVerification,
  resendInvitation,
  type AdminInvitation,
  type AdminUser,
  type AdminUsers,
  type Me,
  type SystemMailbox,
} from "@/lib/api"

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium" }).format(new Date(value))
}

function fetchUserAdminData(): Promise<[AdminUsers, SystemMailbox]> {
  return Promise.all([fetchAdminUsers(), fetchSystemMailbox()])
}

export function UserAdminPage() {
  const { me } = useAuth()
  if (!me || me.role !== "admin") return <Navigate to="/board" replace />
  return <AdminUsersSettings currentUser={me} />
}

function AdminUsersSettings({ currentUser }: { currentUser: Me }) {
  const [searchParams] = useSearchParams()
  const [users, setUsers] = useState<AdminUsers | null>(null)
  const [mailbox, setMailbox] = useState<SystemMailbox | null>(null)
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [busyInvitation, setBusyInvitation] = useState<string | null>(null)
  const [deactivating, setDeactivating] = useState<AdminUser | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const callbackResult = searchParams.get("mailbox")
  const callbackReason = searchParams.get("reason")
  const callbackError = callbackResult === "error"
    ? callbackReason
      ? persianError(new ApiError(400, callbackReason))
      : "اتصال به صندوق سازمان انجام نشد."
    : null
  const callbackNotice = callbackResult === "connected" ? "صندوق سازمان با موفقیت متصل شد." : null

  const load = useCallback(async () => {
    try {
      const [userData, mailboxData] = await fetchUserAdminData()
      setUsers(userData)
      setMailbox(mailboxData)
    } catch (cause) {
      setError(persianError(cause))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    fetchUserAdminData()
      .then(([userData, mailboxData]) => {
        if (active) {
          setUsers(userData)
          setMailbox(mailboxData)
        }
      })
      .catch(cause => { if (active) setError(persianError(cause)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  async function submitInvite(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await inviteUser(email)
      setEmail("")
      setNotice("دعوت‌نامه از صندوق سازمان فرستاده شد.")
      await load()
    } catch (cause) {
      setError(persianError(cause))
    } finally {
      setBusy(false)
    }
  }

  async function connectMailbox() {
    setBusy(true)
    setError(null)
    try {
      const url = await connectSystemMailbox()
      window.location.assign(url)
    } catch (cause) {
      setError(persianError(cause))
      setBusy(false)
    }
  }

  async function resend(invitation: AdminInvitation) {
    setBusyInvitation(invitation.id)
    setError(null)
    setNotice(null)
    try {
      await resendInvitation(invitation.id)
      setNotice(`دعوت‌نامه برای ${invitation.email} دوباره فرستاده شد.`)
      await load()
    } catch (cause) {
      setError(persianError(cause))
    } finally {
      setBusyInvitation(null)
    }
  }

  async function deactivate() {
    if (!deactivating) return
    setBusy(true)
    setError(null)
    try {
      await deactivateUser(deactivating.id)
      setNotice(`حساب ${deactivating.email} غیرفعال شد؛ سوابق او حفظ شده‌اند.`)
      setDeactivating(null)
      await load()
    } catch (cause) {
      setError(persianError(cause))
    } finally {
      setBusy(false)
    }
  }

  async function sendVerification() {
    if (loading || !mailbox?.connected) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await requestEmailVerification(currentUser.email)
      setNotice(`پیوند تأیید از صندوق سازمان به ${currentUser.email} فرستاده شد.`)
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === "SYSTEM_MAILBOX_NOT_CONNECTED") {
        setMailbox({ connected: false, email: null })
      }
      setError(persianError(cause))
    } finally {
      setBusy(false)
    }
  }

  return <>
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-semibold">کاربران و دسترسی‌ها</h1><p className="mt-1 text-sm text-muted-foreground">دعوت همکاران، مدیریت عضویت و تنظیم صندوق رایانامهٔ سازمان.</p></div>
      <Button variant="outline" onClick={() => { setLoading(true); setError(null); void load() }} disabled={loading}><RefreshCw data-icon="inline-start" />تازه‌سازی</Button>
    </div>
    {(error || callbackError) && <Alert variant="destructive" className="mb-4"><AlertDescription>{error ?? callbackError}</AlertDescription></Alert>}
    {(notice || callbackNotice) && <Alert className="mb-4"><Check aria-hidden="true" /><AlertDescription>{notice ?? callbackNotice}</AlertDescription></Alert>}
    {!currentUser.is_verified && <Alert className="mb-4"><Mail aria-hidden="true" /><AlertDescription className="flex flex-wrap items-center justify-between gap-3">
      <div><p>رایانامهٔ حساب مدیر هنوز تأیید نشده است.</p>
        <p id="verification-mailbox-help" className="mt-1 text-sm">{loading
          ? "در حال بررسی اتصال صندوق سازمان…"
          : mailbox?.connected
            ? `پیوند تأیید به رایانامهٔ حساب شما، ${currentUser.email}، ارسال می‌شود.`
            : "ابتدا در بخش «صندوق رایانامهٔ سازمان»، دکمهٔ «اتصال صندوق Google» را بزنید و اجازهٔ ارسال ایمیل را بدهید؛ سپس ارسال پیوند تأیید فعال می‌شود."}</p>
      </div>
      <Button variant="outline" size="sm" onClick={() => void sendVerification()} disabled={busy || loading || !mailbox?.connected} aria-describedby="verification-mailbox-help">ارسال پیوند تأیید</Button>
    </AlertDescription></Alert>}

    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Mail aria-hidden="true" />صندوق رایانامهٔ سازمان</CardTitle>
          <CardDescription>دعوت‌ها، تأیید رایانامه و بازیابی گذرواژه از این حساب Gmail ارسال می‌شوند.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {mailbox?.connected
            ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
              <div><p className="text-sm font-medium">متصل است</p><p className="mt-1 text-sm text-muted-foreground" dir="ltr">{mailbox.email}</p></div>
              <Badge variant="secondary">فعال</Badge>
            </div>
            : <Alert><Shield aria-hidden="true" /><AlertDescription>برای ارسال دعوت و پیام‌های حساب، ابتدا یک Gmail سازمانی متصل کنید.</AlertDescription></Alert>}
          <Button variant={mailbox?.connected ? "outline" : "default"} onClick={() => void connectMailbox()} disabled={busy}>
            {busy ? <Spinner data-icon="inline-start" /> : <Mail data-icon="inline-start" />}
            {mailbox?.connected ? "اتصال دوبارهٔ Google" : "اتصال صندوق Google"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><UserRoundPlus aria-hidden="true" />دعوت همکار</CardTitle>
          <CardDescription>عضو دعوت‌شده با پذیرش پیوند، به‌عنوان عضو سازمان وارد می‌شود.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={event => void submitInvite(event)}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="invite-email">رایانامهٔ همکار</FieldLabel>
                <Input id="invite-email" type="email" dir="ltr" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="name@company.com" />
              </Field>
              <Button type="submit" disabled={busy || !mailbox?.connected}>{busy ? <Spinner data-icon="inline-start" /> : <Mail data-icon="inline-start" />}فرستادن دعوت‌نامه</Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>

    <Card className="mt-4">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2"><UsersRound aria-hidden="true" />اعضای سازمان</CardTitle>
          {users && <Badge variant="outline">{users.users.length.toLocaleString("fa-IR")} نفر</Badge>}
        </div>
        <CardDescription>حساب‌های غیرفعال و سوابق کاری آن‌ها حذف نمی‌شوند.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading && !users ? <div className="flex justify-center p-8"><Spinner aria-label="در حال بارگذاری اعضا" /></div>
          : users?.users.length
            ? <Table dir="rtl" className="min-w-[760px] table-fixed [&_th]:text-right">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[36%]">عضو</TableHead>
                  <TableHead className="w-[14%]">دسترسی</TableHead>
                  <TableHead className="w-[22%]">وضعیت حساب</TableHead>
                  <TableHead className="w-[16%]">تاریخ عضویت</TableHead>
                  <TableHead className="w-[12%] text-center">عملیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>{users.users.map(user => <TableRow key={user.id} className={!user.is_active ? "text-muted-foreground" : undefined}>
                <TableCell>
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar><AvatarFallback>{user.email.slice(0, 1).toLocaleUpperCase()}</AvatarFallback></Avatar>
                    <div className="flex min-w-0 flex-col gap-1">
                      <span dir="ltr" className="truncate text-start font-medium">{user.email}</span>
                      {user.id === currentUser.id && <span className="text-xs text-muted-foreground">حساب شما</span>}
                    </div>
                  </div>
                </TableCell>
                <TableCell><Badge variant="outline">{user.role === "admin" ? "مدیر" : "عضو"}</Badge></TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant={user.is_active ? "secondary" : "outline"}>{user.is_active ? "فعال" : "غیرفعال"}</Badge>
                    {user.is_active && <Badge variant={user.is_verified ? "outline" : "destructive"}>{user.is_verified ? "ایمیل تأییدشده" : "تأییدنشده"}</Badge>}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">{formatDate(user.joined_at)}</TableCell>
                <TableCell className="text-center">{user.is_active && user.id !== currentUser.id
                  ? <Button variant="ghost" size="sm" onClick={() => setDeactivating(user)} aria-label={`غیرفعال‌سازی ${user.email}`} title="غیرفعال‌سازی عضو"><UserX data-icon="inline-start" />غیرفعال‌سازی</Button>
                  : <span className="text-muted-foreground">—</span>}</TableCell>
              </TableRow>)}</TableBody>
            </Table>
            : <p className="py-6 text-center text-sm text-muted-foreground">عضوی برای نمایش وجود ندارد.</p>}
      </CardContent>
    </Card>

    {Boolean(users?.invitations.length) && <Card className="mt-4">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2"><Clock3 aria-hidden="true" />دعوت‌های در انتظار</CardTitle>
          <Badge variant="outline">{users?.invitations.length.toLocaleString("fa-IR")} دعوت</Badge>
        </div>
        <CardDescription>دعوت‌ها پس از ۷ روز منقضی می‌شوند؛ در صورت نیاز می‌توانید دوباره ارسالشان کنید.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table dir="rtl" className="min-w-[700px] table-fixed [&_th]:text-right">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[42%]">دعوت‌شده</TableHead>
              <TableHead className="w-[22%]">وضعیت دعوت</TableHead>
              <TableHead className="w-[20%]">تاریخ انقضا</TableHead>
              <TableHead className="w-[16%] text-center">عملیات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>{users?.invitations.map(invitation => <TableRow key={invitation.id}>
            <TableCell>
              <div className="flex min-w-0 items-center gap-3">
                <Avatar><AvatarFallback><Mail aria-hidden="true" /></AvatarFallback></Avatar>
                <span dir="ltr" className="truncate text-start font-medium">{invitation.email}</span>
              </div>
            </TableCell>
            <TableCell>
              <Badge variant={invitation.expired ? "destructive" : "secondary"}>
                {invitation.expired ? "منقضی‌شده" : "در انتظار پذیرش"}
              </Badge>
            </TableCell>
            <TableCell className="text-muted-foreground">{formatDate(invitation.expires_at)}</TableCell>
            <TableCell className="text-center">
              <Button variant="outline" size="sm" onClick={() => void resend(invitation)} disabled={busyInvitation === invitation.id || !mailbox?.connected}>
                {busyInvitation === invitation.id ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}ارسال دوباره
              </Button>
            </TableCell>
          </TableRow>)}</TableBody>
        </Table>
      </CardContent>
    </Card>}

    <Dialog open={Boolean(deactivating)} onOpenChange={open => { if (!open && !busy) setDeactivating(null) }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>غیرفعال‌سازی حساب عضو</DialogTitle>
          <DialogDescription>ورود این عضو و دسترسی Google او لغو می‌شود. عضویت و سوابق قبلی برای حفظ انتساب‌ها باقی می‌مانند.</DialogDescription>
        </DialogHeader>
        <p dir="ltr" className="text-sm">{deactivating?.email}</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDeactivating(null)} disabled={busy}>بازگشت</Button>
          <Button variant="destructive" onClick={() => void deactivate()} disabled={busy}>{busy && <Spinner data-icon="inline-start" />}غیرفعال‌کردن حساب</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>
}
