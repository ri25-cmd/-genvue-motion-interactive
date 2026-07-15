import { v2 as cloudinary } from 'cloudinary'

// Shared Cloudinary client, configured from environment variables. Drawings are
// uploaded here instead of written to disk because Render's filesystem is
// ephemeral — anything written locally is lost on restart or redeploy.
//
// Required env vars (set these in the Render dashboard):
//   CLOUDINARY_CLOUD_NAME
//   CLOUDINARY_API_KEY
//   CLOUDINARY_API_SECRET
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
})

export default cloudinary
