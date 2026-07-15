'use client'

// Helpers for the Photo Mirroring feature: turn a file chosen from the native
// picker into a clean, sync-friendly data URL, and load a data URL back into an
// HTMLImageElement for canvas rendering.

// A full-resolution phone photo can be several megabytes; downscaling before it
// travels over Socket.IO keeps the mirror snappy without any visible quality
// loss on a display. The image is drawn "contain" anyway, so this is plenty.
export const MAX_IMAGE_DIMENSION = 1600

// Read a picked File, downscale it to fit MAX_IMAGE_DIMENSION, and return a
// same-origin JPEG data URL. Because the source is a local file (not a remote
// URL), the canvas it later paints onto stays untainted — so Save/QR export
// keeps working.
export function fileToDataUrl(file: File, maxDim = MAX_IMAGE_DIMENSION): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read file'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Could not decode image'))
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight))
        const w = Math.max(1, Math.round(img.naturalWidth * scale))
        const h = Math.max(1, Math.round(img.naturalHeight * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('No 2D context'))
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', 0.9))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

// Resolve once an image source (data URL) has fully decoded, so callers can
// safely draw it onto a canvas.
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not load image'))
    img.src = src
  })
}
