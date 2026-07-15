// Unified background model for the display canvas. A background is EXACTLY one
// of: a photo (data URL), a solid colour, or a gradient. "GenVue Themes" are
// just curated gradient/solid presets. Keeping it to a single descriptor is
// what enforces the "only one background at a time" rule — setting any one kind
// replaces whatever was there before.
//
// The descriptor is plain JSON so it syncs verbatim over the existing
// Socket.IO `bg:set`/`bg:sync` channel. The photo's pixels (the data URL) are
// loaded into an HTMLImageElement separately on each client for rendering.

export type PhotoFit = 'contain' | 'cover' | 'center'

// `opacity` (0..1, default 1) fades ONLY the background layer against the white
// canvas base. Strokes are always painted at full opacity on top of it.
export type PhotoBackground = { type: 'photo'; src: string; fit: PhotoFit; opacity?: number }
export type SolidBackground = { type: 'solid'; color: string; id?: string; opacity?: number }
export type GradientBackground = {
  type: 'gradient'
  stops: string[]
  angle: number
  radial?: boolean
  id?: string
  opacity?: number
}

export type Background = PhotoBackground | SolidBackground | GradientBackground

// ---- presets --------------------------------------------------------------

export type Swatch = { id: string; label: string; color: string }

// Restrained brand-aligned solids (white, charcoal, gray, GenVue blue, success
// green, danger red). Any other colour is available via the custom colour picker.
export const SOLID_COLORS: Swatch[] = [
  { id: 'solid:white', label: 'White', color: '#ffffff' },
  { id: 'solid:black', label: 'Black', color: '#111827' },
  { id: 'solid:grey', label: 'Grey', color: '#6b7280' },
  { id: 'solid:blue', label: 'Blue', color: '#2563eb' },
  { id: 'solid:green', label: 'Green', color: '#10b981' },
  { id: 'solid:red', label: 'Red', color: '#ef4444' },
]

export type GradientPreset = {
  id: string
  label: string
  stops: string[]
  angle: number
  radial?: boolean
}

export const GRADIENTS: GradientPreset[] = [
  { id: 'grad:ocean', label: 'Ocean', stops: ['#2193b0', '#6dd5ed'], angle: 135 },
  { id: 'grad:sunset', label: 'Sunset', stops: ['#ff512f', '#f09819'], angle: 135 },
  { id: 'grad:aurora', label: 'Aurora', stops: ['#1fa2ff', '#12d8fa', '#a6ffcb'], angle: 135 },
  { id: 'grad:galaxy', label: 'Galaxy', stops: ['#7597de', '#2b1055', '#0b0c2a'], angle: 0, radial: true },
  { id: 'grad:purple-glow', label: 'Purple Glow', stops: ['#e100ff', '#7f00ff', '#2a0845'], angle: 0, radial: true },
  { id: 'grad:fire', label: 'Fire', stops: ['#f12711', '#f5af19'], angle: 135 },
  { id: 'grad:sky', label: 'Sky', stops: ['#56ccf2', '#2f80ed'], angle: 160 },
  { id: 'grad:dark', label: 'Dark Mode', stops: ['#232526', '#414345'], angle: 135 },
]

export const THEMES: GradientPreset[] = [
  { id: 'theme:genvue-dark', label: 'GenVue Dark', stops: ['#0f0f1a', '#16213e', '#1a1a2e'], angle: 160 },
  { id: 'theme:genvue-blue', label: 'GenVue Blue', stops: ['#0052d4', '#4364f7', '#6fb1fc'], angle: 135 },
  { id: 'theme:crystal', label: 'Crystal', stops: ['#e0eafc', '#cfdef3'], angle: 135 },
  { id: 'theme:frosted', label: 'Frosted Glass', stops: ['#f7fbff', '#e6eef7'], angle: 135 },
  { id: 'theme:night-sky', label: 'Night Sky', stops: ['#2c5364', '#203a43', '#0f2027'], angle: 0, radial: true },
  { id: 'theme:minimal-white', label: 'Minimal White', stops: ['#ffffff', '#f3f4f6'], angle: 160 },
]

// Turn a preset into the Background descriptor that gets stored + synced.
export function gradientBackground(p: GradientPreset): GradientBackground {
  return { type: 'gradient', stops: p.stops, angle: p.angle, radial: p.radial, id: p.id }
}
export function solidBackground(s: Swatch): SolidBackground {
  return { type: 'solid', color: s.color, id: s.id }
}

// A CSS string for previewing a preset on a button (close enough to the canvas
// render for a thumbnail).
export function gradientCss(p: GradientPreset): string {
  if (p.radial) return `radial-gradient(circle at 50% 50%, ${p.stops.join(', ')})`
  return `linear-gradient(${p.angle}deg, ${p.stops.join(', ')})`
}

// ---- canvas rendering -----------------------------------------------------

function gradientFill(
  ctx: CanvasRenderingContext2D,
  bg: GradientBackground,
  w: number,
  h: number,
): CanvasGradient {
  let g: CanvasGradient
  if (bg.radial) {
    g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) / 1.1)
  } else {
    // Angle in CSS convention (0deg = to top, 90deg = to right).
    const rad = (bg.angle * Math.PI) / 180
    const x = Math.sin(rad)
    const y = -Math.cos(rad)
    const half = (Math.abs(w * x) + Math.abs(h * y)) / 2
    g = ctx.createLinearGradient(w / 2 - x * half, h / 2 - y * half, w / 2 + x * half, h / 2 + y * half)
  }
  const n = bg.stops.length
  bg.stops.forEach((c, i) => g.addColorStop(n === 1 ? 0 : i / (n - 1), c))
  return g
}

function paintPhoto(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  fit: PhotoFit,
  w: number,
  h: number,
) {
  const iw = img.naturalWidth
  const ih = img.naturalHeight
  if (!iw || !ih) return
  let dw: number
  let dh: number
  if (fit === 'cover') {
    const s = Math.max(w / iw, h / ih)
    dw = iw * s
    dh = ih * s
  } else if (fit === 'center') {
    dw = iw
    dh = ih
  } else {
    // contain
    const s = Math.min(w / iw, h / ih)
    dw = iw * s
    dh = ih * s
  }
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh)
}

// Paint the background layer onto a canvas of `w`x`h` device pixels. For a
// photo, the caller supplies the already-loaded image (null → nothing painted).
export function paintBackground(
  ctx: CanvasRenderingContext2D,
  bg: Background,
  image: HTMLImageElement | null,
  w: number,
  h: number,
) {
  // Apply the background opacity for this layer only, then restore — so the
  // strokes drawn afterwards in redrawAll stay fully opaque.
  const prevAlpha = ctx.globalAlpha
  ctx.globalAlpha = Math.max(0, Math.min(1, bg.opacity ?? 1))
  try {
    if (bg.type === 'solid') {
      ctx.fillStyle = bg.color
      ctx.fillRect(0, 0, w, h)
    } else if (bg.type === 'gradient') {
      ctx.fillStyle = gradientFill(ctx, bg, w, h)
      ctx.fillRect(0, 0, w, h)
    } else if (bg.type === 'photo' && image && image.complete && image.naturalWidth > 0) {
      paintPhoto(ctx, image, bg.fit, w, h)
    }
  } finally {
    ctx.globalAlpha = prevAlpha
  }
}
