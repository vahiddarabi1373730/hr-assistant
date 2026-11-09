import { ApiError, persianError, type PipelineOwner } from "@/lib/api"

export type EventStatus = "draft" | "published" | "completed" | "cancelled"
export type EventTransition = "completed" | "cancelled"
export const eventStatusLabels: Record<EventStatus, string> = {
  draft: "در حال برنامه‌ریزی", published: "فعال", completed: "برگزارشده", cancelled: "لغوشده",
}
export type GuestResponse = "pending" | "accepted" | "declined"
export const responseLabels: Record<GuestResponse, string> = {
  pending: "منتظر پاسخ", accepted: "شرکت می‌کنم", declined: "شرکت نمی‌کنم",
}
export interface EventInput {
  title: string; description: string; location: string
  starts_at: string; ends_at: string; capacity: number | null; budget_toman: number | null
}
export interface OrganisationalEvent extends EventInput {
  id: string; organiser_id: string; status: EventStatus; revision: number
  created_at: string; can_manage: boolean; guest_count: number; accepted_count: number
}
export interface EventGuest {
  id: string; name: string; email: string; response: GuestResponse
  attended: boolean; rating: number | null; feedback: string | null
}
export interface EventTask {
  id: string; title: string; assignee_id: string | null; due_at: string | null; done: boolean
}
export interface EventDetail extends Omit<OrganisationalEvent, "guest_count" | "accepted_count"> { guests: EventGuest[]; tasks: EventTask[] }
export interface EventInvitationResult {
  sent: string[]
  failed: { email: string; reason: string }[]
  skipped: string[]
}
export interface PublicInvitation {
  title: string; description: string; location: string; starts_at: string; ends_at: string
  status: EventStatus; guest_name: string; response: GuestResponse
  can_respond: boolean; can_feedback: boolean; rating: number | null; feedback: string | null
}
async function eventRequest<T>(path: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api/${path}`, {
      method, credentials: "same-origin", signal,
      ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new ApiError(0, "NETWORK")
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as { detail?: unknown }
    throw new ApiError(response.status, typeof data.detail === "string" ? data.detail : response.status === 422 ? "EVENT_INVALID_INPUT" : "UNKNOWN")
  }
  return response.status === 204 ? undefined as T : response.json()
}
const errors: Record<string, string> = {
  EVENT_NOT_FOUND: "رویداد پیدا نشد یا به آن دسترسی ندارید.",
  EVENT_MANAGER_REQUIRED: "ویرایش این رویداد فقط برای برگزارکننده یا مدیر سازمان مجاز است.",
  EVENT_STALE: "اطلاعات رویداد تغییر کرده است؛ صفحه را تازه‌سازی و دوباره تلاش کنید.",
  EVENT_CLOSED: "این رویداد پایان یافته یا لغو شده و قابل تغییر نیست.",
  EVENT_INVALID_TRANSITION: "تغییر وضعیت انتخاب‌شده برای این رویداد مجاز نیست.",
  EVENT_NOT_ENDED: "بعد از پایان زمان رویداد می‌توانید آن را برگزارشده ثبت کنید.",
  EVENT_CAPACITY_TOO_SMALL: "ظرفیت نمی‌تواند کمتر از تعداد مهمان‌های تأییدشده باشد.",
  EVENT_FULL: "ظرفیت رویداد تکمیل شده است؛ می‌توانید بعداً دوباره بررسی کنید.",
  EVENT_GUEST_EXISTS: "این ایمیل قبلاً به فهرست مهمان‌ها اضافه شده است.",
  EVENT_GUEST_LIMIT: "حداکثر ۵۰۰ مهمان برای هر رویداد قابل ثبت است.",
  EVENT_MEMBERS_INVALID: "فهرست اعضای انتخاب‌شده تغییر کرده است؛ صفحه را تازه‌سازی کنید.",
  SYSTEM_MAILBOX_NOT_CONNECTED: "برای ارسال دعوت‌نامه، ابتدا صندوق Gmail سازمان را متصل کنید.",
  GOOGLE_RECONNECT_REQUIRED: "اتصال Gmail سازمان منقضی شده است؛ آن را دوباره متصل کنید.",
  GOOGLE_API_FAILED: "ارسال یک یا چند ایمیل از Gmail سازمان انجام نشد.",
  GOOGLE_API_UNAVAILABLE: "ارتباط با Gmail برقرار نشد؛ برای ارسال دوباره تلاش کنید.",
  EVENT_TASK_LIMIT: "حداکثر ۱۰۰ کار برای هر رویداد قابل ثبت است.",
  EVENT_NOT_STARTED: "ثبت حضور بعد از شروع رویداد امکان‌پذیر است.",
  EVENT_GUEST_NOT_ACCEPTED: "فقط برای مهمانی که حضورش را تأیید کرده می‌توانید حضور ثبت کنید.",
  EVENT_INVITATION_NOT_FOUND: "لینک دعوت معتبر نیست یا برگزارکننده آن را تغییر داده است.",
  EVENT_INVITATION_EXPIRED: "اعتبار این دعوت‌نامه پایان یافته است.",
  EVENT_RSVP_CLOSED: "مهلت پاسخ‌دادن به دعوت پایان یافته یا رویداد لغو شده است.",
  EVENT_FEEDBACK_CLOSED: "ثبت بازخورد بعد از پایان رویداد و برای مهمان‌های تأییدشده فعال می‌شود.",
  EVENT_INVALID_INPUT: "نام، ایمیل و زمان‌ها را بررسی کنید؛ پایان باید بعد از شروع باشد.",
}
export const eventError = (error: unknown) => error instanceof ApiError && errors[error.code] ? errors[error.code]! : persianError(error)
export const fetchEvents = (signal?: AbortSignal) => eventRequest<{ items: OrganisationalEvent[] }>("events", "GET", undefined, signal)
export const fetchEvent = (id: string, signal?: AbortSignal) => eventRequest<EventDetail>(`events/${id}`, "GET", undefined, signal)
export const inviteEventMembers = (id: string, member_ids: string[]) => eventRequest<EventInvitationResult>(`events/${id}/invitations`, "POST", { member_ids })
export const createEvent = (body: EventInput) => eventRequest<EventDetail>("events", "POST", body)
export const saveEvent = (id: string, body: EventInput & { revision: number }) => eventRequest<EventDetail>(`events/${id}`, "PUT", body)
export const changeEventStatus = (event: EventDetail, status: EventTransition) => eventRequest<EventDetail>(`events/${event.id}/status`, "POST", { status, revision: event.revision })
export const addEventGuest = (id: string, body: { name: string; email: string }) => eventRequest<EventGuest>(`events/${id}/guests`, "POST", body)
export const removeEventGuest = (id: string, guest: string) => eventRequest<void>(`events/${id}/guests/${guest}`, "DELETE")
export const createInvitationLink = (id: string, guest: string) => eventRequest<{ url: string }>(`events/${id}/guests/${guest}/link`, "POST")
export const setAttendance = (id: string, guest: string, attended: boolean) => eventRequest<EventGuest>(`events/${id}/guests/${guest}/attendance`, "PATCH", { attended })
export const addEventTask = (id: string, body: { title: string; assignee_id: string | null; due_at: string | null }) => eventRequest<EventTask>(`events/${id}/tasks`, "POST", body)
export const setTaskDone = (id: string, task: string, done: boolean) => eventRequest<EventTask>(`events/${id}/tasks/${task}`, "PATCH", { done })
export const removeEventTask = (id: string, task: string) => eventRequest<void>(`events/${id}/tasks/${task}`, "DELETE")
export const fetchEventMembers = (signal?: AbortSignal) => eventRequest<{ items: PipelineOwner[] }>("pipeline/owners", "GET", undefined, signal)
export const fetchInvitation = (token: string, signal?: AbortSignal) => eventRequest<PublicInvitation>(`event-rsvp/${encodeURIComponent(token)}`, "GET", undefined, signal)
export const respondToEvent = (token: string, response: GuestResponse) => eventRequest<PublicInvitation>(`event-rsvp/${encodeURIComponent(token)}/response`, "POST", { response })
export const submitEventFeedback = (token: string, rating: number, feedback: string) => eventRequest<PublicInvitation>(`event-rsvp/${encodeURIComponent(token)}/feedback`, "POST", { rating, feedback })
export const eventDateTime = (iso: string) => new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso))
export function localDateInput(iso: string) {
  const date = new Date(iso)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}
