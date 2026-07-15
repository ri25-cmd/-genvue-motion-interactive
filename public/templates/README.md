# Export templates

Place the branded GenVue frame here as:

    genvue-frame.png

The controller's **Save Drawing** flow composes the user's artwork into this
frame (see `lib/export/composeExportImage.ts`):

- A new high-resolution canvas is created (2160 on the long edge; a square frame
  → 2160×2160).
- The template is drawn as the background, **untouched** (never distorted — we
  only draw on top of it).
- The artwork is drawn into the **largest white square** in the template
  (auto-detected), `object-fit: contain` — proportional, centred, never
  stretched.
- Today's date (`16 July 2026`) is stamped beside the `Date:` label in Inter /
  dark GenVue navy (`#2F3E63`).
- The composed image is exported as a PNG Blob; the QR/download point to it.

If this file is missing, Save falls back to uploading the raw drawing PNG, so the
workflow keeps working either way.

## Tuning

The white square is auto-detected. To place the date exactly on the `Date:`
line (and clear the logo/footer), pass `options.date` (fractional `xFrac`/
`yFrac`, `align`, `sizeFrac`) — or `options.placeholder` to override the detected
square — when calling `composeExportImage` in `app/control/page.tsx`.
