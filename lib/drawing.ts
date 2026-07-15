// Shared drawing model + rendering used by both the controller and the display.
// Coordinates are normalised to 0..1 so any screen size renders identically.

import { paintBackground, type Background } from './background'

// Brush types. 'pencil' + 'eraser' are the originals; 'glow'/'neon'/'marker'
// are premium brushes rendered with shadow bloom / vivid glow / wide translucent
// ink. The tool already travels in the draw sync payload, so every brush renders
// identically on the display and is captured in the exported PNG.
export type Tool = 'pencil' | 'eraser' | 'glow' | 'neon' | 'marker'

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

  const lw = Math.max(1, (stroke.size / REFERENCE_WIDTH) * w)

  // save/restore isolates per-brush state (alpha, shadow) so nothing leaks into
  // the next stroke — pencil/eraser render exactly as before.
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.globalAlpha = 1
  ctx.shadowBlur = 0
  ctx.shadowColor = 'transparent'

  switch (stroke.tool) {
    case 'eraser':
      ctx.strokeStyle = WHITE
      ctx.lineWidth = lw
      break
    case 'marker':
      // Semi-transparent, wide ink.
      ctx.strokeStyle = stroke.color
      ctx.globalAlpha = 0.35
      ctx.lineWidth = lw * 2.2
      break
    case 'glow':
      // Soft bloom around the stroke.
      ctx.strokeStyle = stroke.color
      ctx.lineWidth = lw
      ctx.shadowColor = stroke.color
      ctx.shadowBlur = lw * 2.5
      break
    case 'neon':
      // Bright, vivid outer glow (a white core is added in a second pass below).
      ctx.strokeStyle = stroke.color
      ctx.lineWidth = lw
      ctx.shadowColor = stroke.color
      ctx.shadowBlur = lw * 5
      break
    default: // pencil
      ctx.strokeStyle = stroke.color
      ctx.lineWidth = lw
  }

  const trace = () => {
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
  trace()

  // Neon: bright white core over the coloured glow for the classic tube look.
  if (stroke.tool === 'neon') {
    ctx.shadowBlur = lw * 2
    ctx.lineWidth = Math.max(1, lw * 0.5)
    ctx.strokeStyle = '#ffffff'
    ctx.globalAlpha = 0.9
    trace()
  }

  ctx.restore()
}

// Clear a canvas to solid white (the drawing surface is always white).
export function clearCanvas(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = WHITE
  ctx.fillRect(0, 0, w, h)
}

// Full repaint: white base, then the optional background (photo / solid colour
// / gradient), then every stroke on top. `image` is the loaded photo pixels,
// only needed when `background.type === 'photo'`. Passing no background keeps
// the original strokes-only behaviour.
export function redrawAll(
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
  w: number,
  h: number,
  background: Background | null = null,
  image: HTMLImageElement | null = null,
) {
  clearCanvas(ctx, w, h)
  if (background) paintBackground(ctx, background, image, w, h)
  for (const stroke of strokes) drawStroke(ctx, stroke, w, h)
}
