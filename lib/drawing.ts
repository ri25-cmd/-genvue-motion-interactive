// Shared drawing model + rendering used by both the controller and the display.
// Coordinates are normalised to 0..1 so any screen size renders identically.

export type Tool = 'pencil' | 'eraser'

export type Point = { x: number; y: number }

export type Stroke = {
  id: string
  tool: Tool
  color: string
  size: number // brush width in pixels at a 1000px reference, scaled per-canvas
  points: Point[]
}

// The size travels as a reference value against this width so a thick brush on
// the iPad looks proportionally the same on the big display.
export const REFERENCE_WIDTH = 1000

export const WHITE = '#ffffff'

// Render a single stroke onto a canvas context sized `w` x `h` (device pixels).
export function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  w: number,
  h: number,
) {
  if (stroke.points.length === 0) return

  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.strokeStyle = stroke.tool === 'eraser' ? WHITE : stroke.color
  ctx.lineWidth = Math.max(1, (stroke.size / REFERENCE_WIDTH) * w)

  ctx.beginPath()
  const first = stroke.points[0]
  ctx.moveTo(first.x * w, first.y * h)

  if (stroke.points.length === 1) {
    // A single tap: draw a dot.
    ctx.lineTo(first.x * w + 0.01, first.y * h + 0.01)
  } else {
    for (let i = 1; i < stroke.points.length; i++) {
      const p = stroke.points[i]
      ctx.lineTo(p.x * w, p.y * h)
    }
  }
  ctx.stroke()
}

// Clear a canvas to solid white (the drawing surface is always white).
export function clearCanvas(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = WHITE
  ctx.fillRect(0, 0, w, h)
}

// Paint an image as the background layer, scaled to fit entirely within the
// canvas (contain) and centred, so the whole photo is visible without cropping.
export function drawBackground(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number,
) {
  if (!img.complete || img.naturalWidth === 0) return
  const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight)
  const dw = img.naturalWidth * scale
  const dh = img.naturalHeight * scale
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh)
}

// Full repaint: white base, then the optional background photo, then every
// stroke on top. Passing no background keeps the original strokes-only behaviour.
export function redrawAll(
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
  w: number,
  h: number,
  background: HTMLImageElement | null = null,
) {
  clearCanvas(ctx, w, h)
  if (background) drawBackground(ctx, background, w, h)
  for (const stroke of strokes) drawStroke(ctx, stroke, w, h)
}
