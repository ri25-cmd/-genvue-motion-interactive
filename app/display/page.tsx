'use client'

import { useEffect, useRef } from 'react'
import { getSocket } from '@/lib/socket'
import { loadImage } from '@/lib/image'
import { drawStroke, redrawAll, type Stroke, type Point } from '@/lib/drawing'
import type { Background } from '@/lib/background'

// DISPLAY: fullscreen white canvas, no controls. Renders whatever the
// controller draws, in real time, and stays in sync if it (re)loads mid-session.
export default function DisplayPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // Local mirror of the canvas state, used for full redraws (sync + resize).
  const strokesRef = useRef<Stroke[]>([])
  // The mirrored background: the descriptor (photo / solid / gradient) plus, for
  // a photo, the loaded image. Painted beneath the strokes on every redraw.
  const bgRef = useRef<Background | null>(null)
  const bgImageRef = useRef<HTMLImageElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const size = () => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.floor(window.innerWidth * dpr)
      canvas.height = Math.floor(window.innerHeight * dpr)
      redrawAll(ctx, strokesRef.current, canvas.width, canvas.height, bgRef.current, bgImageRef.current)
    }
    size()
    window.addEventListener('resize', size)

    const socket = getSocket()

    const onSync = (strokes: Stroke[]) => {
      strokesRef.current = strokes
      redrawAll(ctx, strokes, canvas.width, canvas.height, bgRef.current, bgImageRef.current)
    }

    // Background: a new background (photo / solid / gradient, or null to clear)
    // arrived from the controller. For a photo, load the pixels first; then
    // repaint so the background sits beneath the strokes.
    const onBg = async (bg: Background | null) => {
      bgRef.current = bg
      if (bg?.type === 'photo') {
        try {
          bgImageRef.current = await loadImage(bg.src)
        } catch {
          bgImageRef.current = null
        }
      } else {
        bgImageRef.current = null
      }
      // Guard against a newer background arriving while the image was loading.
      if (bgRef.current !== bg) return
      redrawAll(ctx, strokesRef.current, canvas.width, canvas.height, bgRef.current, bgImageRef.current)
    }

    const onStart = (s: Stroke & Point) => {
      const stroke: Stroke = {
        id: s.id,
        tool: s.tool,
        color: s.color,
        size: s.size,
        points: [{ x: s.x, y: s.y }],
      }
      strokesRef.current.push(stroke)
      drawStroke(ctx, stroke, canvas.width, canvas.height)
    }

    const onMove = (p: { id: string } & Point) => {
      const stroke = strokesRef.current.find((s) => s.id === p.id)
      if (!stroke) return
      stroke.points.push({ x: p.x, y: p.y })
      // Draw just the newest segment for smoothness.
      const n = stroke.points.length
      if (n >= 2) {
        const from = stroke.points[n - 2]
        const seg: Stroke = { ...stroke, points: [from, { x: p.x, y: p.y }] }
        drawStroke(ctx, seg, canvas.width, canvas.height)
      }
    }

    socket.on('canvas:sync', onSync)
    socket.on('bg:sync', onBg)
    socket.on('draw:start', onStart)
    socket.on('draw:move', onMove)

    return () => {
      window.removeEventListener('resize', size)
      socket.off('canvas:sync', onSync)
      socket.off('bg:sync', onBg)
      socket.off('draw:start', onStart)
      socket.off('draw:move', onMove)
    }
  }, [])

  return (
    <div className="fixed inset-0 bg-white">
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  )
}
