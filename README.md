# ImgCrush Image Converter

Image converter and compressor built with Express, `sharp`, and a static frontend.

## Features

- Upload multiple local images.
- Paste screenshots or copied images directly into the page.
- Add remote images with direct HTTP or HTTPS image links.
- Convert single images to WEBP, AVIF, JPEG, PNG, or TIFF.
- Copy a converted image back to the clipboard.
- Convert all queued images into one ZIP download.
- Drag cards to reorder the ZIP output sequence.
- Resize with custom width and height controls.
- Choose fit modes including contain, cover/crop, fill, inside, and outside.
- Add an optional text watermark with adjustable opacity and position.
- Save default output settings in the browser for the next session.

## Run locally

```bash
node server.js
```

Then open `http://localhost:3000`.
