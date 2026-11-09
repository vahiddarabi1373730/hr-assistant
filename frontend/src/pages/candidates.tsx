import { useEffect, useState } from "react"
import { Link } from "react-router"
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@/components/ui-compat"
import { deleteCandidate, fetchCandidates, persianError, type CandidateSummary } from "@/lib/api"
import { formatJalali } from "@/lib/jalali"
import { Trash2 } from "lucide-react"

export function CandidateBankPage() {
  const [items, setItems] = useState<CandidateSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [deleting, setDeleting] = useState<CandidateSummary | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    fetchCandidates()
      .then((data) => {
        if (active) setItems(data)
      })
      .catch((cause) => {
        if (active) setError(persianError(cause))
      })
    return () => {
      active = false
    }
  }, [])
  const filtered = (items ?? []).filter((item) =>
    `${item.full_name} ${item.email ?? ""} ${item.headline ?? ""}`
      .toLocaleLowerCase()
      .includes(search.toLocaleLowerCase()),
  )
  async function removeCandidate() {
    if (!deleting) return
    setDeleteBusy(true)
    setDeleteError(null)
    try {
      await deleteCandidate(deleting.id)
      setItems((old) => old?.filter((item) => item.id !== deleting.id) ?? null)
      setDeleting(null)
    } catch (cause) {
      setDeleteError(persianError(cause))
    } finally {
      setDeleteBusy(false)
    }
  }
  return (
    <>
      <Typography variant="h4">بانک کاندیداها</Typography>
      <Typography color="text.secondary" sx={{ mt: 1, mb: 3 }}>
        هر فرد یک پروفایل دارد؛ رزومه‌های جدید و اصلاحات HR در همان پرونده جمع
        می‌شوند.
      </Typography>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Paper variant="outlined" sx={{ overflow: "hidden" }}>
        <Box sx={{ p: 2.5 }}>
          <TextField
            label="جست‌وجوی نام، ایمیل یا عنوان"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            sx={{ width: "100%", maxWidth: 440 }}
          />
        </Box>
        {items === null && !error ? (
          <Box sx={{ p: 5, textAlign: "center" }}>
            <CircularProgress />
          </Box>
        ) : (
          <TableContainer>
            <Table sx={{ minWidth: 650 }} aria-label="بانک کاندیداها">
              <TableHead>
                <TableRow>
                  <TableCell>نام و عنوان حرفه‌ای</TableCell>
                  <TableCell>ایمیل</TableCell>
                  <TableCell>تاریخ ثبت</TableCell>
                  <TableCell>عملیات</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.map((item) => (
                  <TableRow key={item.id} hover>
                    <TableCell>
                      <Typography sx={{ fontWeight: 650 }} dir="auto">
                        {item.full_name}
                      </Typography>
                      <Typography
                        color="text.secondary"
                        sx={{ fontSize: 12 }}
                        dir="auto"
                      >
                        {item.headline}
                      </Typography>
                      {item.new_resume_received && (
                        <Chip
                          size="small"
                          color="info"
                          label="رزومهٔ جدید"
                          sx={{ mt: 1 }}
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography dir="auto" sx={{ fontSize: 13 }}>
                        {item.email ?? "ثبت نشده"}
                      </Typography>
                    </TableCell>
                    <TableCell>{formatJalali(item.created_at)}</TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={1}>
                        <Button component={Link} to={`/candidates/${item.id}`}>
                          مشاهدهٔ پروفایل
                        </Button>
                        <Button
                          color="error"
                          variant="outlined"
                          size="small"
                          startIcon={<Trash2 size={16} />}
                          onClick={() => {
                            setDeleteError(null)
                            setDeleting(item)
                          }}
                        >
                          حذف
                        </Button>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
        {items && !filtered.length && (
          <Stack sx={{ p: 4, alignItems: "center" }}>
            <Typography>کاندیدایی پیدا نشد.</Typography>
            <Button component={Link} to="/resumes">
              رفتن به رزومه‌ها
            </Button>
          </Stack>
        )}
      </Paper>
      <Dialog
        open={Boolean(deleting)}
        onClose={deleteBusy ? undefined : () => setDeleting(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>حذف کامل کاندیدا</DialogTitle>
        <DialogContent>
          {deleteError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {deleteError}
            </Alert>
          )}
          <DialogContentText>
            پروندهٔ «{deleting?.full_name}»، همهٔ فایل‌های رزومه، درخواست‌ها،
            یادداشت‌ها و تاریخچهٔ مرتبط حذف می‌شوند. مصاحبه‌های تقویمی لغو خواهند
            شد. گزارش ممیزی سازمان که شناسهٔ رکوردها را نگه می‌دارد حذف نمی‌شود.
            این کار قابل بازگشت نیست.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button disabled={deleteBusy} onClick={() => setDeleting(null)}>
            انصراف
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={deleteBusy}
            onClick={() => void removeCandidate()}
          >
            {deleteBusy ? "در حال حذف…" : "حذف کامل کاندیدا"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
