import { useEffect, useState } from "react"
import {
  Alert, CircularProgress, MenuItem, Stack, TextField, Typography,
} from "@/components/ui-compat"
import { RoleCandidateRanking } from "@/components/pipeline-controls"
import { fetchRoles, persianError, type PipelineRole } from "@/lib/api"

export function RoleRankingsPage() {
  const [roles, setRoles] = useState<PipelineRole[] | null>(null)
  const [roleId, setRoleId] = useState("")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetchRoles(controller.signal).then(result => {
      if (controller.signal.aborted) return
      setRoles(result.items)
      setRoleId(result.items.find(role => role.status === "open")?.id ?? result.items[0]?.id ?? "")
    }).catch(cause => {
      if (!controller.signal.aborted) setError(persianError(cause))
    })
    return () => controller.abort()
  }, [])

  return <Stack spacing={3}>
    <div>
      <Typography variant="h4">تطابق کاندیداها با فرصت شغلی</Typography>
      <Typography color="text.secondary" sx={{ mt: 1 }}>یک آگهی را انتخاب کنید تا کاندیداهای مرتبط بر اساس شباهت رزومه مرتب شوند.</Typography>
    </div>
    {error && <Alert severity="error">{error}</Alert>}
    {!roles && !error && <CircularProgress aria-label="بارگذاری فرصت‌های شغلی" />}
    {roles?.length === 0 && <Alert severity="info">هنوز فرصتی برای رتبه‌بندی وجود ندارد؛ ابتدا یک فرصت شغلی بسازید.</Alert>}
    {roles && roles.length > 0 && <>
      <TextField select label="فرصت شغلی" value={roleId} onChange={event => setRoleId(event.target.value)} sx={{ maxWidth: 400 }}>
        {roles.map(role => <MenuItem key={role.id} value={role.id}>{role.title}</MenuItem>)}
      </TextField>
      {roleId && <RoleCandidateRanking key={roleId} roleId={roleId} />}
    </>}
  </Stack>
}
