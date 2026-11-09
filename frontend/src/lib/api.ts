export class ApiError extends Error {
  status: number
  code: string

  constructor(status: number, code: string) {
    super(code)
    this.status = status
    this.code = code
  }
}

export interface Me {
  id: string
  email: string
  org: { id: string; name: string; slug: string }
  role: "admin" | "member"
  is_verified: boolean
}

export interface AdminUser {
  id: string
  email: string
  role: "admin" | "member"
  is_active: boolean
  is_verified: boolean
  joined_at: string
}

export interface AdminInvitation {
  id: string
  email: string
  expires_at: string
  created_at: string
  expired: boolean
}

export interface AdminUsers {
  users: AdminUser[]
  invitations: AdminInvitation[]
}

export interface SystemMailbox {
  connected: boolean
  email: string | null
}

export interface SignupInput {
  email: string
  password: string
  org_name: string
}

/** One parse job — every submitted document ends in an explicit status. */
export interface ParseJobInfo {
  id: string
  status:
    | "pending"
    | "extracted"
    | "ocr_applied"
    | "vision_used"
    | "needs_review"
    | "failed"
    | "not_a_resume"
  reason: string | null
  attempts: number
  model: string | null
  prompt_version: string | null
  schema_version: number | null
}

export interface CandidateSummary {
  id: string
  full_name: string
  headline: string | null
  email: string | null
  created_at: string
  new_resume_received?: boolean
}

export interface ProfileLink {
  type: string | null
  url: string | null
}

export interface ProfileContact {
  full_name: string | null
  email: string | null
  phone: string | null
  location: string | null
  links: ProfileLink[] | null
}

export interface ProfileWorkExperience {
  title: string | null
  company: string | null
  location: string | null
  start_date: string | null
  end_date: string | null
  current: boolean
  bullets: string[] | null
}

export interface ProfileEducation {
  degree: string | null
  field: string | null
  institution: string | null
  start_date: string | null
  end_date: string | null
}

export interface ProfileCertification {
  name: string | null
  issuer: string | null
  date: string | null
}

export interface ProfileLanguage {
  language: string | null
  proficiency: string | null
}

/** The structured, HR-editable Profile of a Candidate's latest resume. */
export interface CandidateProfile {
  contact: ProfileContact
  headline: string | null
  summary: string | null
  work_experience: ProfileWorkExperience[]
  education: ProfileEducation[]
  skills: string[]
  industries: string[]
  certifications: ProfileCertification[]
  languages: ProfileLanguage[]
  document_language: string | null
  extraction_notes: string[]
}

export interface CandidateResume {
  id: string
  filename: string
  parse_status: ParseJobInfo["status"]
  parse_reason: string | null
  uploaded_at: string
}

export interface CandidateDetail extends CandidateSummary {
  phone: string | null
  location: string | null
  profile: CandidateProfile | null
  resume: CandidateResume | null
}

export interface UploadResult {
  duplicate: boolean
  job: ParseJobInfo | null
  candidate: CandidateSummary | null
}

const PERSIAN_ERRORS: Record<string, string> = {
  ROLE_NOT_FOUND: "فرصت شغلی پیدا نشد؛ فهرست را تازه کنید.",
  ROLE_NOT_OPEN: "برای افزودن کاندیدا، ابتدا فرصت شغلی را باز کنید.",
  INVALID_OWNER: "مسئول باید عضو فعال همین سازمان باشد.",
  INVALID_MENTION: "گیرندهٔ اشاره باید عضو فعال همین سازمان باشد. فهرست همکاران را تازه‌سازی کنید.",
  INACTIVE_NOTE_AUTHOR: "برای ثبت یا ویرایش یادداشت باید عضو فعال سازمان باشید.",
  NOTE_NOT_FOUND: "یادداشت پیدا نشد یا در سازمان شما در دسترس نیست.",
  NOTIFICATION_NOT_FOUND: "این اعلان در فهرست شخصی شما در دسترس نیست.",
  EMPTY_NOTE: "متن یادداشت را وارد کنید.",
  INVALID_ROLE_TRANSITION: "این تغییر وضعیت مجاز نیست؛ صفحه را تازه کنید.",
  INVALID_ROLE_DETAILS: "مشخصات فرصت شغلی معتبر نیست.",
  ROLE_MATCHING_NOT_CONFIGURED: "سرویس مقایسهٔ رزومه تنظیم نشده است؛ تنظیمات هوش مصنوعی را بررسی کنید.",
  ROLE_MATCHING_UNAVAILABLE: "مقایسهٔ رزومه با فرصت شغلی در دسترس نیست؛ دوباره تلاش کنید.",
  ROLE_TITLE_REQUIRED: "عنوان فرصت شغلی را وارد کنید.",
  APPLICATION_NOT_FOUND: "درخواست شغلی پیدا نشد؛ ممکن است ادغام شده باشد.",
  INTERVIEW_CANCELLATION_UNAVAILABLE: "لغو رویداد تقویم ممکن نشد؛ اتصال Google مصاحبه‌کننده را بررسی کنید و دوباره تلاش کنید.",
  GOOGLE_API_FAILED: "Google رویداد تقویم را لغو نکرد؛ درخواست حذف انجام نشد.",
  GOOGLE_RECONNECT_REQUIRED: "اتصال Google نیاز به اتصال دوباره دارد؛ پس از اتصال، حذف را دوباره انجام دهید.",
  APPLICATION_CHANGED_REFRESH: "مرحلهٔ این درخواست تغییر کرده است؛ صفحه را تازه کنید و دوباره تصمیم بگیرید.",
  STAGE_NOT_FOUND: "مرحله پیدا نشد؛ صفحه را تازه کنید.",
  REASON_ONLY_FOR_REJECTION: "دلیل رد فقط برای مرحلهٔ ردشده قابل ثبت است.",
  CANDIDATE_NOT_FOUND: "کاندیدا پیدا نشد؛ ممکن است ادغام یا حذف شده باشد.",
  INVALID_PROFILE: "ساختار اطلاعات پروفایل معتبر نیست؛ فیلدها را بررسی کنید.",
  PROFILE_CHANGED_REFRESH: "این فیلد پس از پیشنهاد تغییر کرده است؛ صفحه را تازه کنید.",
  CHANGE_ALREADY_RESOLVED: "این اختلاف قبلاً تعیین تکلیف شده است.",
  RESUME_VERSION_MISSING: "برای تولید خلاصه، ابتدا رزومهٔ این فرد را بارگذاری کنید.",
  RESUME_NOT_FOUND: "رزومه پیدا نشد؛ فهرست را تازه کنید.",
  DOCUMENT_QUARANTINED: "این سند تا تکمیل بررسی ایمنی قابل پذیرش یا دریافت نیست.",
  DOCUMENT_ALREADY_RESOLVED: "این سند قبلاً تعیین تکلیف شده است؛ فهرست را تازه کنید.",
  PROFILE_NAME_REQUIRED: "نام کاندیدا را وارد کنید.",
  RESUME_SUPERSEDED: "نسخهٔ جدیدتری از این رزومه دریافت شده است؛ پروندهٔ فرد را باز کنید.",
  LOGIN_BAD_CREDENTIALS: "رایانامه یا گذرواژه نادرست است.",
  REGISTER_USER_ALREADY_EXISTS: "این رایانامه قبلاً ثبت شده است.",
  ADMIN_REQUIRED: "این عملیات فقط برای مدیر سازمان مجاز است.",
  SYSTEM_MAILBOX_NOT_CONNECTED: "ابتدا صندوق رایانامهٔ سازمان را به Google متصل کنید.",
  GOOGLE_NOT_CONFIGURED: "تنظیمات اتصال Google روی سرور کامل نیست.",
  GOOGLE_OAUTH_FAILED: "اتصال به Google انجام نشد؛ دوباره تلاش کنید.",
  GOOGLE_EMAIL_NOT_VERIFIED: "رایانامهٔ تأییدشده‌ای از حساب Google دریافت نشد.",
  GOOGLE_REFRESH_TOKEN_MISSING: "Google اجازهٔ دسترسی پایدار نداد؛ اتصال را دوباره آغاز کنید.",
  GOOGLE_TOKEN_REVOKE_FAILED: "لغو دسترسی Google ممکن نشد؛ حساب غیرفعال نشد.",
  USER_ALREADY_EXISTS: "این رایانامه از قبل در سامانه ثبت شده است.",
  INVITATION_NOT_FOUND: "دعوت پیدا نشد یا قبلاً پذیرفته شده است.",
  INVALID_INVITATION: "پیوند دعوت معتبر نیست یا قبلاً استفاده شده است.",
  INVITATION_EXPIRED: "مهلت این دعوت تمام شده است؛ از مدیر بخواهید دعوت تازه‌ای بفرستد.",
  USER_NOT_FOUND: "عضو سازمان پیدا نشد.",
  USER_ALREADY_INACTIVE: "این حساب قبلاً غیرفعال شده است.",
  CANNOT_DEACTIVATE_SELF: "برای جلوگیری از قفل‌شدن حساب سازمان، نمی‌توانید حساب خودتان را غیرفعال کنید.",
  LAST_ACTIVE_ADMIN: "ابتدا باید مدیر فعال دیگری برای سازمان داشته باشید.",
  NO_MEMBERSHIP: "عضویت سازمانی برای این حساب پیدا نشد.",
  PASSWORD_RESET_TOKEN_INVALID: "پیوند تغییر گذرواژه معتبر نیست یا مهلتش تمام شده است.",
  VERIFY_USER_TOKEN_INVALID: "پیوند تأیید رایانامه معتبر نیست یا مهلتش تمام شده است.",
  RESET_PASSWORD_BAD_TOKEN: "پیوند بازیابی گذرواژه معتبر نیست یا مهلتش تمام شده است.",
  RESET_PASSWORD_INVALID_PASSWORD: "گذرواژهٔ تازه معتبر نیست.",
  VERIFY_USER_BAD_TOKEN: "پیوند تأیید رایانامه معتبر نیست یا مهلتش تمام شده است.",
  VERIFY_USER_ALREADY_VERIFIED: "رایانامهٔ این حساب قبلاً تأیید شده است.",
  PASSWORD_TOO_SHORT: "گذرواژه باید دست‌کم ۸ نویسه باشد.",
  EMPTY_FILE: "فایل خالی است.",
  FILE_TOO_LARGE: "حجم فایل بیش از حد مجاز است (۱۰ مگابایت).",
  NETWORK: "ارتباط با سرور برقرار نشد؛ دوباره تلاش کنید.",
  UNKNOWN: "خطایی رخ داد؛ دوباره تلاش کنید.",
}

export interface SummaryCategory {
  state: "supplied" | "partial" | "unknown"
  items: { value: string | number | Record<string, string>; evidence: string[] }[]
}

export interface CandidateWorkspace {
  id: string
  full_name: string
  profile: Record<string, unknown> | null
  resume_id: string | null
  resume_version: string | null
  new_resume_received: boolean
  summary: { status: string; coverage_status: "structured_v2" | "legacy_unverified" | "unavailable"; content: { text: string; unclear_or_missing: string[]; grounded_fields: string[]; contract_version?: number; facts?: Record<string, SummaryCategory> } | null; error: string | null; generated_at: string | null; model: string | null; prompt_version: string } | null
  changes: { id: string; field_path: string; old_value: unknown; new_value: unknown; resume_version: string }[]
  duplicates: { id: string; full_name: string; email: string | null; phone: string | null; similarity: number }[]
  activity: { id: number; event_type: string; data: Record<string, unknown>; created_at: string }[]
  notes: CandidateNote[]
  applications: PipelineApplication[]
}

export async function fetchCandidateWorkspace(id: string, signal?: AbortSignal): Promise<CandidateWorkspace> {
  const res = await request(`/api/candidates/${id}/workspace`, { signal })
  if (!res.ok) await throwApiError(res)
  return res.json()
}

export async function saveCandidateProfile(id: string, profile: CandidateProfile): Promise<void> {
  const res = await request(`/api/candidates/${id}/profile`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profile }) })
  if (!res.ok) await throwApiError(res)
}

export async function candidateAction(id: string, action: string, body?: unknown): Promise<Record<string, unknown>> {
  const res = await request(`/api/candidates/${id}/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) })
  if (!res.ok) await throwApiError(res)
  return res.json()
}

export interface ResumeItem {
  id: string
  filename: string
  created_at: string
  status: ParseJobInfo["status"]
  reason: string | null
  latest_job_id: string | null
  candidate_id: string | null
  candidate_name: string | null
  candidate_email: string | null
}

export interface ResumeDetail extends ResumeItem {
  profile: Record<string, unknown> | null
}

export interface ResumeEdit {
  full_name: string
  email: string | null
  phone: string | null
  location: string | null
  headline: string | null
  summary: string | null
  skills: string[]
  expected_values?: Record<string, unknown>
}

export async function fetchResumes(search = "", before?: string, signal?: AbortSignal): Promise<{ items: ResumeItem[]; next_cursor: string | null }> {
  const params = new URLSearchParams({ search, limit: "20" })
  if (before) params.set("before", before)
  const res = await request(`/api/resumes?${params}`, { signal })
  if (!res.ok) await throwApiError(res)
  return res.json()
}

export async function fetchResume(id: string, signal?: AbortSignal): Promise<ResumeDetail> {
  const res = await request(`/api/resumes/${id}`, { signal })
  if (!res.ok) await throwApiError(res)
  return res.json()
}

export async function updateResume(id: string, changes: ResumeEdit): Promise<ResumeDetail> {
  const res = await request(`/api/resumes/${id}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(changes),
  })
  if (!res.ok) await throwApiError(res)
  return res.json()
}

export async function deleteResume(id: string): Promise<void> {
  const res = await request(`/api/resumes/${id}`, { method: "DELETE" })
  if (!res.ok) await throwApiError(res)
}

export async function deleteCandidate(id: string): Promise<void> {
  const res = await request(`/api/candidates/${id}`, { method: "DELETE" })
  if (!res.ok) await throwApiError(res)
  window.dispatchEvent(new Event("ingestion-changed"))
}

/** Map an API error to a Persian, user-facing message. */
export function persianError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code in PERSIAN_ERRORS) return PERSIAN_ERRORS[error.code]!
    if (error.code.startsWith("PASSWORD_")) return PERSIAN_ERRORS.PASSWORD_TOO_SHORT!
  }
  return PERSIAN_ERRORS.UNKNOWN!
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(path, { credentials: "same-origin", ...init })
  } catch {
    throw new ApiError(0, "NETWORK")
  }
}

/** Always throws: turn a non-2xx response into an ApiError. */
async function throwApiError(res: Response): Promise<never> {
  try {
    const body = (await res.json()) as { detail?: unknown }
    const detail = body.detail
    // Prefer the machine-readable reason (e.g. PASSWORD_TOO_SHORT) over the
    // generic code (REGISTER_INVALID_PASSWORD) when one is present.
    if (typeof detail === "string") throw new ApiError(res.status, detail)
    if (detail && typeof detail === "object" && "code" in detail) {
      const obj = detail as Record<string, unknown>
      const reason = typeof obj.reason === "string" ? obj.reason : undefined
      const code = typeof obj.code === "string" ? obj.code : undefined
      if (reason && reason in PERSIAN_ERRORS) throw new ApiError(res.status, reason)
      if (code) throw new ApiError(res.status, code)
    }
  } catch (e) {
    if (e instanceof ApiError) throw e
  }
  throw new ApiError(res.status, "UNKNOWN")
}

export async function fetchMe(): Promise<Me | null> {
  const res = await request("/api/me")
  if (res.status === 401) return null
  if (!res.ok) await throwApiError(res)
  return (await res.json()) as Me
}

export async function login(email: string, password: string): Promise<void> {
  const res = await request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username: email, password }),
  })
  if (!res.ok) await throwApiError(res)
}

export async function signup(input: SignupInput): Promise<Me> {
  const res = await request("/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!res.ok) await throwApiError(res)
  return (await res.json()) as Me
}

export async function logout(): Promise<void> {
  const res = await request("/auth/logout", { method: "POST" })
  if (!res.ok && res.status !== 401) await throwApiError(res)
}

export async function fetchAdminUsers(): Promise<AdminUsers> {
  const res = await request("/api/admin/users")
  if (!res.ok) await throwApiError(res)
  return (await res.json()) as AdminUsers
}

export async function fetchSystemMailbox(): Promise<SystemMailbox> {
  const res = await request("/api/admin/system-mailbox")
  if (!res.ok) await throwApiError(res)
  return (await res.json()) as SystemMailbox
}

export async function connectSystemMailbox(): Promise<string> {
  const res = await request("/api/admin/system-mailbox/connect", { method: "POST" })
  if (!res.ok) await throwApiError(res)
  const data = (await res.json()) as { authorization_url: string }
  return data.authorization_url
}

export async function inviteUser(email: string): Promise<void> {
  const res = await request("/api/admin/invitations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  })
  if (!res.ok) await throwApiError(res)
}

export async function resendInvitation(id: string): Promise<void> {
  const res = await request(`/api/admin/invitations/${id}/resend`, { method: "POST" })
  if (!res.ok) await throwApiError(res)
}

export async function deactivateUser(id: string): Promise<void> {
  const res = await request(`/api/admin/users/${id}/deactivate`, { method: "POST" })
  if (!res.ok) await throwApiError(res)
}

export async function acceptInvitation(token: string, password: string): Promise<void> {
  const res = await request("/api/invitations/accept", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password }),
  })
  if (!res.ok) await throwApiError(res)
}

export async function requestPasswordReset(email: string): Promise<void> {
  const res = await request("/auth/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  })
  if (!res.ok) await throwApiError(res)
}

export async function resetPassword(token: string, password: string): Promise<void> {
  const res = await request("/auth/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password }),
  })
  if (!res.ok) await throwApiError(res)
}

export async function requestEmailVerification(email: string): Promise<void> {
  const res = await request("/auth/request-verify-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  })
  if (!res.ok) await throwApiError(res)
}

export async function verifyEmail(token: string): Promise<void> {
  const res = await request("/auth/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  })
  if (!res.ok) await throwApiError(res)
}

/** Upload a resume — the sync path; the outcome carries the terminal status. */
export async function uploadResume(file: File): Promise<UploadResult> {
  const body = new FormData()
  body.append("file", file)
  let res: Response
  try {
    res = await fetch("/api/candidates/upload", {
      method: "POST",
      credentials: "same-origin",
      body,
    })
  } catch {
    throw new ApiError(0, "NETWORK")
  }
  if (!res.ok) await throwApiError(res)
  const result = (await res.json()) as UploadResult
  window.dispatchEvent(new Event("ingestion-changed"))
  return result
}

export async function fetchCandidates(query?: string, signal?: AbortSignal): Promise<CandidateSummary[]> {
  const params = new URLSearchParams()
  if (query?.trim()) params.set("query", query.trim())
  const res = await request(`/api/candidates${params.size ? `?${params}` : ""}`, { signal })
  if (!res.ok) await throwApiError(res)
  const body = (await res.json()) as { items: CandidateSummary[] }
  return body.items
}

export interface PipelineStage {
  id: string
  name: string
  kind: string
  position: number
}
export interface PipelineRole {
  id: string
  title: string
  status: "draft" | "open" | "paused" | "closed"
  owner_id: string | null
  details: RoleDetails
}
export interface RoleDetails {
  description: string
  responsibilities: string[]
  required_skills: string[]
  preferred_skills: string[]
  min_experience_years: number | null
  education: string
  seniority: "" | "intern" | "junior" | "mid" | "senior" | "lead"
  employment_type: "" | "full_time" | "part_time" | "contract" | "internship"
  work_mode: "" | "onsite" | "hybrid" | "remote"
  location: string
  salary_range: string
}
export interface RankedRoleCandidate {
  application_id: string
  candidate_id: string
  full_name: string
  email: string | null
  similarity: number | null
}
export interface RoleMatchResult {
  candidate_id: string
  similarity: number | null
  mode: "semantic" | "llm"
}
export interface PipelineOwner { id: string; email: string; active: boolean }
export interface PipelineApplication {
  id: string
  candidate_id: string
  role_id: string
  role_title: string
  stage_id: string
  stage: string
  stage_kind: string
  owner_id: string | null
  full_name: string
  headline: string | null
}
export interface ApplicationEvent {
  id: number
  event_type: string
  actor_user_id: string | null
  created_at: string
  data: Record<string, unknown>
}
export interface PipelineBoard {
  stages: PipelineStage[]
  roles: PipelineRole[]
  applications: PipelineApplication[]
}

/** Shared transport/error handling; feature helpers expose typed public workflows. */
async function pipelineRequest<T>(path: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await request(`/api/${path}`, {
    method, signal, headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) await throwApiError(response)
  return response.json()
}
export const fetchPipelineBoard = (signal?: AbortSignal) => pipelineRequest<PipelineBoard>("pipeline/board", "GET", undefined, signal)
export const fetchPipelineOwners = (signal?: AbortSignal) => pipelineRequest<{ items: PipelineOwner[] }>("pipeline/owners", "GET", undefined, signal)
export const fetchRoles = (signal?: AbortSignal) => pipelineRequest<{ items: PipelineRole[] }>("roles", "GET", undefined, signal)
export const createRole = (title: string, owner_id: string | null, details: RoleDetails) => pipelineRequest<PipelineRole>("roles", "POST", { title, owner_id, details })
export const editRole = (id: string, changes: Partial<Pick<PipelineRole, "title" | "status" | "owner_id" | "details">>) => pipelineRequest<PipelineRole>(`roles/${id}`, "PATCH", changes)
export async function deleteRole(id: string): Promise<void> {
  const response = await request(`/api/roles/${id}`, { method: "DELETE" })
  if (!response.ok) await throwApiError(response)
}
export const rankRoleCandidates = (id: string) => pipelineRequest<{ items: RankedRoleCandidate[]; mode: "semantic" | "llm"; unranked_count: number }>(`roles/${id}/rank`, "POST")
export const matchCandidateToRole = (roleId: string, candidateId: string) => pipelineRequest<RoleMatchResult>(`roles/${roleId}/candidates/${candidateId}/match`, "POST")
export const addToRole = (role: string, candidate_id: string, owner_id: string | null = null) => pipelineRequest<{ id: string }>(`roles/${role}/applications`, "POST", { candidate_id, owner_id })
export async function deleteApplication(id: string): Promise<void> {
  const response = await request(`/api/applications/${id}`, { method: "DELETE" })
  if (!response.ok) await throwApiError(response)
}
export const moveApplication = (application: PipelineApplication, stage_id: string, context: string, reason: string | null) => pipelineRequest(`applications/${application.id}/stage`, "POST", { stage_id, expected_stage_id: application.stage_id, context, reason })
export const assignApplication = (id: string, owner_id: string | null) => pipelineRequest(`applications/${id}/owner`, "PATCH", { owner_id })
export const fetchApplication = (id: string, signal?: AbortSignal) => pipelineRequest<{ activity: ApplicationEvent[]; notes: CandidateNote[] }>(`applications/${id}`, "GET", undefined, signal)

export interface InterviewSlot { id: string; starts_at: string; ends_at: string; status: "offered" | "booked" | "released" }
export interface Interviewer { id: string; name: string; email: string }
export interface Interview { id: string; title: string; duration_minutes: number; status: "open" | "booked" | "cancelled"; meet_url: string | null; created_at: string; slots: InterviewSlot[]; interviewers: Interviewer[]; booking_url?: string }
export interface InterviewDraft { title: string; duration_minutes: number; slots: { starts_at: string; ends_at: string }[]; interviewers: { name: string; email: string }[] }
export const fetchGoogleConnection = () => pipelineRequest<{ connected: boolean; email: string | null }>("google/connection")
export const connectGoogle = () => pipelineRequest<{ authorization_url: string }>("google/connect", "POST")
export const fetchInterviews = (applicationId: string) => pipelineRequest<{ items: Interview[] }>(`applications/${applicationId}/interviews`)
export const createInterview = (applicationId: string, input: InterviewDraft) => pipelineRequest<Interview>(`applications/${applicationId}/interviews`, "POST", input)
export const sendInterviewInvitation = (id: string) => pipelineRequest<{ sent: boolean; booking_url: string }>(`interviews/${id}/send-invitation`, "POST")

export interface NotePerson { id: string | null; email: string | null; active: boolean }
export interface CandidateNote {
  id: string
  candidate_id: string
  application_id: string | null
  body: string
  created_at: string
  edited_at: string | null
  author: NotePerson
  editor: NotePerson | null
  mention_user_ids: string[]
  mentions: NotePerson[]
}
export interface InAppNotification {
  id: string
  kind: string
  created_at: string
  read_at: string | null
  href: string | null
}
export const fetchMentionUsers = (signal?: AbortSignal) => pipelineRequest<{ items: PipelineOwner[] }>("notes/mention-users", "GET", undefined, signal)
export const saveNote = (candidateId: string, applicationId: string | null, noteId: string | null, body: string, mention_user_ids: string[]) => pipelineRequest<CandidateNote>(noteId ? `notes/${noteId}` : applicationId ? `applications/${applicationId}/notes` : `candidates/${candidateId}/notes`, noteId ? "PUT" : "POST", { body, mention_user_ids })
export const fetchNotifications = (signal?: AbortSignal) => pipelineRequest<{ items: InAppNotification[]; unread_count: number }>("notifications", "GET", undefined, signal)
export const setNotificationRead = (id: string, read: boolean) => pipelineRequest(`notifications/${id}`, "PATCH", { read })

export async function fetchCandidate(id: string): Promise<CandidateDetail> {
  const res = await request(`/api/candidates/${id}`)
  if (res.status === 404) throw new ApiError(404, "CANDIDATE_NOT_FOUND")
  if (!res.ok) await throwApiError(res)
  return (await res.json()) as CandidateDetail
}

export interface IngestionSettings {
  email_address: string | null
  email_enabled: boolean
  review_count: number
}

export interface ReviewItem {
  id: string
  filename: string
  status: ParseJobInfo["status"]
  reason: string | null
  created_at: string
  candidate_id: string | null
  blocked: boolean
}

export interface ReviewDetail extends ReviewItem {
  raw_text: string | null
  raw_json: Record<string, unknown> | null
  candidate_profile: Record<string, unknown> | null
}

export interface ReviewList {
  items: ReviewItem[]
  mail_failures: { id: string; reason: string | null; created_at: string }[]
}

export async function fetchIngestionSettings(): Promise<IngestionSettings> {
  const res = await request("/api/ingestion/settings")
  if (!res.ok) await throwApiError(res)
  return res.json()
}

export async function fetchReview(view: "review" | "all" = "review"): Promise<ReviewList> {
  const res = await request(`/api/review?view=${view}`)
  if (!res.ok) await throwApiError(res)
  return res.json()
}

export async function fetchReviewDetail(id: string): Promise<ReviewDetail> {
  const res = await request(`/api/review/${id}`)
  if (!res.ok) await throwApiError(res)
  return res.json()
}

export async function resolveReview(
  id: string, action: "accept" | "not_a_resume" | "failed" | "rescan", profile?: CandidateProfile,
  edits?: { edited_fields: string[]; expected_values: Record<string, unknown> },
): Promise<{ candidate_id: string | null }> {
  const res = await request(`/api/review/${id}/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...edits, extraction: profile ? {
      ...profile, is_resume: true, confidence: 1, needs_review: false,
    } : null }),
  })
  if (!res.ok) await throwApiError(res)
  return res.json()
}
