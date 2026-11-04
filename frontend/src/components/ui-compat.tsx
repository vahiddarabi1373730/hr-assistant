// Transitional adapters for existing data pages. New layouts use shadcn directly.
import { Children, cloneElement, createContext, isValidElement, useContext, useEffect, useId, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react"
import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react"
import { Button as ShadButton, type buttonVariants } from "@/components/ui/button"
import type { VariantProps } from "class-variance-authority"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge as ShadBadge } from "@/components/ui/badge"
import { Alert as ShadAlert, AlertDescription } from "@/components/ui/alert"
import { Dialog as ShadDialog, DialogContent as ShadDialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle as ShadDialogTitle } from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { Separator } from "@/components/ui/separator"
import { Checkbox as ShadCheckbox } from "@/components/ui/checkbox"
import { Tabs as ShadTabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Accordion as ShadAccordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion"
import { Tooltip as ShadTooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

type AnyProps = Record<string, any> & {
  onChange?: (event: any, value?: any) => void
  onClick?: (event: any) => void
  onKeyDown?: (event: any) => void
  onDragOver?: (event: any) => void
  onDrop?: (event: any) => void
  onDragStart?: (event: any) => void
  onSubmit?: (event: any) => void
}
const breakpoints = [0, 600, 900, 1200, 1536]
const breakpointNames = ["xs", "sm", "md", "lg", "xl"]
const listeners = new Set<() => void>()
const notifyResize = () => listeners.forEach(listener => listener())
function subscribe(listener: () => void) {
  if (!listeners.size) window.addEventListener("resize", notifyResize)
  listeners.add(listener)
  return () => { listeners.delete(listener); if (!listeners.size) window.removeEventListener("resize", notifyResize) }
}
const snapshot = () => breakpoints.filter(value => window.innerWidth >= value).length - 1
const colors: Record<string, string> = {
  "primary.main": "var(--primary)", "primary.light": "var(--accent)", "primary.dark": "var(--sidebar)",
  "text.primary": "var(--foreground)", "text.secondary": "var(--muted-foreground)", "text.disabled": "var(--muted-foreground)",
  "background.paper": "var(--card)", "background.default": "var(--background)", "divider": "var(--border)",
  "error.main": "var(--destructive)", "error": "var(--destructive)", "success.main": "var(--success)", "warning.main": "var(--warning)",
  "#1565c0": "var(--primary)", "#eff6ff": "var(--accent)", "#eaf2fc": "var(--accent)",
  "#f3f7fe": "var(--accent)", "#f8fafc": "var(--background)", "#edf0f4": "var(--secondary)", "#cbd5e1": "var(--input)",
}
const spacing: Record<string, string> = { p: "padding", px: "paddingInline", py: "paddingBlock", pt: "paddingTop", pb: "paddingBottom", pl: "paddingLeft", pr: "paddingRight", m: "margin", mx: "marginInline", my: "marginBlock", mt: "marginTop", mb: "marginBottom", ml: "marginLeft", mr: "marginRight" }

function useStyle(sx?: AnyProps): CSSProperties {
  const breakpoint = useSyncExternalStore(subscribe, snapshot, () => 0)
  const output: AnyProps = {}
  for (const [key, raw] of Object.entries(sx ?? {})) {
    let value = raw
    if (raw && typeof raw === "object") {
      value = undefined
      for (let i = 0; i <= breakpoint; i++) if (breakpointNames[i] in raw) value = raw[breakpointNames[i]]
    }
    if (value === undefined || key.startsWith("&")) continue
    if (key in spacing) output[spacing[key]] = typeof value === "number" ? value * 8 : value
    else if (["gap", "columnGap", "rowGap", "paddingInlineStart", "paddingInlineEnd"].includes(key)) output[key] = typeof value === "number" ? value * 8 : value
    else if (key === "borderRadius") output[key] = typeof value === "number" ? value * 10 : value
    else if (key.startsWith("border") && typeof value === "number") output[key] = value ? `${value}px solid var(--border)` : 0
    else if (key === "bgcolor") output.backgroundColor = colors[String(value)] ?? value
    else if (["width", "height"].includes(key) && typeof value === "number" && value > 0 && value <= 1) output[key] = `${value * 100}%`
    else output[key] = colors[String(value)] ?? (typeof value === "string" ? value.replace(" !important", "") : value)
  }
  return output as CSSProperties
}

// Only DOM attributes reach native elements; old presentation props are handled here.
function nativeProps(props: AnyProps) {
  const clean = { ...props }
  for (const key of ["elevation", "variant", "color", "fullWidth", "disableGutters", "hover", "useFlexGap", "expandIcon", "slotProps", "scrollButtons", "disableElevation", "disableRipple"]) delete clean[key]
  return clean
}

export function Box({ component: Tag = "div", sx, style, ...props }: AnyProps) {
  return <Tag {...nativeProps(props)} style={{ ...useStyle(sx), ...style }} />
}
export function Stack({ component: Tag = "div", direction = "column", spacing: gap = 0, divider, sx, children, style, ...props }: AnyProps) {
  const items = Children.toArray(children)
  return <Tag {...nativeProps(props)} style={{ display: "flex", ...useStyle({ flexDirection: direction, gap, ...sx }), ...style }}>{divider ? items.map((child, index) => <div key={isValidElement(child) ? child.key ?? index : index} className="contents">{index > 0 && divider}{child}</div>) : children}</Tag>
}
export function Typography({ component, variant = "body1", color, sx, noWrap, ...props }: AnyProps) {
  const Tag = component ?? ({ h4: "h1", h5: "h2", h6: "h3" }[variant as string] ?? "p")
  const title = ["h4", "h5", "h6"].includes(variant)
  const sizes: Record<string, number> = { h4: 27, h5: 21, h6: 16, body1: 14, body2: 13, caption: 11 }
  return <Tag {...nativeProps(props)} style={{ margin: 0, fontSize: sizes[variant], fontWeight: title ? 750 : undefined, lineHeight: title ? 1.7 : 1.9, color: colors[color], ...(noWrap ? { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as CSSProperties : {}), ...useStyle(sx) }} />
}
export function Paper({ component: Tag = "section", sx, className, ...props }: AnyProps) {
  return <Tag {...nativeProps(props)} className={cn("legacy-paper", className)} style={useStyle(sx)} />
}
export function Button({ component: Tag, variant, color, startIcon, endIcon, sx, className, size, children, fullWidth, ...props }: AnyProps) {
  const variantName: VariantProps<typeof buttonVariants>["variant"] = color === "error" ? "destructive" : variant === "contained" ? "default" : variant === "outlined" ? "outline" : "ghost"
  const icon = (node: any, position: string) => isValidElement<AnyProps>(node) ? cloneElement(node, { "data-icon": position, size: undefined }) : node
  const element = Tag ? <Tag /> : undefined
  return <ShadButton {...props} render={element} nativeButton={!Tag} variant={variantName} size={size === "small" ? "sm" : size === "large" ? "lg" : undefined} className={cn(fullWidth && "w-full", className)} style={useStyle(sx)}>{icon(startIcon, "inline-start")}{children}{icon(endIcon, "inline-end")}</ShadButton>
}
export function IconButton({ sx, color: _color, size: _size, ...props }: AnyProps) {
  return <ShadButton variant="ghost" size="icon" style={useStyle(sx)} {...props} />
}
export function Chip({ label, icon, sx, color, onClick, onDelete, className, size: _size, variant: _variant, ...props }: AnyProps) {
  return <ShadBadge variant="outline" data-tone={color} className={cn("status-badge", className)} style={useStyle(sx)} {...props}>{icon}{onClick ? <button type="button" onClick={onClick}>{label}</button> : label}{onDelete && <button type="button" onClick={onDelete} aria-label={`حذف ${label}`}><X size={12} /></button>}</ShadBadge>
}
export function CircularProgress({ size, color: _color, ...props }: AnyProps) {
  return <Spinner style={size ? { width: size, height: size } : undefined} {...props} />
}
export function Alert({ severity = "info", sx, children, onClose, action, ...props }: AnyProps) {
  const Icon = severity === "success" ? CheckCircle2 : severity === "warning" || severity === "error" ? TriangleAlert : Info
  return <ShadAlert variant={severity === "error" ? "destructive" : "default"} style={useStyle(sx)} {...props}><Icon /><AlertDescription>{children}{action}{onClose && <ShadButton variant="ghost" size="icon-sm" onClick={onClose} aria-label="بستن پیام"><X /></ShadButton>}</AlertDescription></ShadAlert>
}
export function Divider({ sx, ...props }: AnyProps) { return <Separator style={useStyle(sx)} {...props} /> }
export function TextField({ select, multiline, label, helperText, sx, fullWidth: _fullWidth, slotProps, InputProps: _InputProps, inputProps, size: _size, minRows, maxRows: _maxRows, error, id, children, ...props }: AnyProps) {
  const generated = useId()
  const fieldId = id ?? generated
  const style = useStyle(sx)
  const fieldProps = { ...props, ...inputProps, ...slotProps?.htmlInput, id: fieldId, "aria-invalid": error || undefined, "aria-describedby": helperText ? `${fieldId}-help` : undefined }
  return <Field data-invalid={error || undefined} data-disabled={props.disabled || undefined} style={style}>
    {label && <FieldLabel htmlFor={fieldId}>{label}</FieldLabel>}
    {select ? <select className="legacy-select" {...fieldProps}>{children}</select> : multiline ? <Textarea rows={minRows ?? 3} {...fieldProps} /> : <Input {...fieldProps} />}
    {helperText && <FieldDescription id={`${fieldId}-help`}>{helperText}</FieldDescription>}
  </Field>
}
export function MenuItem({ children, ...props }: AnyProps) {
  return <option {...props}>{Children.map(children, child => isValidElement<AnyProps>(child) ? child.props.children : child)}</option>
}
export function DialogTitle({ sx, children, ...props }: AnyProps) {
  return <DialogHeader style={useStyle(sx)}><ShadDialogTitle {...props}>{children}</ShadDialogTitle></DialogHeader>
}
export function DialogContent({ sx, children, ...props }: AnyProps) { return <div style={useStyle(sx)} {...props}>{children}</div> }
export function DialogActions({ children, sx, ...props }: AnyProps) { return <DialogFooter style={useStyle(sx)} {...props}>{children}</DialogFooter> }
export function DialogContentText({ children, ...props }: AnyProps) { return <DialogDescription {...props}>{children}</DialogDescription> }
export function Dialog({ open, onClose, children, maxWidth = "sm", fullWidth: _fullWidth, ...props }: AnyProps) {
  const widths: Record<string, string> = { xs: "440px", sm: "600px", md: "900px", lg: "1200px", xl: "1440px" }
  return <ShadDialog open={open} onOpenChange={(value, event) => { if (!value) { if (onClose) onClose(); else event.cancel() } }}>
    <ShadDialogContent className="max-h-[88svh] overflow-y-auto" style={{ maxWidth: `min(calc(100vw - 32px), ${widths[maxWidth] ?? widths.sm})` }} showCloseButton={Boolean(onClose)} aria-describedby={undefined} {...props}>{children}</ShadDialogContent>
  </ShadDialog>
}
export function Tooltip({ title, children }: AnyProps) { return <ShadTooltip><TooltipTrigger render={<span className="inline-flex" />}>{children}</TooltipTrigger><TooltipContent>{title}</TooltipContent></ShadTooltip> }
export function Snackbar({ open, children, message, autoHideDuration = 6000, onClose }: AnyProps) {
  useEffect(() => { if (!open) return; const timeout = window.setTimeout(() => onClose?.(), autoHideDuration); return () => window.clearTimeout(timeout) }, [open, autoHideDuration, onClose])
  return open ? <div className="fixed bottom-4 start-4 z-50 max-w-[calc(100vw-32px)]"><Alert onClose={onClose}>{children ?? message}</Alert></div> : null
}
const TableHeading = createContext(false)
export function Table({ sx, ...props }: AnyProps) { return <table className="legacy-table w-full text-start text-sm" style={useStyle(sx)} {...props} /> }
export const TableBody = (props: AnyProps) => <tbody {...props} />
export const TableHead = ({ children, ...props }: AnyProps) => <TableHeading value={true}><thead {...props}>{children}</thead></TableHeading>
export const TableRow = ({ hover: _hover, ...props }: AnyProps) => <tr {...props} />
export function TableCell({ sx, ...props }: AnyProps) { const Tag = useContext(TableHeading) ? "th" : "td"; return <Tag style={useStyle(sx)} {...props} /> }
export const TableContainer = (props: AnyProps) => <div className="w-full overflow-x-auto" {...props} />
export function Tabs({ value, onChange, children, variant: _variant, scrollButtons: _scrollButtons, sx, ...props }: AnyProps) {
  const tabs = Children.toArray(children).filter(isValidElement<AnyProps>)
  return <ShadTabs value={value} onValueChange={next => onChange?.(null, next)} style={useStyle(sx)} {...props}><div className="overflow-x-auto"><TabsList variant="line" className="h-12 px-3">{tabs.map((child, index) => <TabsTrigger key={index} value={child.props.value ?? index} className="px-4">{child.props.label}</TabsTrigger>)}</TabsList></div></ShadTabs>
}
export function Tab(_props: AnyProps) { return null }
export function Checkbox({ checked, onChange, size: _size, ...props }: AnyProps) { return <ShadCheckbox checked={checked} onCheckedChange={value => onChange?.({ target: { checked: value } })} {...props} /> }
export function FormControlLabel({ control, label }: AnyProps) { return <label className="mt-3 flex items-center gap-2 text-sm">{control}{label}</label> }
export function Accordion({ children, sx, ...props }: AnyProps) {
  const nodes = Children.toArray(children)
  return <ShadAccordion style={useStyle(sx)} {...nativeProps(props)}><AccordionItem value="section" className="rounded-xl border px-5"><AccordionTrigger>{isValidElement<AnyProps>(nodes[0]) ? nodes[0].props.children : "جزئیات"}</AccordionTrigger><AccordionContent>{nodes.slice(1)}</AccordionContent></AccordionItem></ShadAccordion>
}
export const AccordionSummary = ({ children }: AnyProps) => <>{children}</>
export const AccordionDetails = ({ children }: AnyProps) => <div>{children}</div>
type AutocompleteProps<T extends { id: string }> = {
  options: T[]; value: T[]; onChange: (event: unknown, next: T[]) => void
  getOptionLabel: (option: T) => string; getOptionDisabled: (option: T) => boolean
  renderInput: (props: AnyProps) => ReactNode
  disabled?: boolean; loading?: boolean; noOptionsText?: string; loadingText?: string; multiple?: boolean
  isOptionEqualToValue?: (a: T, b: T) => boolean
}
export function Autocomplete<T extends { id: string }>({ options, value, onChange, getOptionLabel, getOptionDisabled, renderInput, disabled, loading, noOptionsText }: AutocompleteProps<T>) {
  const [filter, setFilter] = useState("")
  const input = renderInput({ value: filter, onChange: (event: any) => setFilter(event.target.value), disabled })
  const shown = options.filter((option: any) => getOptionLabel(option).toLocaleLowerCase().includes(filter.toLocaleLowerCase()))
  return <div className="flex flex-col gap-2">{input}<div className="flex max-h-44 flex-col gap-2 overflow-auto rounded-lg border p-3" role="group" aria-label="انتخاب همکاران">
    {shown.map((option: any) => <label key={option.id} className="flex items-center gap-2 text-xs"><ShadCheckbox disabled={disabled || getOptionDisabled(option)} checked={value.some((item: any) => item.id === option.id)} onCheckedChange={checked => onChange(null, checked ? [...value, option] : value.filter((item: any) => item.id !== option.id))} /><span dir="auto">{getOptionLabel(option)}</span></label>)}
    {!shown.length && <p className="text-xs text-muted-foreground">{loading ? "در حال بارگذاری…" : noOptionsText}</p>}
  </div></div>
}
