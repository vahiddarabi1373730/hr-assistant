import { useEffect, useState } from "react"
import { Link } from "react-router"
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, Paper,
  DialogTitle, MenuItem, Stack, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TextField, Typography,
} from "@/components/ui-compat"
import { Eye } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import {
  addToRole, createRole, fetchRoles, fetchPipelineOwners, persianError, rankRoleCandidates,
  type PipelineOwner, type PipelineRole, type RankedRoleCandidate, type RoleDetails,
} from "@/lib/api"
import { ownerLabel } from "@/lib/pipeline"

function emptyRoleDetails(): RoleDetails {
  return {
    description: "",
    responsibilities: [],
    required_skills: [],
    preferred_skills: [],
    min_experience_years: null,
    education: "",
    seniority: "",
    employment_type: "",
    work_mode: "",
    location: "",
    salary_range: "",
  }
}

function textLines(value: string): string[] {
  return value.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
}

export function OwnerSelect({ owners, value, onChange, disabled = false, label = "مسئول" }: {
  owners: PipelineOwner[]; value: string | null; onChange: (id: string | null) => void; disabled?: boolean; label?: string
}) {
  return <TextField select fullWidth label={label} value={value ?? ""} disabled={disabled}
    onChange={event => onChange(event.target.value || null)}>
    <MenuItem value="">بدون مسئول</MenuItem>
    {value && !owners.some(owner => owner.id === value) && <MenuItem value={value} disabled>مسئول پیشین</MenuItem>}
    {owners.map(owner => <MenuItem key={owner.id} value={owner.id} disabled={!owner.active}>
      <span dir="auto">{ownerLabel(owners, owner.id)}</span>
    </MenuItem>)}
  </TextField>
}

export function OwnerBadge({ owners, id }: { owners: PipelineOwner[]; id: string | null }) {
  return <Chip size="small" variant="outlined" label={ownerLabel(owners, id)}
    sx={{ maxWidth: "100%", color: id && owners.some(o => o.id === id && !o.active) ? "text.disabled" : "text.secondary", fontSize: 11 }} />
}

export function CreateRoleDialog({ open, onClose, onCreated, owners }: {
  open: boolean; onClose: () => void; onCreated: (role: PipelineRole) => void; owners: PipelineOwner[]
}) {
  const [title, setTitle] = useState("")
  const [owner, setOwner] = useState<string | null>(null)
  const [details, setDetails] = useState<RoleDetails>(emptyRoleDetails)
  const [responsibilities, setResponsibilities] = useState("")
  const [requiredSkills, setRequiredSkills] = useState("")
  const [preferredSkills, setPreferredSkills] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm">
    <form onSubmit={async event => {
      event.preventDefault(); setBusy(true); setError(null)
      try {
        const role = await createRole(title.trim(), owner, {
          ...details,
          responsibilities: textLines(responsibilities),
          required_skills: textLines(requiredSkills),
          preferred_skills: textLines(preferredSkills),
        })
        setTitle(""); setOwner(null); setDetails(emptyRoleDetails())
        setResponsibilities(""); setRequiredSkills(""); setPreferredSkills("")
        onCreated(role)
      }
      catch (cause) { setError(persianError(cause)) } finally { setBusy(false) }
    }}>
      <DialogTitle>فرصت شغلی جدید</DialogTitle>
      <DialogContent><Stack spacing={3} sx={{ pt: 1 }}>
        {error && <Alert severity="error">{error}</Alert>}
        <Typography color="text.secondary" variant="body2">مشخصات شغل را ثبت کنید تا رزومه‌های مرتبط با این فرصت با شرح آگهی مقایسه شوند. همهٔ فیلدها به‌جز عنوان اختیاری‌اند.</Typography>
        <TextField autoFocus required disabled={busy} label="عنوان فرصت شغلی" value={title} onChange={e => setTitle(e.target.value)} slotProps={{ htmlInput: { maxLength: 200, dir: "auto" } }} />
        <OwnerSelect owners={owners} value={owner} onChange={setOwner} disabled={busy} />

        <Typography variant="h6">شرح و الزامات شغل</Typography>
        <TextField multiline minRows={4} disabled={busy} label="شرح شغل" value={details.description} onChange={e => setDetails(previous => ({ ...previous, description: e.target.value }))} helperText="هدف نقش، زمینهٔ تیم و خروجی مورد انتظار را توضیح دهید." slotProps={{ htmlInput: { maxLength: 5000, dir: "auto" } }} />
        <TextField multiline minRows={3} disabled={busy} label="مسئولیت‌های اصلی (هر مورد در یک خط)" value={responsibilities} onChange={e => setResponsibilities(e.target.value)} slotProps={{ htmlInput: { maxLength: 5000, dir: "auto" } }} />
        <TextField multiline minRows={3} disabled={busy} label="مهارت‌های ضروری (هر مورد در یک خط)" value={requiredSkills} onChange={e => setRequiredSkills(e.target.value)} slotProps={{ htmlInput: { maxLength: 3000, dir: "auto" } }} />
        <TextField multiline minRows={2} disabled={busy} label="مهارت‌های ترجیحی (هر مورد در یک خط)" value={preferredSkills} onChange={e => setPreferredSkills(e.target.value)} slotProps={{ htmlInput: { maxLength: 3000, dir: "auto" } }} />

        <Typography variant="h6">شرایط همکاری</Typography>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <TextField type="number" disabled={busy} label="حداقل سابقه (سال)" value={details.min_experience_years ?? ""} onChange={e => setDetails(previous => ({ ...previous, min_experience_years: e.target.value === "" ? null : Number(e.target.value) }))} slotProps={{ htmlInput: { min: 0, max: 60, step: 1 } }} />
          <TextField disabled={busy} label="تحصیلات موردنیاز" value={details.education} onChange={e => setDetails(previous => ({ ...previous, education: e.target.value }))} slotProps={{ htmlInput: { maxLength: 200, dir: "auto" } }} />
          <TextField select disabled={busy} label="سطح ارشدیت" value={details.seniority} onChange={e => setDetails(previous => ({ ...previous, seniority: e.target.value as RoleDetails["seniority"] }))}>
            <MenuItem value="">مشخص نشده</MenuItem><MenuItem value="intern">کارآموز</MenuItem><MenuItem value="junior">جونیور</MenuItem><MenuItem value="mid">میانی</MenuItem><MenuItem value="senior">ارشد</MenuItem><MenuItem value="lead">سرپرست / مدیر</MenuItem>
          </TextField>
        </Stack>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <TextField select disabled={busy} label="نوع همکاری" value={details.employment_type} onChange={e => setDetails(previous => ({ ...previous, employment_type: e.target.value as RoleDetails["employment_type"] }))}>
            <MenuItem value="">مشخص نشده</MenuItem><MenuItem value="full_time">تمام‌وقت</MenuItem><MenuItem value="part_time">پاره‌وقت</MenuItem><MenuItem value="contract">قراردادی</MenuItem><MenuItem value="internship">کارآموزی</MenuItem>
          </TextField>
          <TextField select disabled={busy} label="شیوهٔ حضور" value={details.work_mode} onChange={e => setDetails(previous => ({ ...previous, work_mode: e.target.value as RoleDetails["work_mode"] }))}>
            <MenuItem value="">مشخص نشده</MenuItem><MenuItem value="onsite">حضوری</MenuItem><MenuItem value="hybrid">ترکیبی</MenuItem><MenuItem value="remote">دورکاری</MenuItem>
          </TextField>
        </Stack>
        <TextField disabled={busy} label="شهر یا محدودهٔ جغرافیایی" value={details.location} onChange={e => setDetails(previous => ({ ...previous, location: e.target.value }))} slotProps={{ htmlInput: { maxLength: 200, dir: "auto" } }} />
        <TextField disabled={busy} label="بازهٔ حقوق و مزایا (اختیاری)" value={details.salary_range} onChange={e => setDetails(previous => ({ ...previous, salary_range: e.target.value }))} slotProps={{ htmlInput: { maxLength: 300, dir: "auto" } }} />
      </Stack></DialogContent>
      <DialogActions sx={{ p: 3 }}><Button disabled={busy} onClick={onClose}>انصراف</Button>
        <Button type="submit" variant="contained" disabled={busy || !title.trim()}>{busy ? "در حال ساخت…" : "ساخت پیش‌نویس"}</Button>
      </DialogActions>
    </form>
  </Dialog>
}

export function RoleCandidateRanking({ roleId }: { roleId: string }) {
  const [items, setItems] = useState<RankedRoleCandidate[] | null>(null)
  const [unrankedCount, setUnrankedCount] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function analyze() {
    setBusy(true); setError(null)
    try {
      const result = await rankRoleCandidates(roleId)
      setItems(result.items); setUnrankedCount(result.unranked_count)
    } catch (cause) {
      setError(persianError(cause))
    } finally {
      setBusy(false)
    }
  }
  return <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
    <Stack direction={{ xs: "column", sm: "row" }} sx={{ justifyContent: "space-between", alignItems: { sm: "center" }, gap: 2, mb: 2 }}>
      <Box><Typography variant="h6">رتبه‌بندی رزومه‌های این فرصت</Typography>
        <Typography color="text.secondary" variant="body2">رزومه‌های تأییدشده با شرح آگهی مقایسه و بر اساس شباهت معنایی مرتب می‌شوند.</Typography></Box>
      <Button variant="contained" disabled={busy} onClick={() => void analyze()}>{busy ? "در حال مقایسه…" : "تحلیل و مرتب‌سازی"}</Button>
    </Stack>
    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
    {busy && <CircularProgress aria-label="مقایسهٔ رزومه‌ها با آگهی" />}
    {items && !items.length && <Alert severity="info">هنوز کاندیدایی به این فرصت اضافه نشده است.</Alert>}
    {items && items.length > 0 && <>
      <Typography color="text.secondary" variant="body2" sx={{ mb: 2 }}>امتیاز، میزان شباهت اطلاعات حرفه‌ای با شرح شغل است و احتمال استخدام یا تصمیم خودکار نیست. پروفایل تأییدشده مقایسه می‌شود؛ رزومهٔ جدیدِ در انتظار بررسی در امتیاز نیامده است.</Typography>
      {unrankedCount > 0 && <Alert severity="warning" sx={{ mb: 2 }}>{unrankedCount.toLocaleString("fa-IR")} رزومه به‌دلیل کافی یا آماده نبودن اطلاعات لازم برای مقایسه، امتیاز نگرفته است.</Alert>}
      <TableContainer>
        <Table aria-label="کاندیداهای مرتب‌شده بر اساس تطابق با آگهی" sx={{ minWidth: 520 }}>
          <TableHead><TableRow>
            <TableCell>نام</TableCell><TableCell>ایمیل</TableCell><TableCell>تطابق</TableCell><TableCell>رزومه</TableCell>
          </TableRow></TableHead>
          <TableBody>{items.map(item => <TableRow key={item.application_id}>
            <TableCell dir="auto">{item.full_name}</TableCell>
            <TableCell dir="ltr">{item.email ?? "ثبت نشده"}</TableCell>
            <TableCell>{item.similarity === null ? "بدون رتبه" : item.similarity.toLocaleString("fa-IR", { maximumFractionDigits: 3 })}</TableCell>
            <TableCell><Link
              className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
              to={`/candidates/${item.candidate_id}`}
              aria-label={`مشاهدهٔ رزومهٔ ${item.full_name}`}
              title="مشاهدهٔ رزومه"
            ><Eye aria-hidden="true" /></Link></TableCell>
          </TableRow>)}</TableBody>
        </Table>
      </TableContainer>
    </>}
  </Paper>
}

/** Candidate-detail sourcing shares the same canonical/reopen endpoint as the board. */
export function AddToRoleButton({ candidateId, onAdded }: { candidateId: string; onAdded: () => void }) {
  const [open, setOpen] = useState(false)
  const [roles, setRoles] = useState<PipelineRole[]>([])
  const [owners, setOwners] = useState<PipelineOwner[]>([])
  const [role, setRole] = useState("")
  const [owner, setOwner] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    Promise.all([fetchRoles(controller.signal), fetchPipelineOwners(controller.signal)]).then(([r, o]) => {
      if (!controller.signal.aborted) {
        const openRoles = r.items.filter(item => item.status === "open")
        setRoles(openRoles)
        setRole(openRoles[0]?.id ?? "")
        setOwners(o.items)
      }
    }).catch(cause => { if (!controller.signal.aborted) setError(persianError(cause)) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [open])
  return <>
    <Button variant="contained" onClick={() => { setOpen(true); setSuccess(false); setRole(""); setLoading(true); setError(null) }}>افزودن به فرصت شغلی</Button>
    {success && <Alert severity="success">درخواست در همان پرونده ثبت یا بازگشایی شد. <Button component={Link} to={`/roles/${role}`}>مشاهدهٔ برد</Button></Alert>}
    <Dialog open={open} onClose={busy ? undefined : () => setOpen(false)} fullWidth maxWidth="sm">
      <DialogTitle>افزودن کاندیدا به فرصت شغلی</DialogTitle>
      <DialogContent><Stack spacing={3} sx={{ pt: 1 }}>
        {loading && <CircularProgress aria-label="بارگذاری فرصت‌های شغلی" />}
        {error && <Alert severity="error">{error}</Alert>}
        <Typography variant="body2" color="text.secondary">درخواست تکراری ساخته نمی‌شود. درخواست پایان‌یافتهٔ همین فرد در همین فرصت شغلی، با حفظ تاریخچه به «شناسایی‌شده» بازمی‌گردد؛ مسئول قبلی حفظ می‌شود.</Typography>
        {!loading && !roles.length && <Alert severity="info">فرصت شغلی بازی وجود ندارد. <Button component={Link} to="/roles">مدیریت فرصت‌ها</Button></Alert>}
        <TextField select label="فرصت شغلی باز" value={role} onChange={e => setRole(e.target.value)}>
          <MenuItem value="">انتخاب فرصت شغلی</MenuItem>
          {roles.map(item => <MenuItem key={item.id} value={item.id}>{item.title}</MenuItem>)}
        </TextField>
        <OwnerSelect owners={owners} value={owner} onChange={setOwner} label="مسئول درخواست جدید (اختیاری)" />
      </Stack></DialogContent>
      <DialogActions sx={{ p: 3 }}><Button disabled={busy} onClick={() => setOpen(false)}>انصراف</Button>
        <Button variant="contained" disabled={busy || loading || !role} onClick={async () => {
          setBusy(true); setError(null)
          try { await addToRole(role, candidateId, owner); setOpen(false); setSuccess(true); onAdded() }
          catch (cause) { setError(persianError(cause)) } finally { setBusy(false) }
        }}>{busy ? "در حال ثبت…" : "افزودن یا بازگشایی"}</Button>
      </DialogActions>
    </Dialog>
  </>
}
