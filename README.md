# Portfolio

A personal portfolio site called Signal: a dark, quiet page that opens at dusk (an ASCII sunset
over cloud) and ends at sunrise seen from orbit, with five numbered sections in between: work,
skills, GitHub, approach and contact. Plain HTML, CSS and JavaScript: no build step and no
dependencies (fonts load from Google Fonts, with system fallbacks).

## Files

- `index.html`: all the words and links on the page.
- `styles.css`: colours, type and layout. The colour tokens are at the top.
- `script.js`: the small effects (the name and "Say hi." scrambling into place, the card
  spotlight, the copy button), the Pause animation button, and the contribution map.
- `vendor/ascii-rest/`: the two animated scenes, "cloud sea" and "edge orbit", copied from
  [ascii.rest](https://ascii.rest) by [@bas3line](https://github.com/bas3line/ascii) under the MIT
  licence (kept in that folder). They are vendored, not loaded from ascii.rest, so the site never
  depends on another server.
- `DESIGN.md`: the design system (colours, type, spacing, components, motion, accessibility).
  Read it, or give it to an AI agent, before changing how the page looks.
- `og.png`: the 1200x630 picture a link preview shows on LinkedIn, WhatsApp, Slack or X.
- `scripts/fetch_contributions.py` and `.github/workflows/deploy.yml`: every push to `main` and
  once a day, GitHub Actions saves your contribution calendar to `data/contributions.json` and
  publishes the site to GitHub Pages. The GitHub section is drawn from that file; when it is
  missing (for example when you open `index.html` straight from disk), the section shows a note
  and the profile link instead.

## Before it goes live

Two placeholders are yours to fill in `index.html` (search for `TODO(you)`):

- your email address in the `mailto:` link of the Email me button (the copy button reads it from there);
- your LinkedIn profile URL, or delete that link.

## Motion

The scenes run only while they are on screen. Everything holds still when the system asks for
reduced motion, and visitors can press Pause animation at the bottom of the page; that choice is
remembered.

## Tests

`tests/` holds browser tests for the site. They are not part of the published site. They cover
loading without errors, the page head and preview image, forced dark mode, section order, the
skip link, the contribution map (numbers, weekdays, tooltip, keyboard, missing or broken data),
the effects, the copy button, reduced motion and the Pause button, sideways scrolling at 19
screen widths, touch target sizes, an accessibility scan (axe) on desktop and phone, and a check
that the deploy workflow publishes every file the page loads.

```
cd tests
npm install
npx playwright install chromium
npm test
```
