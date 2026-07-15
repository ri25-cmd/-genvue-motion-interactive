'use client'

// Branded export composer.
//
// Composes the user's saved drawing/photo into the GenVue branded frame:
//   • a new high-resolution canvas (default 2160 on the long edge)
//   • the template drawn as the background (kept 1:1, never distorted)
//   • the artwork drawn into the large white square (object-fit: contain —
//     proportional, centred, never stretched)
//   • today's date stamped beside the "Date:" label in the template's typography
//   • exported as a PNG Blob
//
// It ONLY reads pixels from the passed-in canvas + template image. It never
// touches the drawing engine, canvas rendering, websocket sync, undo/redo, or
// the controller/display UI — it purely replaces the export composition.

export type Rect = { x: number; y: number; w: number; h: number }

export type DateLayout = {
  // Anchor + size as fractions of the composed image, so placement is
  // resolution-independent regardless of the template's pixel dimensions.
  xFrac: number
  yFrac: number
  align: CanvasTextAlign
  baseline: CanvasTextBaseline
  color: string
  sizeFrac: number // font size as a fraction of the composed height
  family: string
}

export type ComposeOptions = {
  target?: number // longest edge of the composed canvas (default 2160)
  placeholder?: Rect // override the auto-detected white square (template pixels)
  inset?: number // px kept clear inside the placeholder so art doesn't touch edges
  date?: Partial<DateLayout>
}

// Existing typography: Inter, small, dark GenVue navy. Position defaults to the
// lower-centre; override via options.date so it sits exactly beside "Date:".
const DEFAULT_DATE_LAYOUT: DateLayout = {
  xFrac: 0.5,
  yFrac: 0.92,
  align: 'center',
  baseline: 'alphabetic',
  color: '#2F3E63',
  sizeFrac: 0.02,
  family: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
}

// Format a date as "16 July 2026".
export function formatExportDate(d: Date): string {
  const day = String(d.getDate()).padStart(2, '0')
  const month = d.toLocaleString('en-GB', { month: 'long' })
  return `${day} ${month} ${d.getFullYear()}`
}

// Read a Blob as a data URL (for the existing base64 upload path).
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read blob'))
    reader.onload = () => resolve(reader.result as string)
    reader.readAsDataURL(blob)
  })
}

// Find the largest solid near-white rectangle in the template — the artwork
// placeholder. Runs on a downscaled copy for speed, then scales the rect back to
// full template resolution. Bypass with options.placeholder if needed.
export function detectPlaceholder(template: HTMLImageElement): Rect {
  const tw = template.naturalWidth
  const th = template.naturalHeight
  const scale = Math.min(1, 900 / Math.max(tw, th))
  const dw = Math.max(1, Math.round(tw * scale))
  const dh = Math.max(1, Math.round(th * scale))

  const c = document.createElement('canvas')
  c.width = dw
  c.height = dh
  const cx = c.getContext('2d', { willReadFrequently: true })
  if (!cx) return { x: 0, y: 0, w: tw, h: th }
  cx.drawImage(template, 0, 0, dw, dh)
  const { data } = cx.getImageData(0, 0, dw, dh)

  const white = new Uint8Array(dw * dh)
  for (let i = 0; i < dw * dh; i++) {
    const r = data[i * 4]
    const g = data[i * 4 + 1]
    const b = data[i * 4 + 2]
    const a = data[i * 4 + 3]
    white[i] = r > 244 && g > 244 && b > 244 && a > 250 ? 1 : 0
  }

  // Largest rectangle of 1s (histogram method, per row).
  const heights = new Int32Array(dw)
  let best: Rect & { area: number } = { area: 0, x: 0, y: 0, w: 0, h: 0 }
  const stack: number[] = []
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) heights[x] = white[y * dw + x] ? heights[x] + 1 : 0
    stack.length = 0
    for (let x = 0; x <= dw; x++) {
      const curH = x === dw ? 0 : heights[x]
      while (stack.length && heights[stack[stack.length - 1]] > curH) {
        const h = heights[stack.pop()!]
        const left = stack.length ? stack[stack.length - 1] + 1 : 0
        const w = x - left
        const area = h * w
        if (area > best.area) best = { area, x: left, y: y - h + 1, w, h }
      }
      stack.push(x)
    }
  }

  if (best.area === 0) return { x: 0, y: 0, w: tw, h: th }
  const inv = 1 / scale
  return {
    x: Math.round(best.x * inv),
    y: Math.round(best.y * inv),
    w: Math.round(best.w * inv),
    h: Math.round(best.h * inv),
  }
}

// Compose the branded export and return it as a PNG Blob.
export async function composeExportImage(
  canvas: HTMLCanvasElement,
  template: HTMLImageElement,
  date: string,
  options: ComposeOptions = {},
): Promise<Blob> {
  const tw = template.naturalWidth
  const th = template.naturalHeight

  // High-resolution output sized to the template's aspect (square template →
  // square output, e.g. 2160×2160). The template is never distorted.
  const target = options.target ?? 2160
  const ar = tw / th
  const W = ar >= 1 ? target : Math.round(target * ar)
  const H = ar >= 1 ? Math.round(target / ar) : target

  const out = document.createElement('canvas')
  out.width = W
  out.height = H
  const ctx = out.getContext('2d')
  if (!ctx) throw new Error('No 2D context for export composition')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  // 1) Template as the background (read-only source; drawn 1:1 to fill).
  ctx.drawImage(template, 0, 0, W, H)

  // 2) Artwork into the white square — contain (preserve ratio), centred.
  const s = W / tw // uniform scale from template pixels → composed pixels
  const rect = options.placeholder ?? detectPlaceholder(template)
  const insetTpl = options.inset ?? Math.round(Math.min(rect.w, rect.h) * 0.02)
  const bx = (rect.x + insetTpl) * s
  const by = (rect.y + insetTpl) * s
  const bw = Math.max(1, (rect.w - insetTpl * 2) * s)
  const bh = Math.max(1, (rect.h - insetTpl * 2) * s)
  const cw = canvas.width
  const ch = canvas.height
  if (cw > 0 && ch > 0) {
    const fit = Math.min(bw / cw, bh / ch)
    const dw = cw * fit
    const dh = ch * fit
    ctx.drawImage(canvas, bx + (bw - dw) / 2, by + (bh - dh) / 2, dw, dh)
  }

  // 3) Date, beside the "Date:" label, in the existing typography (dark navy).
  const d: DateLayout = { ...DEFAULT_DATE_LAYOUT, ...options.date }
  ctx.font = `500 ${Math.round(H * d.sizeFrac)}px ${d.family}`
  ctx.fillStyle = d.color
  ctx.textAlign = d.align
  ctx.textBaseline = d.baseline
  ctx.fillText(date, W * d.xFrac, H * d.yFrac)

  return await new Promise<Blob>((resolve, reject) => {
    out.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob returned null'))), 'image/png')
  })
}
