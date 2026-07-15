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

    // The QR code on the controller is built from this url. Injecting the
    // fl_attachment flag into the delivery URL makes Cloudinary serve the image
    // with Content-Disposition: attachment, so scanning the QR downloads the
    // PNG (keeping its filename) instead of opening it in the browser.
    return Response.json({
      url: result.secure_url.replace('/upload/', '/upload/fl_attachment/'),
    })
  } catch {
    return Response.json({ error: 'Failed to save' }, { status: 500 })
  }
}
