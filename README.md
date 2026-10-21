# Portfolio

A personal portfolio site: a calm two-column layout with a loud, maximalist look, a command
palette (press `/` or click the pill at the bottom) built from the page itself, and five hidden
secrets. Plain HTML, CSS and JavaScript:
no build step, no dependencies (fonts load from Google Fonts, with system fallbacks).

## Tests

`tests/` holds browser tests for the site: the command palette (keyboard, focus trap, filtering, every action), the three styles, the five
secrets, the contribution chart (including when its data is missing), sideways scrolling at nine
screen widths, tap target sizes, an accessibility scan (axe) of every style on desktop and
phone and with the palette open, and the reduced-motion fallbacks. They are not part of the published site.

```
cd tests
npm install
npx playwright install chromium
npm test
```
