import { useState, type FormEvent, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { createEvent, saveEvent, eventError, localDateInput, type EventDetail, type EventInput } from "@/lib/events"

function formatToman(value: string) {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}

export function EventSelect({ value, onChange, options, label, id, disabled }: {
  value: string; onChange: (value: string) => void; options: { value: string; label: string }[]
  label: string; id?: string; disabled?: boolean
}) {
  return <Select value={value} onValueChange={value => onChange(value ?? "")} disabled={disabled}>
    <SelectTrigger id={id} aria-label={label} className="w-full"><SelectValue>{options.find(option => option.value === value)?.label ?? label}</SelectValue></SelectTrigger>
    <SelectContent><SelectGroup>{options.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectGroup></SelectContent>
  </Select>
}

export function EventField({ id, label, children, description }: { id: string; label: string; children: ReactNode; description?: string }) {
  return <Field><FieldLabel htmlFor={id}>{label}</FieldLabel>{children}{description && <FieldDescription>{description}</FieldDescription>}</Field>
}

export function EventEditor({ event, onClose, onSaved }: {
  event?: EventDetail; onClose: () => void; onSaved: (event: EventDetail) => void
}) {
  const [title, setTitle] = useState(event?.title ?? "")
  const [description, setDescription] = useState(event?.description ?? "")
  const [location, setLocation] = useState(event?.location ?? "")
  const [start, setStart] = useState(event ? localDateInput(event.starts_at) : "")
  const [end, setEnd] = useState(event ? localDateInput(event.ends_at) : "")
  const [capacity, setCapacity] = useState(event?.capacity?.toString() ?? "")
  const [budget, setBudget] = useState(event?.budget_toman?.toString() ?? "")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (new Date(end) <= new Date(start)) { setError("زمان پایان باید بعد از شروع باشد."); return }
    setBusy(true); setError(null)
    const input: EventInput = { title, description, location, starts_at: new Date(start).toISOString(), ends_at: new Date(end).toISOString(), capacity: capacity ? Number(capacity) : null, budget_toman: budget ? Number(budget) : null }
    try { onSaved(event ? await saveEvent(event.id, { ...input, revision: event.revision }) : await createEvent(input)) }
    catch (cause) { setError(eventError(cause)) }
    finally { setBusy(false) }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}>
    <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl" showCloseButton={!busy}>
      <DialogHeader><DialogTitle>{event ? "ویرایش رویداد" : "رویداد جدید"}</DialogTitle></DialogHeader>
      <form onSubmit={submit} className="flex flex-col gap-5">
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        <fieldset disabled={busy} className="min-w-0"><FieldGroup>
          <EventField id="event-title" label="عنوان رویداد"><Input id="event-title" autoFocus required maxLength={200} value={title} onChange={e => setTitle(e.target.value)} placeholder="مثلاً دورهمی پایان فصل" /></EventField>
          <EventField id="event-description" label="دربارهٔ رویداد"><Textarea id="event-description" maxLength={5000} value={description} onChange={e => setDescription(e.target.value)} placeholder="برنامهٔ رویداد و نکاتی که مهمان‌ها باید بدانند" /></EventField>
          <div className="grid gap-4 sm:grid-cols-2">
            <EventField id="event-start" label="شروع"><Input id="event-start" type="datetime-local" dir="ltr" required value={start} onChange={e => setStart(e.target.value)} /></EventField>
            <EventField id="event-end" label="پایان"><Input id="event-end" type="datetime-local" dir="ltr" required min={start || undefined} value={end} onChange={e => setEnd(e.target.value)} /></EventField>
          </div>
          <EventField id="event-location" label="محل برگزاری یا لینک جلسه"><Input id="event-location" maxLength={300} value={location} onChange={e => setLocation(e.target.value)} /></EventField>
          <div className="grid gap-4 sm:grid-cols-2">
            <EventField id="event-capacity" label="ظرفیت مهمان‌ها"><Input id="event-capacity" type="number" min={1} max={100000} step={1} value={capacity} onChange={e => setCapacity(e.target.value)} /></EventField>
            <EventField id="event-budget" label="بودجهٔ برنامه‌ریزی‌شده (تومان)"><Input id="event-budget" type="text" inputMode="numeric" dir="ltr" value={formatToman(budget)} onChange={e => setBudget(e.target.value.replace(/\D/g, ""))} /></EventField>
          </div>
        </FieldGroup></fieldset>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>انصراف</Button><Button type="submit" disabled={busy}>{busy && <Spinner data-icon="inline-start" />}{event ? "ذخیرهٔ تغییرات" : "ساخت رویداد"}</Button></div>
      </form>
    </DialogContent>
  </Dialog>
}
