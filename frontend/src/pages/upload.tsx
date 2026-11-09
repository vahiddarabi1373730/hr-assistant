import { useEffect, useRef, useState, type DragEvent } from "react"
import { Link } from "react-router"
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@/components/ui-compat"
import { ArrowLeft, FileText, Trash2, UploadCloud } from "lucide-react"
import {
  fetchRoles,
  matchCandidateToRole,
  persianError,
  uploadResume,
  type PipelineRole,
} from "@/lib/api"
import { parseStatusLabel } from "@/lib/profile"

type Entry = {
  id: number
  file: File
  state: "queued" | "processing" | "done" | "review" | "failed" | "duplicate"
  message?: string
  candidateId?: string
  matching?: boolean
  matchError?: string
  match?: { roleId: string; roleTitle: string; similarity: number | null }
}
const accept = ".pdf,.docx,.txt,.png,.jpg,.jpeg,.webp,.tif,.tiff,.doc,.rtf"
const labels = {
  queued: "آمادهٔ بارگذاری",
  processing: "در حال تحلیل",
  done: "تحلیل شد",
  review: "نیازمند بازبینی",
  failed: "ناموفق",
  duplicate: "قبلاً دریافت شده",
}

export function UploadPage() {
  const input = useRef<HTMLInputElement>(null)
  const sequence = useRef(0)
  const [entries, setEntries] = useState<Entry[]>([])
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [roles, setRoles] = useState<PipelineRole[]>([])
  const [selectedRoleId, setSelectedRoleId] = useState("")
  const [rolesError, setRolesError] = useState<string | null>(null)
  const [rolesLoading, setRolesLoading] = useState(true)
  useEffect(() => {
    let active = true
    fetchRoles()
      .then(({ items }) => {
        if (active) setRoles(items.filter((role) => role.status === "open"))
      })
      .catch((cause) => {
        if (active) setRolesError(persianError(cause))
      })
      .finally(() => {
        if (active) setRolesLoading(false)
      })
    return () => {
      active = false
    }
  }, [])
  function add(files: File[]) {
    if (busy) return
    const valid = files.filter(
      (file) => file.size > 0 && file.size <= 10 * 1024 * 1024,
    )
    setError(
      valid.length !== files.length
        ? "فایل خالی یا بزرگ‌تر از ۱۰ مگابایت به فهرست اضافه نشد."
        : null,
    )
    setEntries((old) => [
      ...old,
      ...valid.map((file) => ({
        id: sequence.current++,
        file,
        state: "queued" as const,
      })),
    ])
  }
  function drop(event: DragEvent) {
    event.preventDefault()
    setDragging(false)
    add(Array.from(event.dataTransfer.files))
  }
  async function submit() {
    setBusy(true)
    for (const entry of entries.filter((item) => item.state === "queued")) {
      setEntries((old) =>
        old.map((item) =>
          item.id === entry.id ? { ...item, state: "processing" } : item,
        ),
      )
      try {
        const result = await uploadResume(entry.file)
        const status = result.job?.status
        const state = result.duplicate
          ? "duplicate"
          : status === "needs_review"
            ? "review"
            : status &&
                ["extracted", "ocr_applied", "vision_used"].includes(status)
              ? "done"
              : "failed"
        const message = result.duplicate
          ? "نسخهٔ موجود در فهرست رزومه‌ها قابل مشاهده است."
          : status
            ? parseStatusLabel(status, result.job?.reason)
            : "پاسخ پردازش دریافت نشد."
        setEntries((old) =>
          old.map((item) =>
            item.id === entry.id
              ? { ...item, state, message, candidateId: result.candidate?.id }
              : item,
          ),
        )
      } catch (cause) {
        setEntries((old) =>
          old.map((item) =>
            item.id === entry.id
              ? { ...item, state: "failed", message: persianError(cause) }
              : item,
          ),
        )
      }
    }
    setBusy(false)
  }
  async function compare(entry: Entry) {
    const role = roles.find((item) => item.id === selectedRoleId)
    if (!role || !entry.candidateId) return
    setEntries((old) =>
      old.map((item) =>
        item.id === entry.id
          ? { ...item, matching: true, matchError: undefined }
          : item,
      ),
    )
    try {
      const match = await matchCandidateToRole(role.id, entry.candidateId)
      setEntries((old) =>
        old.map((item) =>
          item.id === entry.id
            ? {
                ...item,
                matching: false,
                match: {
                  roleId: role.id,
                  roleTitle: role.title,
                  similarity: match.similarity,
                },
              }
            : item,
        ),
      )
    } catch (cause) {
      setEntries((old) =>
        old.map((item) =>
          item.id === entry.id
            ? { ...item, matching: false, matchError: persianError(cause) }
            : item,
        ),
      )
    }
  }
  const pending = entries.filter((entry) => entry.state === "queued").length
  return (
    <>
      <Stack spacing={1} sx={{ mb: 3 }}>
        <Typography variant="h4">بارگذاری رزومه</Typography>
        <Typography color="text.secondary">
          فایل‌ها را اضافه کنید تا اطلاعات آن‌ها با هوش مصنوعی استخراج شود.
        </Typography>
      </Stack>
      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 4 }, maxWidth: 1000 }}>
        <Box
          onDragOver={(event) => {
            event.preventDefault()
            if (!busy) setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={drop}
          sx={{
            border: "2px dashed",
            borderColor: dragging ? "primary.main" : "#cbd5e1",
            borderRadius: 2,
            bgcolor: dragging ? "#eaf2fc" : "#f8fafc",
            py: { xs: 4, sm: 7 },
            px: 2,
            textAlign: "center",
          }}
        >
          <UploadCloud size={42} color="var(--primary)" aria-hidden="true" style={{ marginInline: "auto" }} />
          <Typography variant="h5" sx={{ mt: 2 }}>
            رزومه‌ها را اینجا رها کنید
          </Typography>
          <Typography
            color="text.secondary"
            sx={{ ...{ mt: 1, mb: 3 }, fontSize: 13 }}
          >
            PDF، DOCX، TXT یا تصویر؛ حداکثر ۱۰ مگابایت برای هر فایل
          </Typography>
          <Button
            variant="outlined"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            انتخاب فایل‌ها
          </Button>
          <input
            ref={input}
            type="file"
            aria-label="انتخاب فایل رزومه"
            accept={accept}
            multiple
            hidden
            onChange={(event) => {
              add(Array.from(event.target.files ?? []))
              event.target.value = ""
            }}
          />
        </Box>
        {error && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
        {entries.some((entry) => entry.candidateId) && (
          <Stack spacing={1} sx={{ mt: 3 }}>
            <TextField
              select
              label="فرصت شغلی برای مقایسه"
              value={selectedRoleId}
              onChange={(event) => setSelectedRoleId(event.target.value)}
              disabled={rolesLoading || !roles.length}
            >
              <MenuItem value="">انتخاب فرصت شغلی</MenuItem>
              {roles.map((role) => (
                <MenuItem key={role.id} value={role.id}>
                  {role.title}
                </MenuItem>
              ))}
            </TextField>
            {rolesError && <Alert severity="error">{rolesError}</Alert>}
            {rolesLoading && (
              <Typography color="text.secondary" sx={{ fontSize: 12 }}>
                در حال دریافت فرصت‌های باز…
              </Typography>
            )}
            {!rolesLoading && !rolesError && roles.length === 0 && (
              <Typography color="text.secondary" sx={{ fontSize: 12 }}>
                فرصت شغلی بازی برای مقایسه وجود ندارد.
              </Typography>
            )}
          </Stack>
        )}
        {entries.length > 0 && (
          <Stack spacing={0} sx={{ mt: 3 }}>
            {entries.map((entry) => (
              <Stack
                key={entry.id}
                direction="row"
                spacing={2}
                sx={{
                  ...{ py: 2, borderBottom: 1, borderColor: "divider" },
                  alignItems: "center",
                }}
              >
                <FileText size={22} color="var(--muted-foreground)" />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    dir="auto"
                    sx={{
                      ...{ overflowWrap: "anywhere" },
                      fontWeight: 600,
                      fontSize: 13,
                    }}
                  >
                    {entry.file.name}
                  </Typography>
                  <Typography color="text.secondary" sx={{ fontSize: 11 }}>
                    {(entry.file.size / 1024).toLocaleString("fa-IR", {
                      maximumFractionDigits: 0,
                    })}{" "}
                    کیلوبایت
                  </Typography>
                  {entry.message && (
                    <Typography
                      color={
                        entry.state === "failed" ? "error" : "text.secondary"
                      }
                      sx={{ ...{ mt: 0.5 }, fontSize: 12 }}
                    >
                      {entry.message}
                    </Typography>
                  )}
                  {entry.match && (
                    <Typography sx={{ mt: 0.5, fontSize: 12, fontWeight: 600 }}>
                      تطابق با «{entry.match.roleTitle}»:{" "}
                      {entry.match.similarity === null
                        ? "امتیاز قابل محاسبه نیست"
                        : `${Math.round(entry.match.similarity * 100).toLocaleString("fa-IR")}٪`}
                    </Typography>
                  )}
                  {entry.matchError && (
                    <Typography color="error" sx={{ mt: 0.5, fontSize: 12 }}>
                      {entry.matchError}
                    </Typography>
                  )}
                </Box>
                {entry.state === "processing" ? (
                  <CircularProgress size={20} aria-label="در حال تحلیل" />
                ) : (
                  <Chip
                    size="small"
                    label={labels[entry.state]}
                    color={
                      entry.state === "done"
                        ? "success"
                        : entry.state === "failed"
                          ? "error"
                          : entry.state === "review"
                            ? "warning"
                            : "default"
                    }
                  />
                )}
                {!busy && entry.state === "queued" && (
                  <IconButton
                    size="small"
                    aria-label={`حذف ${entry.file.name} از فهرست بارگذاری`}
                    onClick={() =>
                      setEntries((old) =>
                        old.filter((item) => item.id !== entry.id),
                      )
                    }
                  >
                    <Trash2 size={17} />
                  </IconButton>
                )}
                {!busy && entry.state === "failed" && (
                  <Button
                    size="small"
                    onClick={() =>
                      setEntries((old) =>
                        old.map((item) =>
                          item.id === entry.id
                            ? { ...item, state: "queued", message: undefined }
                            : item,
                        ),
                      )
                    }
                  >
                    تلاش مجدد
                  </Button>
                )}
                {entry.candidateId && (
                  <Button
                    size="small"
                    disabled={busy || !selectedRoleId || entry.matching}
                    onClick={() => void compare(entry)}
                  >
                    {entry.matching
                      ? "در حال مقایسه…"
                      : entry.match
                        ? "مقایسهٔ دوباره"
                        : "امتیاز تطابق"}
                  </Button>
                )}
              </Stack>
            ))}
          </Stack>
        )}
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          sx={{ ...{ mt: 3 }, justifyContent: "space-between" }}
        >
          <Button
            variant="contained"
            disabled={busy || pending === 0}
            onClick={() => void submit()}
            startIcon={
              busy ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <UploadCloud size={18} />
              )
            }
          >
            {busy
              ? "در حال بارگذاری و تحلیل…"
              : `بارگذاری و تحلیل${pending ? ` (${pending.toLocaleString("fa-IR")})` : ""}`}
          </Button>
          <Button
            component={Link}
            to="/resumes"
            endIcon={<ArrowLeft size={17} />}
          >
            مشاهدهٔ فهرست رزومه‌ها
          </Button>
        </Stack>
      </Paper>
    </>
  )
}
