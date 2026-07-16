import { NextRequest } from 'next/server'
import cloudinary from '@/lib/cloudinary'

// Save a drawing PNG by uploading it to Cloudinary and returning the public
// secure_url. This replaces the old local-filesystem approach (mkdir/writeFile
// into /saved-drawings), which doesn't survive on Render's ephemeral disk.
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const { dataUrl } = await request.json()
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')) {
      return Response.json({ error: 'Invalid image data' }, { status: 400 })
    }

    // Cloudinary accepts a base64 data URI directly, so the PNG can be handed
    // over as-is with no intermediate buffer or temp file.
    const result = await cloudinary.uploader.upload(dataUrl, {
      folder: 'genvue-drawings',
      resource_type: 'image',
    })

    // Two views of the same uploaded image, never two different images:
    //   url         — the plain secure_url. The QR and the visible link use
    //                 this, so scanning it opens the drawing in the browser.
    //   downloadUrl — the same URL with the fl_attachment flag injected, which
    //                 makes Cloudinary serve it with Content-Disposition:
    //                 attachment. The Download button uses this.
    return Response.json({
      url: result.secure_url,
      downloadUrl: result.secure_url.replace('/upload/', '/upload/fl_attachment/'),
    })
  } catch {
    return Response.json({ error: 'Failed to save' }, { status: 500 })
  }
}
