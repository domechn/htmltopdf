# HTML to PDF

Convert a self-contained HTML file to PDF entirely in the browser. The app is a static frontend build and can be deployed directly to GitHub Pages.

## Features

- Single-button interface with click-to-select and drag-and-drop support.
- Client-side HTML sanitization before rendering.
- Browser-only PDF export powered by html2canvas and jsPDF.
- No uploads. Files stay on the user's device.

## Supported Input

Use a single `.html` or `.htm` file.

For the best results, the HTML file should be self-contained:

- Inline your CSS.
- Inline images as data URLs when possible.
- Avoid relying on local sibling assets next to the HTML file.

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

The production build is emitted to `dist/`.

## GitHub Pages

This project is configured for deployment under the `/htmltopdf/` GitHub Pages base path.

The included workflow publishes the contents of `dist/` to GitHub Pages whenever you push to `main`.

Before the first deployment, enable GitHub Pages in the repository settings and set the source to GitHub Actions.
