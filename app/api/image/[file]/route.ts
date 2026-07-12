import { NextRequest } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'

// Serve a saved drawing. Content-Disposition: attachment so scanning the QR
// on a phone downloads the PNG rather than just previewing it.
export const runtime = 'nodejs'

const SAVE_DIR = path.join(process.cwd(), 'saved-drawings')

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ file: string }> },
) {
  const { file } = await params

  // Only allow the exact filenames we generate — no path traversal.
  if (!/^genvue-[a-f0-9-]+\.png$/.test(file)) {
    return new Response('Not found', { status: 404 })
  }

  try {
    const buffer = await readFile(path.join(SAVE_DIR, file))
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': `attachment; filename="${file}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}
