import { useId } from "react"
import { Link } from "react-router"
import { Box, Button, CircularProgress, Typography, TextField } from "@/components/ui-compat"
import type { CandidateSummary } from "@/lib/api"

export function CandidatePicker({
  query, onQueryChange, candidates, selectedId, onSelect, loading,
}: {
  query: string
  onQueryChange: (value: string) => void
  candidates: CandidateSummary[]
  selectedId: string
  onSelect: (id: string) => void
  loading: boolean
}) {
  const listId = useId()
  const selected = candidates.find(candidate => candidate.id === selectedId)
  return <Box>
    <Box sx={{ position: "relative" }}>
      <TextField label="کاندیدا" value={selected ? selected.full_name : query} onChange={event => onQueryChange(event.target.value)}
        placeholder="حداقل دو حرف از نام، ایمیل یا عنوان حرفه‌ای را بنویسید"
        slotProps={{ htmlInput: { role: "combobox", "aria-autocomplete": "list", "aria-controls": listId, "aria-expanded": Boolean(query.trim().length >= 2 && !selected) } }} />
      {!selected && query.trim().length >= 2 && <Box id={listId} role="listbox" sx={{ position: "absolute", top: "calc(100% + 4px)", insetInline: 0, zIndex: 20, maxHeight: 240, overflowY: "auto", bgcolor: "background.paper", border: 1, borderRadius: 1, boxShadow: "0 12px 28px rgba(15, 23, 42, 0.16)" }}>
        {loading && <Box sx={{ p: 2 }}><CircularProgress size={20} aria-label="جست‌وجوی کاندیداها" /></Box>}
        {!loading && !candidates.length && <Typography color="text.secondary" variant="body2" sx={{ p: 2 }}>کاندیدایی با این مشخصات پیدا نشد. <Button component={Link} to="/upload">بارگذاری رزومه</Button></Typography>}
        {!loading && candidates.map(candidate => <Button key={candidate.id} role="option" aria-selected={candidate.id === selectedId} fullWidth variant="text"
          sx={{ justifyContent: "flex-start", textAlign: "right", py: 1.25, px: 2, borderRadius: 0 }} onClick={() => onSelect(candidate.id)}>
          <span dir="auto">{candidate.full_name} · {candidate.email ?? candidate.headline ?? "بدون عنوان"}</span>
        </Button>)}
      </Box>}
    </Box>
    {selected && <Typography color="text.secondary" variant="body2" sx={{ mt: 1 }}>انتخاب‌شده: <span dir="auto">{selected.full_name}</span></Typography>}
  </Box>
}
