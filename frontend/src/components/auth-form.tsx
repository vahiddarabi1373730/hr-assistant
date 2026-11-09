import { useState, type FormEvent } from "react"
import { Link, useLocation, useNavigate } from "react-router"
import { ShieldCheck } from "lucide-react"
import { useAuth } from "@/auth"
import { login, persianError, signup } from "@/lib/api"
import { Wordmark } from "@/components/shell"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"

export function AuthForm({ registering = false }: { registering?: boolean }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { refresh } = useAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [org, setOrg] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (registering) await signup({ email, password, org_name: org })
      else await login(email, password)
      await refresh()
      const state = location.state
      const requestedPath = typeof state === "object" && state !== null && "from" in state
        ? state.from
        : null
      const destination = typeof requestedPath === "string"
        && requestedPath.startsWith("/")
        && !requestedPath.startsWith("//")
        && requestedPath !== "/login"
        && requestedPath !== "/signup"
        ? requestedPath
        : "/search"
      navigate(destination, { replace: true })
    } catch (cause) {
      setError(persianError(cause))
    } finally {
      setBusy(false)
    }
  }

  return <div className="auth-layout">
    <aside className="auth-aside"><Wordmark /><div className="auth-message"><h2>برای ساختن یک تیم خوب، از شناخت آدم‌ها شروع کنید.</h2><p>رزومه‌ها، فرصت‌های شغلی و گفت‌وگوهای تیم استخدام را در یک فضای کاری منظم دنبال کنید.</p></div><small className="flex items-center gap-2 text-xs"><ShieldCheck size={17} />فضای اختصاصی تیم استخدام شما</small></aside>
    <main className="auth-main"><div className="auth-form-container">
      <h1>{registering ? "ساخت فضای کار سازمان" : "به فضای کارتان خوش آمدید"}</h1>
      <p>{registering ? "اطلاعات سازمان را وارد کنید و کار را شروع کنید." : "برای ادامه، وارد حساب کاربری خود شوید."}</p>
      <form onSubmit={event => void submit(event)}>
        <FieldGroup>
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          {registering && <Field><FieldLabel htmlFor="org-name">نام سازمان</FieldLabel><Input id="org-name" required value={org} onChange={event => setOrg(event.target.value)} autoComplete="organization" /></Field>}
          <Field><FieldLabel htmlFor="email">ایمیل</FieldLabel><Input id="email" type="email" required value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" dir="ltr" placeholder="you@company.com" /></Field>
          <Field><FieldLabel htmlFor="password">گذرواژه</FieldLabel><Input id="password" type="password" required value={password} onChange={event => setPassword(event.target.value)} autoComplete={registering ? "new-password" : "current-password"} minLength={registering ? 8 : undefined} dir="ltr" /></Field>
          <Button type="submit" disabled={busy} className="mt-2 w-full">{busy && <Spinner data-icon="inline-start" />}{busy ? "لطفاً صبر کنید…" : registering ? "ایجاد حساب و فضای کار" : "ورود به فضای کار"}</Button>
        </FieldGroup>
      </form>
      {!registering && <p className="mt-4 text-center text-xs"><Link className="font-semibold text-primary" to="/forgot-password">گذرواژه‌تان را فراموش کرده‌اید؟</Link></p>}
      <p className="mt-8 text-center text-xs text-muted-foreground">{registering ? "حساب دارید؟ " : "هنوز حساب ندارید؟ "}<Link className="font-semibold text-primary" to={registering ? "/login" : "/signup"}>{registering ? "وارد شوید" : "ساخت حساب سازمان"}</Link></p>
    </div></main>
  </div>
}
