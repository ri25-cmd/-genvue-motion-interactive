'use client'

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from 'react'
import Image from 'next/image'
import QRCode from 'qrcode'
import genvueLogo from '@/public/images/genvue-logo.png'
import { getSocket } from '@/lib/socket'
import { fileToDataUrl, loadImage } from '@/lib/image'
import { composeExportImage, formatExportDate, blobToDataUrl } from '@/lib/export/composeExportImage'
import { drawStroke, redrawAll, type Stroke, type Tool, type Point } from '@/lib/drawing'
import {
  SOLID_COLORS,
  GRADIENTS,
  THEMES,
  gradientBackground,
  solidBackground,
  gradientCss,
  type Background,
  type PhotoFit,
} from '@/lib/background'

// Restrained brand palette: charcoal, gray, GenVue blue, success green, danger
// red. Anything else is reachable via the advanced custom colour picker.
const PRESET_COLORS = ['#111827', '#6b7280', '#2563eb', '#10b981', '#ef4444']
const GRADIENT_ANGLE = 135

// Where the export stamps today's date. In the 1080x1080 frame the "Date:"
// label occupies x 111..160 with its baseline at y 940, white on the navy
// footer — so the value sits just after it, in matching white. Fractions keep
// the placement correct whatever resolution the template is supplied at.
const EXPORT_DATE_LAYOUT = {
  xFrac: 172 / 1080,
  yFrac: 940 / 1080,
  align: 'left' as const,
  baseline: 'alphabetic' as const,
  color: '#ffffff',
  sizeFrac: 19 / 1080,
}

const BRUSHES: { tool: Tool; label: string }[] = [
  { tool: 'pencil', label: 'Pencil' },
  { tool: 'glow', label: 'Glow' },
  { tool: 'neon', label: 'Neon' },
  { tool: 'marker', label: 'Marker' },
  { tool: 'eraser', label: 'Eraser' },
]

type Section = 'draw' | 'photo' | 'background'
const SECTIONS: Section[] = ['draw', 'photo', 'background']

type BgType = 'transparent' | 'solid' | 'gradient' | 'photo'

// CONTROLLER: the iPad interface. Draws locally and streams every stroke to the
// display over Socket.IO. Owns the authoritative canvas state (undo/redo/clear)
// and the single active background (photo / solid / gradient + glass opacity).
export default function ControlPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const strokesRef = useRef<Stroke[]>([])
  const redoRef = useRef<Stroke[]>([])
  const currentRef = useRef<Stroke | null>(null)
  const drawingRef = useRef(false)
  // The single active background: its descriptor (for redraws + UI) and, for a
  // photo, the loaded image. A hidden input opens the native picker.
  const backgroundRef = useRef<Background | null>(null)
  const bgImageRef = useRef<HTMLImageElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Live tool settings, mirrored into refs so the once-attached pointer
  // handlers always read the latest values.
  const [tool, setTool] = useState<Tool>('pencil')
  const [color, setColor] = useState('#111827')
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
  const [qr, setQr] = useState<{ image: string; url: string; downloadUrl: string } | null>(null)
  // UI mirror of the active background (drives swatch highlighting + button
  // enabled state). The authoritative copy for rendering lives in backgroundRef.
  const [background, setBackground] = useState<Background | null>(null)
  const [section, setSection] = useState<Section>('draw')
  const [panelOpen, setPanelOpen] = useState(true)
  // Which Background-type panel is shown. Kept in sync whenever the background
  // actually changes (see applyBackground) so the segmented control always
  // matches the current background.
  const [bgType, setBgType] = useState<BgType>('transparent')
  const [dragOver, setDragOver] = useState(false)
  // Glass Transparency (background opacity, 0..1). Kept in a ref too so
  // applyBackground can stamp it onto whatever background is set, and re-applied
  // live when the slider moves.
  const [opacity, setOpacity] = useState(1)
  const opacityRef = useRef(1)
  // Custom-gradient builder colours (Colour A / Colour B). Refs mirror them so
  // changing one immediately rebuilds the gradient with the latest of the other.
  const [gradA, setGradA] = useState('#2563eb')
  const [gradB, setGradB] = useState('#1e40af')
  const gradARef = useRef(gradA)
  const gradBRef = useRef(gradB)

  const photoSrc = background?.type === 'photo' ? background.src : null
  const photoFit: PhotoFit | null = background?.type === 'photo' ? background.fit : null
  const hasThemeBg = !!background && background.type !== 'photo'
  const solidColor = background?.type === 'solid' ? background.color : null
  // id of the active solid/gradient/theme preset (photos have no preset id),
  // used to highlight the selected swatch/chip.
  const selectedBgId = background && background.type !== 'photo' ? background.id : undefined

  // ---- helpers shared by buttons + pointer handlers -----------------------
  const redrawLocal = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (canvas && ctx)
      redrawAll(ctx, strokesRef.current, canvas.width, canvas.height, backgroundRef.current, bgImageRef.current)
  }
  const refreshHistory = () => {
    setCanUndo(strokesRef.current.length > 0)
    setCanRedo(redoRef.current.length > 0)
  }
  const syncDisplay = () => getSocket().emit('canvas:set', strokesRef.current)

  // Set the single active background (or null to clear): stamp the current
  // opacity, load a photo's pixels if needed, repaint locally, and mirror the
  // descriptor to every display. Because there is only one background, this
  // alone enforces "one at a time" — any choice replaces the previous one.
  const applyBackground = async (bg: Background | null) => {
    const next = bg ? { ...bg, opacity: opacityRef.current } : null
    backgroundRef.current = next
    setBackground(next)
    setBgType(next ? next.type : 'transparent')
    if (next?.type === 'photo') {
      if (!bgImageRef.current || bgImageRef.current.src !== next.src) {
        try {
          bgImageRef.current = await loadImage(next.src)
        } catch {
          bgImageRef.current = null
        }
      }
    } else {
      bgImageRef.current = null
    }
    if (backgroundRef.current !== next) return // a newer background won the race
    redrawLocal()
    getSocket().emit('bg:set', next)
  }

  // Live Glass Transparency change: update state + ref, and re-apply the current
  // background so the fade syncs to every display immediately.
  const handleOpacity = (value: number) => {
    const clamped = Math.max(0, Math.min(1, value))
    setOpacity(clamped)
    opacityRef.current = clamped
    if (backgroundRef.current) applyBackground(backgroundRef.current)
  }

  // ---- background pickers --------------------------------------------------
  // Background-type segmented control: Transparent applies immediately; the
  // others just reveal their panel (the user then picks a value there).
  const selectBgType = (t: BgType) => {
    if (t === 'transparent') applyBackground(null)
    else setBgType(t)
  }
  const applyCustomSolid = (c: string) => applyBackground({ type: 'solid', color: c })
  const chooseGradA = (c: string) => {
    setGradA(c)
    gradARef.current = c
    applyBackground({ type: 'gradient', stops: [c, gradBRef.current], angle: GRADIENT_ANGLE })
  }
  const chooseGradB = (c: string) => {
    setGradB(c)
    gradBRef.current = c
    applyBackground({ type: 'gradient', stops: [gradARef.current, c], angle: GRADIENT_ANGLE })
  }

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
      redrawAll(ctx, strokesRef.current, canvas.width, canvas.height, backgroundRef.current, bgImageRef.current)
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

  // ---- drawing actions (unchanged behaviour) ------------------------------
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

  // ---- photo actions -------------------------------------------------------
  // Shared by the file picker and drag & drop — both feed the same pipeline.
  const loadPhotoFile = async (file: File) => {
    if (!file.type.startsWith('image/')) return
    try {
      const src = await fileToDataUrl(file)
      await applyBackground({ type: 'photo', src, fit: 'contain' })
    } catch {
      alert('Could not load that image. Please try another.')
    }
  }
  const handlePhotoPick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // reset so picking the same file again still fires
    if (file) await loadPhotoFile(file)
  }
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) loadPhotoFile(file)
  }
  const setPhotoFit = (fit: PhotoFit) => {
    const bg = backgroundRef.current
    if (bg?.type !== 'photo' || bg.fit === fit) return
    applyBackground({ ...bg, fit })
  }

  // ---- clear / reset actions ----------------------------------------------
  const handleClearDrawing = () => {
    if (strokesRef.current.length === 0 && redoRef.current.length === 0) return
    strokesRef.current = []
    redoRef.current = []
    redrawLocal()
    syncDisplay()
    refreshHistory()
  }
  const handleRemovePhoto = () => {
    if (backgroundRef.current?.type !== 'photo') return
    applyBackground(null)
  }
  const handleResetBackground = () => {
    const bg = backgroundRef.current
    if (!bg || bg.type === 'photo') return
    applyBackground(null)
  }
  const handleClearAll = () => {
    strokesRef.current = []
    redoRef.current = []
    applyBackground(null) // clears background locally + emits bg:set null
    syncDisplay() // clears strokes on every display
    refreshHistory()
  }

  // ---- save / QR (unchanged) ----------------------------------------------
  const handleSave = async () => {
    const canvas = canvasRef.current
    if (!canvas || saving) return
    setSaving(true)
    try {
      // Compose the drawing into the branded frame and stamp today's date. This
      // composed PNG is the only artefact that leaves here: it is what uploads,
      // what the QR resolves to, and what the visitor downloads. There is
      // deliberately no raw-canvas fallback — if the template can't be loaded we
      // fail loudly rather than quietly handing over an unbranded drawing.
      const template = await loadImage('/templates/genvue-frame.png')
      const blob = await composeExportImage(canvas, template, formatExportDate(new Date()), {
        // Compose at the template's exact pixel dimensions, so the frame is
        // reproduced 1:1 and never resampled.
        target: Math.max(template.naturalWidth, template.naturalHeight),
        date: EXPORT_DATE_LAYOUT,
      })
      const uploadDataUrl = await blobToDataUrl(blob)

      const res = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl: uploadDataUrl }),
      })
      if (!res.ok) throw new Error('save failed')
      // The QR + link carry the plain secure_url (scanning opens the image);
      // the Download button carries the fl_attachment variant. Both address the
      // same uploaded PNG.
      const { url, downloadUrl } = await res.json()
      const image = await QRCode.toDataURL(url, { width: 320, margin: 2 })
      setQr({ image, url, downloadUrl })
    } catch {
      alert('Could not save the drawing. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="relative h-dvh overflow-hidden bg-slate-50 font-sans text-gray-900">
      {/* Canvas — the hero, fills the viewport */}
      <main className="absolute inset-0 p-3">
        <canvas
          ref={canvasRef}
          className="block h-full w-full rounded-2xl border border-gray-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.08)]"
          style={{
            touchAction: 'none',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            WebkitTouchCallout: 'none',
          }}
        />
      </main>

      {/* Floating actions (top-right) */}
      <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
        <button
          onClick={handleClearAll}
          className="rounded-xl bg-white px-3 py-1.5 text-sm font-medium text-gray-600 shadow-sm ring-1 ring-gray-200 backdrop-blur-xl transition-colors duration-200 hover:text-gray-900"
        >
          Clear All
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-xl bg-[#2F3E63] px-3.5 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors duration-200 hover:bg-[#26324f] disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save Drawing'}
        </button>
      </div>

      {/* Floating laminated-glass toolbar (top-left) */}
      <div
        className={`absolute left-4 top-4 z-10 flex max-h-[calc(100dvh-2rem)] flex-col rounded-[24px] border border-[rgba(255,255,255,0.45)] bg-[rgba(255,255,255,0.72)] p-3 shadow-[0_16px_40px_rgba(15,23,42,0.12)] backdrop-blur-[20px] transition-all duration-200 ease-out ${
          panelOpen ? 'w-[min(90vw,320px)]' : 'w-[210px]'
        }`}
      >
        {/* Logo + collapse / expand */}
        <div className="flex shrink-0 items-start justify-between gap-2">
          <Image src={genvueLogo} alt="GenVue" priority sizes="150px" className="mt-0.5 h-auto w-[150px]" />
          <button
            onClick={() => setPanelOpen((v) => !v)}
            aria-label={panelOpen ? 'Collapse panel' : 'Expand panel'}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-gray-500 ring-1 ring-gray-200 transition-colors duration-200 hover:bg-white hover:text-gray-800"
          >
            {panelOpen ? <ChevronLeft /> : <ChevronRight />}
          </button>
        </div>

        {/* Section tabs — icons always, labels when expanded */}
        <div className="mt-3 flex shrink-0 rounded-xl bg-gray-100/80 p-0.5 text-sm">
          {SECTIONS.map((s) => (
            <button
              key={s}
              onClick={() => {
                setSection(s)
                setPanelOpen(true)
              }}
              aria-label={s}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 font-medium capitalize transition-colors duration-200 ${
                section === s ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              <SectionIcon section={s} />
              {panelOpen && <span>{s}</span>}
            </button>
          ))}
        </div>

        {panelOpen && (
          <div className="no-scrollbar mt-3 min-h-0 overflow-y-auto">
          {section === 'draw' && (
            <div className="flex flex-col gap-3">
              <Field label="Brush">
                <div className="flex flex-wrap gap-1.5">
                  {BRUSHES.map((b) => (
                    <ToolChip key={b.tool} active={tool === b.tool} onClick={() => setTool(b.tool)}>
                      {b.label}
                    </ToolChip>
                  ))}
                </div>
              </Field>

              <Field label="Colour">
                <div className="flex items-center gap-2">
                  {PRESET_COLORS.map((c) => (
                    <ColorDot
                      key={c}
                      color={c}
                      selected={color === c && tool === 'pencil'}
                      onClick={() => {
                        setColor(c)
                        setTool('pencil')
                      }}
                      label={`Colour ${c}`}
                    />
                  ))}
                  <CustomColorPicker
                    value={color}
                    onChange={(c) => {
                      setColor(c)
                      setTool('pencil')
                    }}
                  />
                </div>
              </Field>

              <Field label="Size">
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={2}
                    max={48}
                    value={size}
                    onChange={(e) => setSize(Number(e.target.value))}
                    className="gv-slider w-28"
                    style={{ background: sliderTrack(((size - 2) / 46) * 100) }}
                  />
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center">
                    <span
                      className="block rounded-full bg-gray-800"
                      style={{ width: size, height: size, maxWidth: 22, maxHeight: 22 }}
                    />
                  </span>
                </div>
              </Field>

              <div className="flex items-center gap-1">
                <TextBtn onClick={handleUndo} disabled={!canUndo}>
                  Undo
                </TextBtn>
                <TextBtn onClick={handleRedo} disabled={!canRedo}>
                  Redo
                </TextBtn>
                <TextBtn danger onClick={handleClearDrawing}>
                  Clear Drawing
                </TextBtn>
              </div>
            </div>
          )}

          {section === 'photo' && renderPhotoPanel()}

          {section === 'background' && (
            <div className="flex flex-col gap-4">
              <Field label="Background Type">
                <div className="inline-flex rounded-xl bg-gray-100 p-0.5">
                  <Seg active={bgType === 'transparent'} onClick={() => selectBgType('transparent')}>
                    Transparent
                  </Seg>
                  <Seg active={bgType === 'solid'} onClick={() => selectBgType('solid')}>
                    Solid
                  </Seg>
                  <Seg active={bgType === 'gradient'} onClick={() => selectBgType('gradient')}>
                    Gradient
                  </Seg>
                  <Seg active={bgType === 'photo'} onClick={() => selectBgType('photo')}>
                    Photo
                  </Seg>
                </div>
              </Field>

              {bgType === 'transparent' && (
                <div className="flex items-center gap-3">
                  <span
                    className="h-9 w-16 rounded-lg ring-1 ring-gray-200"
                    style={{ background: 'repeating-conic-gradient(#e5e7eb 0% 25%, #ffffff 0% 50%) 50% / 12px 12px' }}
                  />
                  <span className="text-sm text-gray-500">No background — the drawing shows on white.</span>
                </div>
              )}

              {bgType === 'solid' && (
                <div className="flex flex-col gap-3">
                  <Field label="Colour">
                    <div className="flex flex-wrap items-center gap-2">
                      {SOLID_COLORS.map((s) => (
                        <ColorDot
                          key={s.id}
                          color={s.color}
                          selected={background?.type === 'solid' && background.id === s.id}
                          onClick={() => applyBackground(solidBackground(s))}
                          label={s.label}
                        />
                      ))}
                      <CustomColorPicker value={solidColor ?? '#3b82f6'} onChange={applyCustomSolid} />
                    </div>
                  </Field>
                  <Field label="Opacity">
                    <OpacityRow value={opacity} onChange={handleOpacity} />
                  </Field>
                </div>
              )}

              {bgType === 'gradient' && (
                <div className="flex flex-col gap-3">
                  <Field label="Presets">
                    <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(96px,1fr))]">
                      {GRADIENTS.map((g) => (
                        <GradientChip
                          key={g.id}
                          selected={selectedBgId === g.id}
                          css={gradientCss(g)}
                          label={g.label}
                          onClick={() => applyBackground(gradientBackground(g))}
                        />
                      ))}
                    </div>
                  </Field>
                  <Field label="Gradient Colour A">
                    <div className="flex flex-wrap items-center gap-2">
                      {SOLID_COLORS.map((s) => (
                        <ColorDot
                          key={s.id}
                          color={s.color}
                          selected={gradA === s.color}
                          onClick={() => chooseGradA(s.color)}
                          label={s.label}
                        />
                      ))}
                      <CustomColorPicker value={gradA} onChange={chooseGradA} />
                    </div>
                  </Field>
                  <Field label="Gradient Colour B">
                    <div className="flex flex-wrap items-center gap-2">
                      {SOLID_COLORS.map((s) => (
                        <ColorDot
                          key={s.id}
                          color={s.color}
                          selected={gradB === s.color}
                          onClick={() => chooseGradB(s.color)}
                          label={s.label}
                        />
                      ))}
                      <CustomColorPicker value={gradB} onChange={chooseGradB} />
                    </div>
                  </Field>
                  <Field label="Gradient Opacity">
                    <OpacityRow value={opacity} onChange={handleOpacity} />
                  </Field>
                </div>
              )}

              {bgType === 'photo' && renderPhotoPanel()}

              <Field label="GenVue Themes">
                <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(120px,1fr))]">
                  {THEMES.map((t) => (
                    <ThemeTile
                      key={t.id}
                      selected={selectedBgId === t.id}
                      css={gradientCss(t)}
                      label={t.label}
                      onClick={() => applyBackground(gradientBackground(t))}
                    />
                  ))}
                </div>
              </Field>

              <div className="flex justify-end">
                <TextBtn danger onClick={handleResetBackground} disabled={!hasThemeBg}>
                  Reset Background
                </TextBtn>
              </div>
            </div>
          )}
          </div>
        )}
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoPick} className="hidden" />

      {qr && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-gray-900/30 p-6">
          <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-xl">
            <h2 className="text-lg font-semibold tracking-tight text-gray-900">Drawing saved</h2>
            <p className="mt-1 text-sm text-gray-500">Scan to open the PNG.</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr.image} alt="QR code" className="mx-auto mt-5 h-56 w-56 rounded-xl" />
            <a href={qr.url} className="mt-5 inline-block break-all text-xs text-[#2F3E63] underline">
              {qr.url}
            </a>
            <div className="mt-6 flex items-center gap-2">
              <a
                href={qr.downloadUrl}
                className="flex-1 rounded-lg bg-white py-2.5 text-center text-sm font-semibold text-gray-800 shadow-sm ring-1 ring-gray-200 transition-colors duration-200 hover:bg-gray-50"
              >
                Download PNG
              </a>
              <button
                onClick={() => setQr(null)}
                className="flex-1 rounded-lg bg-[#2F3E63] py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[#26324f]"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  // Compact photo card, shared by the Photo tab and the Background→Photo type.
  // A hoisted render function (not a nested component) so it inlines without
  // remounting the subtree on every render.
  function renderPhotoPanel() {
    return (
    <div className="mx-auto max-w-lg">
        {photoSrc ? (
          <div className="flex flex-col items-center gap-5 rounded-xl border border-gray-200 p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoSrc} alt="Selected" className="max-h-40 w-auto rounded-lg shadow-sm" />
            <div className="flex items-center gap-4">
              <TextBtn onClick={() => fileInputRef.current?.click()}>Replace Photo</TextBtn>
              <TextBtn danger onClick={handleRemovePhoto}>
                Remove Photo
              </TextBtn>
            </div>
            <div className="inline-flex rounded-xl bg-gray-100 p-0.5">
              <Seg active={photoFit === 'contain'} onClick={() => setPhotoFit('contain')}>
                Fit
              </Seg>
              <Seg active={photoFit === 'cover'} onClick={() => setPhotoFit('cover')}>
                Fill
              </Seg>
              <Seg active={photoFit === 'center'} onClick={() => setPhotoFit('center')}>
                Center
              </Seg>
            </div>
          </div>
        ) : (
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`flex flex-col items-center gap-3 rounded-xl border border-gray-200 px-6 py-8 text-center transition-colors duration-200 ${
              dragOver ? 'bg-[#2F3E63]/[0.06]' : 'bg-white'
            }`}
          >
            <PhotoGlyph />
            <div>
              <p className="text-sm font-medium text-gray-700">Drop an image</p>
              <p className="text-xs text-gray-400">or</p>
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-800 shadow-sm ring-1 ring-gray-200 transition-colors duration-200 hover:bg-gray-50"
            >
              Upload Photo
            </button>
            <p className="text-xs text-gray-400">Works on phone, iPad &amp; desktop</p>
          </div>
        )}
      </div>
    )
  }
}

// A GenVue-blue filled track for the .gv-slider inputs.
function sliderTrack(pct: number): string {
  const p = Math.max(0, Math.min(100, pct))
  return `linear-gradient(to right, #2F3E63 ${p}%, rgba(0,0,0,0.08) ${p}%)`
}

// Labelled control group — a small muted label above its control, with the
// hierarchy carried by whitespace rather than boxes.
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-400">{label}</p>
      {children}
    </div>
  )
}

// Brush selector chip — accent-filled when active.
function ToolChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-2.5 py-1 text-sm font-medium transition-colors duration-200 ${
        active
          ? 'bg-[#2F3E63]/[0.08] text-[#2F3E63] ring-1 ring-[#2F3E63]/25'
          : 'text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50'
      }`}
    >
      {children}
    </button>
  )
}

// Segmented-control item.
function Seg({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 py-1 text-sm font-medium transition-colors duration-200 ${
        active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
      }`}
    >
      {children}
    </button>
  )
}

// Quiet text button for secondary actions (undo/redo/clear/reset/replace).
function TextBtn({
  onClick,
  disabled,
  danger,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md px-3 py-1.5 text-sm font-medium text-gray-500 transition-colors duration-200 disabled:opacity-40 disabled:hover:text-gray-500 ${
        danger ? 'hover:text-gray-900' : 'hover:text-gray-900'
      }`}
    >
      {children}
    </button>
  )
}

// Circular colour chip — selected gets a single blue ring, no motion.
function ColorDot({
  color,
  selected,
  onClick,
  label,
}: {
  color: string
  selected: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`h-6 w-6 rounded-full transition-shadow duration-200 ${
        selected ? 'ring-2 ring-[#2F3E63] ring-offset-2 ring-offset-white' : 'ring-1 ring-gray-200'
      }`}
      style={{ backgroundColor: color }}
    />
  )
}

// The rainbow colour picker used identically in Draw and Background.
function CustomColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <label
      title="Custom colour"
      className="relative flex h-6 w-6 cursor-pointer items-center justify-center rounded-full ring-1 ring-gray-200 transition-colors duration-200 hover:ring-gray-300"
    >
      <span className="text-sm leading-none text-gray-400">+</span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
      />
    </label>
  )
}

// Compact opacity control (slider + %), reused for Background + Gradient opacity.
function OpacityRow({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const pct = Math.round(value * 100)
  return (
    <div className="flex max-w-md items-center gap-3">
      <input
        type="range"
        min={0}
        max={100}
        value={pct}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="gv-slider flex-1"
        style={{ background: sliderTrack(pct) }}
      />
      <span className="w-10 shrink-0 text-right text-sm tabular-nums text-gray-500">{pct}%</span>
    </div>
  )
}

// Gradient preset chip — shows the ACTUAL gradient with its name overlaid.
function GradientChip({
  selected,
  css,
  label,
  onClick,
}: {
  selected: boolean
  css: string
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`relative h-10 w-full overflow-hidden rounded-xl transition-shadow duration-200 ${
        selected ? 'ring-2 ring-[#2F3E63] ring-offset-2 ring-offset-white' : 'ring-1 ring-gray-200'
      }`}
      style={{ background: css }}
    >
      <span className="absolute bottom-1 left-2 text-xs font-medium text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.35)]">
        {label}
      </span>
    </button>
  )
}

// GenVue theme preview tile (~140×80) — the actual gradient with its name.
function ThemeTile({
  selected,
  css,
  label,
  onClick,
}: {
  selected: boolean
  css: string
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`relative h-16 w-full overflow-hidden rounded-2xl transition-shadow duration-200 ${
        selected ? 'ring-2 ring-[#2F3E63] ring-offset-2 ring-offset-white' : 'ring-1 ring-gray-200'
      }`}
      style={{ background: css }}
    >
      <span className="absolute bottom-2 left-2.5 text-xs font-medium text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.4)]">
        {label}
      </span>
    </button>
  )
}

function ChevronLeft() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M10 3l-5 5 5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ChevronRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// Section tab icons (Lucide outline geometry).
function SectionIcon({ section }: { section: Section }) {
  if (section === 'draw') return <DrawIcon />
  if (section === 'photo') return <PhotoIcon />
  return <BackgroundIcon />
}

const iconProps = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

function DrawIcon() {
  return (
    <svg {...iconProps}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

function PhotoIcon() {
  return (
    <svg {...iconProps}>
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </svg>
  )
}

function BackgroundIcon() {
  return (
    <svg {...iconProps}>
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  )
}

// Minimal monochrome photo glyph for the empty dropzone.
function PhotoGlyph() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <rect x="5" y="8" width="30" height="24" rx="4" stroke="#a3a3a3" strokeWidth="2" />
      <circle cx="15" cy="17" r="3" fill="#a3a3a3" />
      <path d="M9 30l8-8 6 6 4-4 4 4" stroke="#a3a3a3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
