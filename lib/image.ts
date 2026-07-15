'use client'

// Helpers for the Photo Mirroring feature: turn a file chosen from the native
// picker into a clean, sync-friendly data URL, and load a data URL back into an
// HTMLImageElement for canvas rendering.

// Read a picked File and return its ORIGINAL bytes as a data URL — no downscale,
// no re-encode — so the image renders at full resolution and stays sharp. The
// canvas handles sizing via contain/cover/center in paintBackground. Because the
// source is a local file (not a remote URL), the canvas it later paints onto
// stays untainted — so Save/QR export keeps working.
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read file'))
    reader.onload = () => resolve(reader.result as string)
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
