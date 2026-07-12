'use client'

import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { getSocket } from '@/lib/socket'
import { drawStroke, redrawAll, type Stroke, type Tool, type Point } from '@/lib/drawing'

const PRESET_COLORS = ['#000000', '#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899']

// CONTROLLER: the iPad interface. Draws locally and streams every stroke to the
// display over Socket.IO. Owns the authoritative canvas state (undo/redo/clear).
export default function ControlPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const strokesRef = useRef<Stroke[]>([])
  const redoRef = useRef<Stroke[]>([])
  const currentRef = useRef<Stroke | null>(null)
  const drawingRef = useRef(false)

  // Live tool settings, mirrored into refs so the once-attached pointer
  // handlers always read the latest values.
  const [tool, setTool] = useState<Tool>('pencil')
  const [color, setColor] = useState('#000000')
  const [size, setSize] = useState(6)
  const toolRef = useRef(tool)
  const colorRef = useRef(color)
  const sizeRef = useRef(size)
  useEffect(() => void (toolRef.current = tool), [tool])
  useEffect(() => void (colorRef.current = color), [color])
  useEffect(() => void (sizeRef.current = size), [size])

  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [saving, setSaving] = useState(false)
  const [qr, setQr] = useState<{ image: string; url: string } | null>(null)

  // ---- helpers shared by buttons + pointer handlers -----------------------
  const redrawLocal = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (canvas && ctx) redrawAll(ctx, strokesRef.current, canvas.width, canvas.height)
  }
  const refreshHistory = () => {
    setCanUndo(strokesRef.current.length > 0)
    setCanRedo(redoRef.current.length > 0)
  }
  const syncDisplay = () => getSocket().emit('canvas:set', strokesRef.current)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const socket = getSocket()

    const size = () => {
      const dpr = window.devicePixelRatio || 1
      const rect = canvas.getBoundingClientRect()
      canvas.width = Math.floor(rect.width * dpr)
      canvas.height = Math.floor(rect.height * dpr)
      redrawAll(ctx, strokesRef.current, canvas.width, canvas.height)
    }
    size()
    window.addEventListener('resize', size)

    const posOf = (e: PointerEvent): Point => {
      const rect = canvas.getBoundingClientRect()
      return {
        x: (e.clientX - rect.left) / rect.width,
        y: (e.clientY - rect.top) / rect.height,
      }
    }

    const onDown = (e: PointerEvent) => {
      e.preventDefault()
      // Route all further events for this finger/pen/mouse to the canvas.
      try {
        canvas.setPointerCapture(e.pointerId)
      } catch {
        /* some browsers throw if the pointer is already gone — ignore */
      }
      drawingRef.current = true
      const p = posOf(e)
      // crypto.randomUUID is unavailable on iOS Safari over plain HTTP
      // (non-secure context), so fall back to a timestamp+random id.
      const id =
        globalThis.crypto?.randomUUID?.() ??
        `${Date.now()}-${Math.random().toString(36).slice(2)}`
      const stroke: Stroke = {
        id,
        tool: toolRef.current,
        color: colorRef.current,
        size: sizeRef.current,
        points: [p],
      }
      currentRef.current = stroke
      strokesRef.current.push(stroke)
      redoRef.current = [] // a new stroke invalidates redo
      drawStroke(ctx, stroke, canvas.width, canvas.height)
      socket.emit('draw:start', {
        id: stroke.id,
        tool: stroke.tool,
        color: stroke.color,
        size: stroke.size,
        x: p.x,
        y: p.y,
      })
      refreshHistory()
    }

    const onMove = (e: PointerEvent) => {
      if (!drawingRef.current) return
      const stroke = currentRef.current
      if (!stroke) return
      e.preventDefault()
      const p = posOf(e)
      const last = stroke.points[stroke.points.length - 1]
      if (Math.hypot(p.x - last.x, p.y - last.y) < 0.002) return
      stroke.points.push(p)
      drawStroke(ctx, { ...stroke, points: [last, p] }, canvas.width, canvas.height)
      socket.emit('draw:move', { id: stroke.id, x: p.x, y: p.y })
    }

    const onUp = (e: PointerEvent) => {
      if (!drawingRef.current) return
      e.preventDefault()
      drawingRef.current = false
      // Release capture so the pointer is free for the next stroke.
      try {
        canvas.releasePointerCapture(e.pointerId)
      } catch {
        /* pointer may already be released — ignore */
      }
      const stroke = currentRef.current
      currentRef.current = null
      if (stroke) socket.emit('draw:end', { id: stroke.id })
    }

    // passive: false is essential — it lets preventDefault() actually stop
    // iOS Safari from treating the touch as a scroll/gesture.
    const opts: AddEventListenerOptions = { passive: false }
    canvas.addEventListener('pointerdown', onDown, opts)
    canvas.addEventListener('pointermove', onMove, opts)
    canvas.addEventListener('pointerup', onUp, opts)
    canvas.addEventListener('pointercancel', onUp, opts)
    canvas.addEventListener('pointerleave', onUp, opts)
    return () => {
      window.removeEventListener('resize', size)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
      canvas.removeEventListener('pointerleave', onUp)
    }
  }, [])

  // ---- button actions ------------------------------------------------------
  const handleUndo = () => {
    const last = strokesRef.current.pop()
    if (!last) return
    redoRef.current.push(last)
    redrawLocal()
    syncDisplay()
    refreshHistory()
  }
  const handleRedo = () => {
    const stroke = redoRef.current.pop()
    if (!stroke) return
    strokesRef.current.push(stroke)
    redrawLocal()
    syncDisplay()
    refreshHistory()
  }
  const handleClear = () => {
    if (strokesRef.current.length === 0 && redoRef.current.length === 0) return
    strokesRef.current = []
    redoRef.current = []
    redrawLocal()
    syncDisplay()
    refreshHistory()
  }
  const handleSave = async () => {
    const canvas = canvasRef.current
    if (!canvas || saving) return
    setSaving(true)
    try {
      const dataUrl = canvas.toDataURL('image/png')
      const res = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl }),
      })
      if (!res.ok) throw new Error('save failed')
      const { url } = await res.json()
      const image = await QRCode.toDataURL(url, { width: 320, margin: 2 })
      setQr({ image, url })
    } catch {
      alert('Could not save the drawing. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex h-dvh flex-col bg-neutral-100">
      <header className="flex items-center justify-between px-6 py-3">
        <span className="text-lg font-semibold tracking-tight text-neutral-900">
          GenVue<span className="text-neutral-400"> Motion Interactive</span>
        </span>
      </header>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 px-4 pb-3">
        <div className="flex gap-1 rounded-xl bg-white p-1 shadow-sm">
          <ToolButton active={tool === 'pencil'} onClick={() => setTool('pencil')} label="Pencil" />
          <ToolButton active={tool === 'eraser'} onClick={() => setTool('eraser')} label="Eraser" />
        </div>

        <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-sm">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => {
                setColor(c)
                setTool('pencil')
              }}
              aria-label={`Color ${c}`}
              className={`h-7 w-7 rounded-full border transition ${
                color === c && tool === 'pencil'
                  ? 'border-neutral-900 ring-2 ring-neutral-900 ring-offset-1'
                  : 'border-neutral-200'
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
          <label className="relative h-7 w-7 cursor-pointer overflow-hidden rounded-full border border-neutral-200">
            <span
              className="block h-full w-full"
              style={{
                background:
                  'conic-gradient(red, orange, yellow, lime, cyan, blue, magenta, red)',
              }}
            />
            <input
              type="color"
              value={color}
              onChange={(e) => {
                setColor(e.target.value)
                setTool('pencil')
              }}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </label>
        </div>

        <div className="flex items-center gap-3 rounded-xl bg-white px-4 py-2 shadow-sm">
          <span className="text-xs font-medium text-neutral-500">Size</span>
          <input
            type="range"
            min={2}
            max={48}
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
            className="w-32 accent-neutral-900"
          />
          <span
            className="rounded-full bg-neutral-900"
            style={{ width: size, height: size, maxWidth: 28, maxHeight: 28 }}
          />
        </div>

        <div className="flex gap-1 rounded-xl bg-white p-1 shadow-sm">
          <ActionButton onClick={handleUndo} disabled={!canUndo} label="Undo" />
          <ActionButton onClick={handleRedo} disabled={!canRedo} label="Redo" />
          <ActionButton onClick={handleClear} label="Clear" />
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="ml-auto rounded-xl bg-neutral-900 px-6 py-2.5 font-medium text-white shadow-sm transition-colors hover:bg-neutral-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save Drawing'}
        </button>
      </div>

      <main className="flex-1 px-4 pb-4">
        <canvas
          ref={canvasRef}
          className="block h-full w-full rounded-2xl bg-white shadow-sm"
          style={{
            touchAction: 'none',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            WebkitTouchCallout: 'none',
          }}
        />
      </main>

      {qr && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-6">
          <div className="w-full max-w-sm rounded-3xl bg-white p-8 text-center shadow-xl">
            <h2 className="text-xl font-semibold text-neutral-900">Drawing saved</h2>
            <p className="mt-1 text-sm text-neutral-500">Scan to download the PNG.</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr.image} alt="QR code" className="mx-auto mt-5 h-56 w-56" />
            <a
              href={qr.url}
              className="mt-5 inline-block break-all text-xs text-blue-600 underline"
            >
              {qr.url}
            </a>
            <button
              onClick={() => setQr(null)}
              className="mt-6 w-full rounded-xl bg-neutral-900 py-3 font-medium text-white transition-colors hover:bg-neutral-700"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ToolButton({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
        active ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-100'
      }`}
    >
      {label}
    </button>
  )
}

function ActionButton({
  onClick,
  disabled,
  label,
}: {
  onClick: () => void
  disabled?: boolean
  label: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100 disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {label}
    </button>
  )
}
