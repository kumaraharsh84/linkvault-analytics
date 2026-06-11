# LinkVault Frontend

Single-page app for the LinkVault URL shortener. No build step, no framework — open `index.html` over HTTP and it works.

## Files
| File | Purpose | Lines |
|---|---|---|
| `index.html` | Page structure, accessibility, CSP meta | ~250 |
| `styles.css` | All styling, token-driven light + dark theme | ~450 |
| `app.js` | All UI logic, state, API calls, charts | ~700 |

## Run locally

```bash
cd frontend
python -m http.server 5500
# Open http://localhost:5500/index.html
```

The `API_BASE` is set in `app.js` → `CONFIG.apiBase`. Change it to point at your deployed API Gateway URL, or at `http://localhost:3001` if you are running the backend with `sam local start-api --port 3001`.

## What's in this rewrite (vs the old single-file version)
This is the P2 frontend polish:

- Three files instead of one 649-line HTML. Easier to diff, easier to find things, easier to add a build step later if you want one.
- CSP meta tag in `<head>` — restricts what the page can load and execute. Tighten further by adding your API host to `connect-src`.
- Accessibility:
  - All icon buttons now have `aria-label` (was title only)
  - Forms use proper `<label for>` + `id` linkage
  - Auth cards and modals have `aria-labelledby`
  - Tab navigation uses `role="tablist"` / `role="tab"`
  - Tables have `role="row"` / `role="columnheader"`
  - Toasts container is `aria-live="polite"`
  - Loading overlay is `role="status"`
  - Burger button has `aria-expanded` toggling
  - Password fields use autocomplete attributes
  - New `minlength="8"` on the register password
  - Press `Esc` to close modals
  - Press `Enter` in the rename input to save
- Chart text contrast fix — the "total clicks" subtitle in the doughnut chart was grey-on-grey. Bumped `--chart-subtle` in both themes for legibility, and the center number is now bigger (28px) and uses proper text alignment.
- Form submit on Enter — the shorten form now uses `<form>` so pressing Enter in the URL field shortens.
- Type-safe config — `API_BASE`, theme key, and grace days moved into a `CONFIG` object at the top of `app.js`.
- All event listeners go through `bind()` — no inline `onclick` attributes anywhere.

## Identical behavior to the old version
- Same pages, same routes, same API calls, same payload shapes.
- Same theme toggle, same drawer behavior, same toast notifications.
- Same filter / sort / search logic.
- Same chart styling (just better contrast on the center text).
- Same restore window (7 days), same expiry logic.

## Things that did NOT change
- No build step. No npm. Open the HTML file and it works.
- No framework. The IIFE wrapper around the JS is just a namespace.
- No new dependencies. Chart.js still loads from `cdn.jsdelivr.net`.

## What you'll want to do next (not done here)
- Move the API base to a relative URL so the same frontend works in dev (localhost) and prod without editing files.
- Add a service worker for offline support.
- Replace the CDN-loaded Chart.js with a vendored copy so CSP can be tightened to `script-src 'self'` only.
- Move the toast container position if you add a global banner.
