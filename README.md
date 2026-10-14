# Portfolio

A personal portfolio site: a calm two-column layout with a loud, maximalist look, a working
terminal that answers from the page, and five hidden secrets. Plain HTML, CSS and JavaScript:
no build step, no dependencies (fonts load from Google Fonts, with system fallbacks).

## Tests

`tests/` holds browser tests for the site: every terminal command, the three styles, the five
secrets, the contribution chart (including when its data is missing), sideways scrolling at nine
screen widths, tap target sizes, and an accessibility scan (axe) of every style on desktop and
phone. They are not part of the published site.

```
cd tests
npm install
npx playwright install chromium
npm test
```
