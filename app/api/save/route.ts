import { NextRequest } from 'next/server'
import { randomUUID } from 'crypto'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

// Save a drawing PNG to disk and return a URL that phones on the same Wi-Fi
// can open (built from the Host the controller used, so it stays LAN-correct).
export const runtime = 'nodejs'

const SAVE_DIR = path.join(process.cwd(), 'saved-drawings')

export async function POST(request: NextRequest) {
  try {
    const { dataUrl } = await request.json()
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')) {
      return Response.json({ error: 'Invalid image data' }, { status: 400 })
    }

    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '')
    const buffer = Buffer.from(base64, 'base64')

    await mkdir(SAVE_DIR, { recursive: true })
    const filename = `genvue-${randomUUID()}.png`
    await writeFile(path.join(SAVE_DIR, filename), buffer)

    const host = request.headers.get('host') ?? 'localhost:3000'
    const url = `http://${host}/api/image/${filename}`

    return Response.json({ filename, url })
  } catch {
    return Response.json({ error: 'Failed to save' }, { status: 500 })
  }
}
