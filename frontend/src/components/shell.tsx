import { useEffect, useState, type ReactNode } from "react"
import { Link, useLocation, useNavigate } from "react-router"
import { ArrowLeft, BriefcaseBusiness, ChevronLeft, Columns3, FileText, Inbox, Leaf, LogOut, Menu, Plus, Search, Settings, Users } from "lucide-react"
import { useAuth } from "@/auth"
import { NotificationBell } from "@/components/notification-bell"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { fetchIngestionSettings, logout } from "@/lib/api"

export function Wordmark() {
  return <div className="wordmark">
    <span className="wordmark-symbol"><Leaf size={24} strokeWidth={1.7} aria-hidden="true" /></span>
    <div><strong>دستیار منابع انسانی</strong><small>همراه تیم، از جذب تا استخدام</small></div>
  </div>
}

const navigation = [
  { path: "/search", title: "جست‌وجوی کاندیدا", icon: Search },
  { path: "/board", title: "برد استخدام", icon: Columns3 },
  { path: "/roles", title: "فرصت‌های شغلی", icon: BriefcaseBusiness },
  { path: "/candidates", title: "بانک کاندیداها", icon: Users },
  { path: "/resumes", title: "رزومه‌های دریافت‌شده", icon: FileText },
  { path: "/review", title: "صف بازبینی", icon: Inbox },
  { path: "/settings/ingestion", title: "تنظیمات دریافت", icon: Settings },
]

export function AppShell({ children }: { children: ReactNode }) {
  const { me, refresh } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const [leaving, setLeaving] = useState(false)
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
  const current = navigation.find(item => pathname === item.path || pathname.startsWith(item.path + "/"))
  const pageTitle = pathname === "/upload" ? "بارگذاری رزومه" : current?.title ?? "فضای کار استخدام"
  const menu = <nav className="workspace-nav" aria-label="منوی اصلی">
    {navigation.map(({ path, title, icon: Icon }, index) => <div key={path}>
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
    <div className="min-w-0 flex-1"><strong>{me?.org.name}</strong><small dir="ltr">{me?.email}</small></div>
    <Button variant="ghost" size="icon-sm" disabled={leaving} onClick={() => void signOut()} aria-label={logoutError ? "تلاش دوباره برای خروج" : "خروج از حساب"} title={logoutError ? "خروج ناموفق بود؛ دوباره تلاش کنید" : "خروج از حساب"}><LogOut /></Button>
  </div>
  return <div className="app-layout">
    <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:start-2 focus:z-50 focus:bg-card focus:p-3">رفتن به محتوای اصلی</a>
    <aside className="workspace-sidebar">
      <Link to="/search" aria-label="صفحه اصلی"><Wordmark /></Link>
      {menu}
      <div className="sidebar-bottom">
        <div className="sidebar-hint"><strong>رزومه جدید دریافت کرده‌اید؟</strong><p>به بانک کاندیداها اضافه‌اش کنید.</p><Button variant="secondary" size="sm" render={<Link to="/upload" />} nativeButton={false} className="mt-3 w-full"><Plus data-icon="inline-start" />بارگذاری رزومه</Button></div>
        {account}
      </div>
    </aside>
    <div className="workspace-body">
      <header className="workspace-header">
        <div className="workspace-breadcrumb"><Button variant="ghost" size="icon" className="mobile-menu-button" onClick={() => setOpen(true)} aria-label="باز کردن منو"><Menu /></Button><span>{me?.org.name ?? "فضای کار"}</span><ChevronLeft size={14} className="hidden sm:block" aria-hidden="true" /><strong>{pageTitle}</strong></div>
        <div className="header-actions">
          <Button variant="ghost" size="sm" render={<Link to="/review" />} nativeButton={false} className="header-review"><Inbox data-icon="inline-start" />بازبینی {reviewCount === null ? "" : reviewCount.toLocaleString("fa-IR")}</Button>
          <NotificationBell />
          {pathname !== "/search" && <Button variant="outline" size="sm" render={<Link to="/search" />} nativeButton={false} aria-label="جست‌وجوی کاندیدا"><Search /><span className="hidden sm:inline">جست‌وجو</span></Button>}
        </div>
      </header>
      <main id="main-content" className="workspace-main">{children}</main>
    </div>
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="w-[min(300px,90vw)] p-0" aria-describedby={undefined}>
        <div className="mobile-navigation"><SheetTitle className="sr-only">منوی فضای کار استخدام</SheetTitle><Wordmark />{menu}<div className="mt-auto">{account}<Button variant="secondary" render={<Link to="/upload" onClick={() => setOpen(false)} />} nativeButton={false} className="mt-5 w-full">بارگذاری رزومه<ArrowLeft data-icon="inline-end" /></Button></div></div>
      </SheetContent>
    </Sheet>
  </div>
}
