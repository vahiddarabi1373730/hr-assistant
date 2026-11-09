import { useEffect, useState, type FormEvent } from "react"
import { Link, useNavigate, useSearchParams } from "react-router"
import { Wordmark } from "@/components/shell"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import {
  acceptInvitation,
  persianError,
  previewInvitation,
  requestPasswordReset,
  resetPassword,
  verifyEmail,
} from "@/lib/api"

type AccountActionMode =
  | "accept-invite"
  | "forgot-password"
  | "reset-password"
  | "verify-email"

const headings: Record<AccountActionMode, string> = {
  "accept-invite": "پیوستن به فضای کار",
  "forgot-password": "بازیابی گذرواژه",
  "reset-password": "تنظیم گذرواژهٔ تازه",
  "verify-email": "تأیید رایانامه",
}

export function AccountActionsPage({ mode }: { mode: AccountActionMode }) {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get("token") ?? ""
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [existingAccount, setExistingAccount] = useState<boolean | null>(null)

  useEffect(() => {
    if (mode !== "verify-email") return
    if (!token) return
    let active = true
    verifyEmail(token)
      .then(() => { if (active) navigate("/settings/users", { replace: true }) })
      .catch(cause => { if (active) setError(persianError(cause)) })
    return () => { active = false }
  }, [mode, navigate, token])

  useEffect(() => {
    if (mode !== "accept-invite" || !token) return
    let active = true
    previewInvitation(token)
      .then(data => { if (active) setExistingAccount(data.existing_account) })
      .catch(cause => { if (active) setError(persianError(cause)) })
    return () => { active = false }
  }, [mode, token])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      if (mode === "forgot-password") {
        await requestPasswordReset(email)
        setMessage("اگر حسابی با این رایانامه وجود داشته باشد، پیوند بازیابی به صندوق سازمان فرستاده می‌شود.")
      } else if (mode === "accept-invite") {
        if (password !== confirmPassword) {
          setError("تکرار گذرواژه با گذرواژه یکسان نیست.")
          return
        }
        await acceptInvitation(token, password || undefined)
        setMessage("عضویت شما تکمیل شد؛ اکنون می‌توانید وارد شوید.")
      } else if (mode === "reset-password") {
        if (password !== confirmPassword) {
          setError("تکرار گذرواژه با گذرواژه یکسان نیست.")
          return
        }
        await resetPassword(token, password)
        setMessage("گذرواژه تغییر کرد؛ اکنون با گذرواژهٔ تازه وارد شوید.")
      }
    } catch (cause) {
      setError(persianError(cause))
    } finally {
      setBusy(false)
    }
  }

  const needsPassword = mode === "reset-password" || (mode === "accept-invite" && existingAccount === false)
  const missingToken = (mode === "accept-invite" || mode === "reset-password") && !token
  const missingVerificationToken = mode === "verify-email" && !token
  const verifying = mode === "verify-email" && Boolean(token) && !message && !error
  return <div className="auth-layout">
    <aside className="auth-aside">
      <Wordmark />
      <div className="auth-message"><h2>فضای کاری تیم استخدام شما</h2><p>مدیریت امن حساب‌ها و همکاری اعضای سازمان.</p></div>
    </aside>
    <main className="auth-main">
      <div className="auth-form-container">
        <h1>{headings[mode]}</h1>
        {mode === "forgot-password" && <p>رایانامهٔ حساب را وارد کنید تا پیوند بازیابی ارسال شود.</p>}
        {mode === "accept-invite" && existingAccount === true && <p>این ایمیل از قبل حساب دارد؛ فقط عضویت جدید را تأیید کنید.</p>}
        {mode === "accept-invite" && existingAccount === false && <p>برای ساخت حساب، یک گذرواژه انتخاب کنید.</p>}
        {mode === "reset-password" && <p>گذرواژه باید دست‌کم ۸ نویسه داشته باشد.</p>}
        {mode === "verify-email" && <p>در حال بررسی پیوند تأیید حساب شما هستیم.</p>}
        {(error || missingToken || missingVerificationToken) && <Alert variant="destructive"><AlertDescription>{error ?? "پیوند موردنیاز در نشانی صفحه وجود ندارد."}</AlertDescription></Alert>}
        {message && <Alert><AlertDescription>{message}</AlertDescription></Alert>}
        {mode === "accept-invite" && existingAccount === null && !error && <Spinner aria-label="در حال بررسی دعوت" />}
        {mode !== "verify-email" && !missingToken && !message && (mode !== "accept-invite" || existingAccount !== null) && <form onSubmit={event => void submit(event)} className="mt-5">
          <FieldGroup>
            {mode === "forgot-password" && <Field>
              <FieldLabel htmlFor="account-email">رایانامه</FieldLabel>
              <Input id="account-email" type="email" required autoComplete="email" dir="ltr" value={email} onChange={event => setEmail(event.target.value)} />
            </Field>}
            {needsPassword && <>
              <Field>
                <FieldLabel htmlFor="new-password">گذرواژهٔ تازه</FieldLabel>
                <Input id="new-password" type="password" minLength={8} required autoComplete="new-password" dir="ltr" value={password} onChange={event => setPassword(event.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="confirm-password">تکرار گذرواژه</FieldLabel>
                <Input id="confirm-password" type="password" minLength={8} required autoComplete="new-password" dir="ltr" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} />
              </Field>
            </>}
            <Button type="submit" disabled={busy}>{busy && <Spinner data-icon="inline-start" />}{busy ? "لطفاً صبر کنید…" : mode === "accept-invite" && existingAccount ? "پذیرش دعوت" : "ادامه"}</Button>
          </FieldGroup>
        </form>}
        {verifying && <Spinner aria-label="در حال تأیید رایانامه" />}
        <p className="mt-6 text-center text-sm"><Link className="font-semibold text-primary" to="/login">بازگشت به ورود</Link></p>
      </div>
    </main>
  </div>
}
