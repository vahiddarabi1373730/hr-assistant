import { useEffect, useRef, useState } from "react"
import { Link, useSearchParams } from "react-router"
import { Alert, Button as LegacyButton, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField } from "@/components/ui-compat"
import { ArrowLeft, BriefcaseBusiness, Columns3, Inbox, Lightbulb, MapPin, Plus, Search, ShieldCheck, SlidersHorizontal, Sparkles, Upload, Users, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { ApiError, persianError } from "@/lib/api"
import { enumLabels, fieldLabels, filterLabel, opLabels, searchWarning, streamSearch, type SearchCandidate, type SearchDSL, type SearchFilter } from "@/lib/search"

const emptyDSL: SearchDSL = { filters: [], semantic_query: "" }


function FilterEditor({ filter, onClose, onSave }: { filter: SearchFilter; onClose: () => void; onSave: (value: SearchFilter) => void }) {
  const [value, setValue] = useState(filter)
  const numeric = value.field === "years_experience_total"
  const exact = ["stage", "role_status", "role_id", "owner_id"].includes(value.field)
  const operators: SearchFilter["op"][] = numeric ? ["gte", "lte", "gt", "lt", "eq", "ne"] : exact ? ["eq", "ne"] : ["contains", "not_contains", "eq", "ne"]
  const enums = value.field === "stage" ? ["sourced", "screening", "interview", "offer", "hired", "rejected", "withdrawn"] : value.field === "role_status" ? ["draft", "open", "paused", "closed"] : null
  return <Dialog open onClose={onClose} fullWidth maxWidth="sm">
    <DialogTitle>ویرایش شرط جست‌وجو</DialogTitle>
    <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
      <TextField select label="فیلد" value={value.field} onChange={e => {
        const field = e.target.value as SearchFilter["field"]
        setValue({ ...value, field, op: field === "years_experience_total" ? "gte" : ["stage", "role_status", "role_id", "owner_id"].includes(field) ? "eq" : "contains", value: "" })
      }}>{Object.entries(fieldLabels).map(([field, label]) => <MenuItem key={field} value={field}>{label}</MenuItem>)}</TextField>
      <TextField select label="رابطه" value={value.op} onChange={e => setValue({ ...value, op: e.target.value as SearchFilter["op"] })}>
        {operators.map(op => <MenuItem key={op} value={op}>{opLabels[op]}</MenuItem>)}
      </TextField>
      <TextField select={Boolean(enums)} label="مقدار" value={value.value} onChange={e => setValue({ ...value, value: e.target.value })}
        helperText={numeric ? "فقط سال‌های قابل محاسبه از تاریخ‌های کامل؛ سابقهٔ نامشخص شامل نمی‌شود." : value.field.endsWith("_id") ? "شناسهٔ دقیق فرصت یا کاربر را وارد کنید." : "مقدار مطابق پروفایل؛ فارسی یا انگلیسی"}>
        {enums?.map(item => <MenuItem key={item} value={item}>{enumLabels[item]}</MenuItem>)}
      </TextField>
      <TextField select label="امکان کنار گذاشتن در جست‌وجوی خالی" value={value.constraint_softness} onChange={e => setValue({ ...value, constraint_softness: Number(e.target.value) })}>
        <MenuItem value={0}>هرگز؛ شرط قطعی</MenuItem><MenuItem value={0.3}>کم</MenuItem><MenuItem value={0.6}>متوسط</MenuItem><MenuItem value={1}>زیاد؛ اولین پیشنهاد برای حذف</MenuItem>
        {![0, 0.3, 0.6, 1].includes(value.constraint_softness) ? <MenuItem value={value.constraint_softness}>برداشت اولیه ({value.constraint_softness.toLocaleString("fa-IR")})</MenuItem> : null}
      </TextField>
      <Alert severity="info">تغییر شرط‌ها فقط روی جست‌وجو اثر دارد؛ مرحلهٔ هیچ کاندیدایی تغییر نمی‌کند.</Alert>
    </Stack></DialogContent>
    <DialogActions><LegacyButton onClick={onClose}>انصراف</LegacyButton><LegacyButton variant="contained" disabled={!value.value.trim()} onClick={() => onSave(value)}>اعمال و جست‌وجو</LegacyButton></DialogActions>
  </Dialog>
}


export function SearchPage() {
  const [params, setParams] = useSearchParams()
  const initial = params.get("q") ?? ""
  const [query, setQuery] = useState(initial)
  const [dsl, setDSL] = useState<SearchDSL>(emptyDSL)
  const [items, setItems] = useState<SearchCandidate[]>([])
  const [loading, setLoading] = useState(false)
  const [started, setStarted] = useState(false)
  const [mode, setMode] = useState("")
  const [warnings, setWarnings] = useState<string[]>([])
  const [toast, setToast] = useState("")
  const [error, setError] = useState("")
  const [relax, setRelax] = useState<string | null>(null)
  const [editing, setEditing] = useState<SearchFilter | null>(null)
  const controller = useRef<AbortController | null>(null)
  const sequence = useRef(0)

  async function run(input: { query: string } | { dsl: SearchDSL; relax?: boolean }) {
    controller.current?.abort()
    const abort = new AbortController()
    controller.current = abort
    const request = ++sequence.current
    if ("query" in input) setDSL(emptyDSL)
    setLoading(true); setStarted(true); setItems([]); setError(""); setWarnings([]); setRelax(null)
    try {
      await streamSearch(input, abort.signal, event => {
        if (abort.signal.aborted || sequence.current !== request) return
        if (event.type === "filters") {
          setDSL(event.dsl); setMode(event.mode); setWarnings(event.warnings)
          if (event.warnings.includes("SEARCH_PARSE_FAILED")) setToast(searchWarning.SEARCH_PARSE_FAILED)
        } else if (event.type === "candidate") setItems(old => [...old, event.candidate])
        else if (event.type === "warning") setWarnings(old => old.includes(event.code) ? old : [...old, event.code])
        else setRelax(event.relax_filter_id)
      })
    } catch (e) {
      if (!abort.signal.aborted) setError(e instanceof ApiError && e.code === "INVALID_SEARCH" ? "شرط جست‌وجو معتبر نیست. ویژگی‌های حساس قابل جست‌وجو نیستند؛ عددها و نفی را در شرط‌ها وارد کنید." : persianError(e))
    } finally { if (!abort.signal.aborted) setLoading(false) }
  }
  useEffect(() => {
    if (initial.trim()) { setQuery(initial); void run({ query: initial }) }
    return () => controller.current?.abort()
    // URL submissions, not typing, initiate a new parse.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return
    if (query.trim() === initial) void run({ query: query.trim() })
    else setParams({ q: query.trim() })
  }
  function update(next: SearchDSL) { setDSL(next); void run({ dsl: next }) }
  const softest = dsl.filters.find(f => f.id === relax)


  function chooseExample(value: string) {
    setQuery(value)
    if (value === initial) void run({ query: value })
    else setParams({ q: value })
  }

  return <>
    <header className="page-heading">
      <div><h1>همکار بعدی تیم را پیدا کنید</h1><p>در تمام بانک کاندیداها، با نام، مهارت یا تجربه جست‌وجو کنید.</p></div>
      <div className="heading-actions">
        <Button variant="outline" render={<Link to="/board" />} nativeButton={false}><Columns3 data-icon="inline-start" />برد استخدام</Button>
        <Button render={<Link to="/upload" />} nativeButton={false}><Upload data-icon="inline-start" />افزودن رزومه</Button>
      </div>
    </header>

    <section className="search-workbench" aria-labelledby="search-title">
      <h2 className="search-workbench-title" id="search-title"><Sparkles aria-hidden="true" />چه کسی را جست‌وجو می‌کنید؟</h2>
      <form onSubmit={submit}>
        <FieldGroup><Field>
          <FieldLabel htmlFor="candidate-query" className="sr-only">جست‌وجوی کاندیدا</FieldLabel>
          <InputGroup className="search-composer">
            <InputGroupInput id="candidate-query" placeholder="مثلاً توسعه‌دهنده React با ۳ سال سابقه…" value={query} onChange={e => setQuery(e.target.value)} maxLength={1000} dir="auto" autoComplete="off" />
            <InputGroupAddon align="inline-end"><Button type="submit" disabled={!query.trim()}><Search data-icon="inline-start" />جست‌وجو</Button></InputGroupAddon>
          </InputGroup>
        </Field></FieldGroup>
      </form>
      <div className="search-examples"><span>برای شروع امتحان کنید:</span>
        {["توسعه‌دهنده React", "کارشناس منابع انسانی", "مدیر فروش در تهران"].map(example => <Button key={example} variant="outline" size="sm" onClick={() => chooseExample(example)}>{example}</Button>)}
      </div>
      <p className="search-scope"><ShieldCheck aria-hidden="true" />همه کاندیداها جست‌وجو می‌شوند؛ حتی افرادی که درخواست شغلی فعال ندارند.</p>
    </section>

    {started && <section className="legacy-paper mt-5 p-5" aria-label="شرط‌های جست‌وجو">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-sm font-semibold"><SlidersHorizontal size={16} />برداشت از جست‌وجو</h2><Button variant="ghost" size="sm" onClick={() => setEditing({ id: crypto.randomUUID().replaceAll("-", "").slice(0, 16), field: "skill", op: "contains", value: "", constraint_softness: 0 })}><Plus data-icon="inline-start" />افزودن شرط</Button></div>
      {dsl.filters.length > 0 && <div className="mb-4 flex flex-wrap gap-2">{dsl.filters.map(filter => <Badge variant="outline" key={filter.id} className="gap-1 py-1">
        <button type="button" onClick={() => setEditing(filter)}>{filterLabel(filter)}</button>
        <button type="button" onClick={() => update({ ...dsl, filters: dsl.filters.filter(f => f.id !== filter.id) })} aria-label={`حذف شرط ${filterLabel(filter)}`} className="rounded p-1 hover:bg-muted"><X size={12} /></button>
      </Badge>)}</div>}
      <form onSubmit={event => { event.preventDefault(); update(dsl) }} className="flex items-end gap-3">
        <TextField fullWidth label="واژه‌های جست‌وجو" value={dsl.semantic_query} onChange={e => setDSL({ ...dsl, semantic_query: e.target.value })} />
        <Button type="submit" variant="outline" aria-label="اجرای شرط‌ها و واژه‌ها">اعمال</Button>
      </form>
      <p className="mt-3 text-xs text-muted-foreground">عدد و نفی را در شرط‌ها نگه دارید.{mode === "sql" ? " ویرایش دستی شرط‌ها فعال است." : " برای ویرایش هر شرط، روی آن بزنید."}</p>
    </section>}
    {warnings.map(code => <Alert severity="warning" key={code} sx={{ mt: 2 }}>{searchWarning[code] ?? "بخشی از جست‌وجو در دسترس نیست."}</Alert>)}
    {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
    {toast && <Alert severity="warning" sx={{ mt: 2 }} onClose={() => setToast("")}>{toast}</Alert>}

    <div aria-live="polite" aria-busy={loading}>
      {started && <div className="result-summary"><h2>{loading ? "در حال یافتن کاندیداها…" : `نتایج جست‌وجو (${items.length.toLocaleString("fa-IR")})`}</h2>{!loading && items.length > 0 && <p>ترتیب نتایج، توصیه استخدام نیست.</p>}</div>}
      {items.length > 0 && <div className="search-result-list">{items.map(item => <article key={item.id} className="search-result-row">
        <div className="candidate-initials" aria-hidden="true">{item.full_name.split(" ").slice(0, 2).map(word => word[0]).join(" ")}</div>
        <div className="min-w-0"><Link className="result-name" to={`/candidates/${item.id}`} dir="auto">{item.full_name}</Link><p className="result-headline truncate" dir="auto" title={item.headline ?? undefined}>{item.headline ?? "عنوان حرفه‌ای ثبت نشده"}</p></div>
        <div className="result-details"><span><MapPin /><bdi>{item.location ?? "محل سکونت نامشخص"}</bdi></span><span><BriefcaseBusiness />{item.years_experience_total === null ? "سابقه نامشخص" : `${item.years_experience_total.toLocaleString("fa-IR")} سال سابقه`}</span></div>
        <Button variant="ghost" size="sm" render={<Link to={`/candidates/${item.id}`} />} nativeButton={false}>پرونده<ArrowLeft data-icon="inline-end" /></Button>
      </article>)}</div>}
      {started && !items.length && !loading && !error && <Empty className="legacy-paper py-12"><EmptyHeader><EmptyMedia variant="icon"><Search /></EmptyMedia><EmptyTitle>کاندیدایی با این شرط‌ها پیدا نشد</EmptyTitle><EmptyDescription>واژه‌ها یا شرط‌های جست‌وجو را تغییر دهید و دوباره امتحان کنید.</EmptyDescription></EmptyHeader>{softest && <EmptyContent><Button variant="outline" onClick={() => void run({ dsl, relax: true })}>کنار گذاشتن «{filterLabel(softest)}»</Button></EmptyContent>}</Empty>}
      {!started && <div className="search-idle">
        <h2 className="section-heading">فضای کار استخدام، یک‌جا در دسترس شما</h2>
        <div className="workspace-shortcuts">
          {[{ path: "/candidates", title: "بانک کاندیداها", description: "پروفایل‌ها، مهارت‌ها و سابقه هر فرد", icon: Users }, { path: "/roles", title: "فرصت‌های شغلی", description: "مدیریت فرصت‌ها و پیگیری مسیر جذب", icon: BriefcaseBusiness }, { path: "/review", title: "صف بازبینی", description: "بررسی رزومه‌های نیازمند توجه شما", icon: Inbox }].map(({ path, title, description, icon: Icon }) => <Link key={path} to={path} className="workspace-shortcut"><span className="shortcut-icon"><Icon /></span><div><strong>{title}</strong><p>{description}</p></div><ArrowLeft aria-hidden="true" /></Link>)}
        </div>
        <div className="search-guidance"><Lightbulb aria-hidden="true" /><div><strong>یک جست‌وجوی خوب، از توضیح روشن شروع می‌شود.</strong><p>مهارت، عنوان شغلی یا تجربه موردنیاز را بنویسید. بعد از جست‌وجو می‌توانید شرط‌ها را ببینید و ویرایش کنید. بررسی نهایی و تصمیم استخدام با شماست.</p></div></div>
      </div>}
    </div>
    {editing && <FilterEditor key={editing.id} filter={editing} onClose={() => setEditing(null)} onSave={value => { setEditing(null); update({ ...dsl, filters: [...dsl.filters.filter(f => f.id !== value.id), value] }) }} />}
  </>
}
