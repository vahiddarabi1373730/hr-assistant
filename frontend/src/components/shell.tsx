import { useEffect, useState, type FormEvent, type ReactNode } from "react"
import { Link, useLocation, useNavigate } from "react-router"
import { ArrowLeft, BriefcaseBusiness, CalendarDays, ChevronLeft, Columns3, FileText, Inbox, Leaf, LogOut, Menu, Sparkles, Users, type LucideIcon } from "lucide-react"
import { useAuth } from "@/auth"
import { NotificationBell } from "@/components/notification-bell"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { createOrganization, fetchIngestionSettings, logout, persianError } from "@/lib/api"

export function Wordmark() {
  return <div className="wordmark">
    <span className="wordmark-symbol"><Leaf size={24} strokeWidth={1.7} aria-hidden="true" /></span>
    <div><strong>دستیار منابع انسانی</strong><small>همراه تیم، از جذب تا استخدام</small></div>
  </div>
}

const navigation: { path: string; title: string; icon: LucideIcon; adminOnly?: boolean }[] = [
  { path: "/board", title: "برد استخدام", icon: Columns3 },
  { path: "/roles", title: "فرصت‌های شغلی", icon: BriefcaseBusiness },
  { path: "/rankings", title: "تطابق کاندیداها", icon: Sparkles },
  { path: "/candidates", title: "بانک کاندیداها", icon: Users },
  { path: "/resumes", title: "رزومه‌های دریافت‌شده", icon: FileText },
  { path: "/review", title: "صف بازبینی", icon: Inbox },
  { path: "/events", title: "رویدادهای سازمانی", icon: CalendarDays },
  { path: "/settings/users", title: "کاربران و دسترسی‌ها", icon: Users, adminOnly: true },
]

export function AppShell({ children }: { children: ReactNode }) {
  const { me, refresh, selectOrganization } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [creatingOrg, setCreatingOrg] = useState(false)
  const [createOrgOpen, setCreateOrgOpen] = useState(false)
  const [orgName, setOrgName] = useState("")
  const [createOrgError, setCreateOrgError] = useState<string | null>(null)
  const [logoutError, setLogoutError] = useState(false)
  const [reviewCount, setReviewCount] = useState<number | null>(null)
  useEffect(() => {
    let active = true
    const load = () => {
      fetchIngestionSettings().then(data => { if (active) setReviewCount(data.review_count) })
        .catch(() => { if (active) setReviewCount(null) })
    }
    load()
    window.addEventListener("ingestion-changed", load)
    window.addEventListener("focus", load)
    return () => {
      active = false
      window.removeEventListener("ingestion-changed", load)
      window.removeEventListener("focus", load)
    }
  }, [])
  async function signOut() {
    setLeaving(true)
    try { await logout(); await refresh(); navigate("/login") }
    catch { setLogoutError(true) }
    finally { setLeaving(false) }
  }

  async function createWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = orgName.trim()
    if (!trimmed) {
      setCreateOrgError("نام فضای کاری را وارد کنید.")
      return
    }
    setCreatingOrg(true)
    setCreateOrgError(null)
    try {
      const org = await createOrganization(trimmed)
      window.localStorage.setItem("active-organization-id", org.id)
      await refresh()
      setCreateOrgOpen(false)
      setOrgName("")
    } catch (error) {
      setCreateOrgError(persianError(error))
    } finally {
      setCreatingOrg(false)
    }
  }

  const current = navigation.find(item => pathname === item.path || pathname.startsWith(item.path + "/"))
  const visibleNavigation = navigation.filter(item => !item.adminOnly || me?.role === "admin")
  const pageTitle = pathname === "/upload" ? "بارگذاری رزومه" : current?.title ?? "فضای کار استخدام"
  const menu = <nav className="workspace-nav" aria-label="منوی اصلی">
    {visibleNavigation.map(({ path, title, icon: Icon }, index) => <div key={path}>
      {index === 0 && <p className="nav-group-label">استخدام و جذب</p>}
      {index === 3 && <p className="nav-group-label">مدیریت کاندیداها</p>}
      {index === 6 && <p className="nav-group-label">فضای کار</p>}
      <Link className="nav-link" to={path} onClick={() => setOpen(false)} aria-current={pathname === path || pathname.startsWith(path + "/") ? "page" : undefined}>
        <Icon aria-hidden="true" /><span>{title}</span>
        {path === "/review" && reviewCount !== null && reviewCount > 0 && <span className="nav-count">{reviewCount.toLocaleString("fa-IR")}</span>}
      </Link>
    </div>)}
  </nav>
  const account = <div className="sidebar-user">
    <span className="sidebar-avatar"><Users size={18} aria-hidden="true" /></span>
    <div className="min-w-0 flex-1">{me && me.organizations.length > 1
      ? <Select value={me.org.id} onValueChange={value => { if (value) void selectOrganization(value) }}>
        <SelectTrigger size="sm" className="w-full border-0 px-0"><SelectValue>{me.org.name}</SelectValue></SelectTrigger>
        <SelectContent><SelectGroup>{me.organizations.map(org => <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>)}</SelectGroup></SelectContent>
      </Select>
      : <strong>{me?.org.name}</strong>}
      <small dir="ltr">{me?.email}</small></div>
    <Button variant="ghost" size="icon-sm" disabled={leaving} onClick={() => void signOut()} aria-label={logoutError ? "تلاش دوباره برای خروج" : "خروج از حساب"} title={logoutError ? "خروج ناموفق بود؛ دوباره تلاش کنید" : "خروج از حساب"}><LogOut /></Button>
  </div>
  return <div className="app-layout">
    <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:start-2 focus:z-50 focus:bg-card focus:p-3">رفتن به محتوای اصلی</a>
    <aside className="workspace-sidebar">
      <Link to="/board" aria-label="صفحه اصلی"><Wordmark /></Link>
      {menu}
      <div className="sidebar-bottom">
        {account}
      <Button variant="secondary" size="sm" className="mt-2 w-full" onClick={() => setCreateOrgOpen(true)}>
        ایجاد فضای کاری جدید
      </Button>
    </div>
    </aside>
    <div className="workspace-body">
      <header className="workspace-header">
        <div className="workspace-breadcrumb"><Button variant="ghost" size="icon" className="mobile-menu-button" onClick={() => setOpen(true)} aria-label="باز کردن منو"><Menu /></Button><span>{me?.org.name ?? "فضای کار"}</span><ChevronLeft size={14} className="hidden sm:block" aria-hidden="true" /><strong>{pageTitle}</strong></div>
        <div className="header-actions">
          <Button variant="ghost" size="sm" render={<Link to="/review" />} nativeButton={false} className="header-review"><Inbox data-icon="inline-start" />بازبینی {reviewCount === null ? "" : reviewCount.toLocaleString("fa-IR")}</Button>
          <NotificationBell />
        </div>
      </header>
      <main id="main-content" className="workspace-main">{children}</main>
    </div>
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="w-[min(300px,90vw)] p-0" aria-describedby={undefined}>
        <div className="mobile-navigation"><SheetTitle className="sr-only">منوی فضای کار استخدام</SheetTitle><Wordmark />{menu}<div className="mt-auto">{account}<Button variant="secondary" size="sm" className="mt-2 w-full" onClick={() => setCreateOrgOpen(true)}>ایجاد فضای کاری جدید</Button><Button variant="secondary" render={<Link to="/upload" onClick={() => setOpen(false)} />} nativeButton={false} className="mt-5 w-full">بارگذاری رزومه<ArrowLeft data-icon="inline-end" /></Button></div></div>
      </SheetContent>
    </Sheet>
    <Dialog
      open={createOrgOpen}
      onOpenChange={nextOpen => {
        if (!creatingOrg) {
          setCreateOrgOpen(nextOpen)
          if (!nextOpen) {
            setCreateOrgError(null)
            setOrgName("")
          }
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>ایجاد فضای کاری جدید</DialogTitle>
          <DialogDescription>برای حساب شما یک فضای کاری مستقل ایجاد می‌شود و شما مدیر آن خواهید بود.</DialogDescription>
        </DialogHeader>
        <form onSubmit={event => void createWorkspace(event)}>
          <FieldGroup>
            {createOrgError && <Alert variant="destructive"><AlertDescription>{createOrgError}</AlertDescription></Alert>}
            <Field data-invalid={createOrgError !== null}>
              <FieldLabel htmlFor="new-workspace-name">نام فضای کاری</FieldLabel>
              <Input
                id="new-workspace-name"
                autoFocus
                autoComplete="organization"
                value={orgName}
                onChange={event => {
                  setOrgName(event.target.value)
                  if (createOrgError) setCreateOrgError(null)
                }}
                aria-invalid={createOrgError !== null}
                required
              />
            </Field>
          </FieldGroup>
          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" disabled={creatingOrg} onClick={() => setCreateOrgOpen(false)}>انصراف</Button>
            <Button type="submit" disabled={creatingOrg}>{creatingOrg ? "در حال ایجاد…" : "ایجاد فضای کاری"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </div>
}
