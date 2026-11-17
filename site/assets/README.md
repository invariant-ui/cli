# Invariant logo assets

A constraint-frame mark (an accent square held inside an outlined square) beside the word `invariant` in a semibold system serif (Iowan Old Style, Palatino, Georgia). Redrawn 2026-11-17 to match the editorial site and docs; the earlier version was bold system sans. Shared by the landing page and the docs. Reference them with a relative path (`assets/...` from the site root, `../assets/...` from `docs/`).

| File | Use |
|---|---|
| `logo-wordmark.svg` | The wordmark in light ink. Use on dark backgrounds. |
| `logo-wordmark-light.svg` | The wordmark in dark ink. Use on light backgrounds. |
| `logo-icon.svg` | the frame mark on the site's dark panel. Avatars and app icons. |
| `favicon.svg`, `favicon-32.png`, `apple-touch-icon.png` | Browser tab and home-screen icons. |
| `og-image.svg`, `og-image.png` | 1200x630 social card. |
| `logo-wordmark.png`, `logo-icon-512.png` | Raster copies for tools that cannot take SVG. |

## Colors

| Name | Value |
|---|---|
| Ink (background) | `#0e0e0d` |
| Paper (text on dark) | `#ece9e2` |
| Accent (the period) | `#7c8cff` |
| Line | `#2a2a27` |

## Notes

- The SVGs use live text in the system serif stack, pinned to a fixed width with `textLength`, so they look close to the site on any machine but not identical to the PNGs, which were exported on macOS. For exact results, use the PNGs.
- The mark's inner square is always Accent. Do not recolor it, and do not place the light-ink wordmark on a light background.
- Keep clear space around the wordmark of at least the height of the `i` dot.
- The PNGs are exported from the SVGs with headless Chrome. Re-export them if an SVG changes.
