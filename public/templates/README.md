# Export templates

Place the branded GenVue frame here as:

    genvue-frame.png

The controller's **Save Drawing** flow composes the user's artwork into this
frame (see `lib/export/composeExportImage.ts`):

- A new canvas is created at the template's **exact pixel dimensions**, so the
  frame is reproduced 1:1 and never resampled (the shipped frame is 1080×1080).
- The template is drawn as the background, **untouched** (never distorted — we
  only draw on top of it).
- The artwork is drawn into the **largest white square** in the template
  (auto-detected), `object-fit: contain` — proportional, centred, never
  stretched.
- Today's date (`16 July 2026`) is stamped beside the `Date:` label in Inter,
  in **white** — the label sits on the navy footer, so navy text would be
  invisible there.
- The composed image is exported as a PNG Blob; that exact PNG is what uploads to
  Cloudinary, what the QR resolves to, and what the visitor downloads.

**This file is required.** There is no raw-canvas fallback: if it is missing,
Save fails with an error rather than silently handing over an unbranded drawing.

## Tuning

The white square is auto-detected. To place the date exactly on the `Date:`
line (and clear the logo/footer), pass `options.date` (fractional `xFrac`/
`yFrac`, `align`, `sizeFrac`) — or `options.placeholder` to override the detected
square — when calling `composeExportImage` in `app/control/page.tsx`.
