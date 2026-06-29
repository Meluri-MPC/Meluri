# VelumX MPC — Vanilla HTML

Single HTML file using VelumX MPC SDK. Zero build tools, zero dependencies beyond the SDK.

## Quick Start

```bash
cd examples/vanilla-html
npx serve .
# or just open index.html in a browser (requires a local server for ES modules)
```

## Production CDN Usage

Replace the script tag with:

```html
<script src="https://cdn.velumx.xyz/sdk/latest/velumx.iife.js"></script>
```

Then use `window.VelumX` instead of imports.

## Structure

```
vanilla-html/
  index.html   — Everything in one file
  README.md
```

## Features

- Login with MPC wallet creation (demo auth)
- Balance display
- Send STX form
- Transaction history
- All vanilla JS — no framework required
