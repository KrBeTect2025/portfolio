# Portfolio

A personal portfolio site: a calm two-column layout with a loud, maximalist look, a working
terminal that answers from the page, and five hidden secrets. Plain HTML, CSS and JavaScript:
no build step, no dependencies (fonts load from Google Fonts, with system fallbacks).

## Run it locally

Open `index.html` in a browser. That is all.

## Before publishing

Search `index.html` for `TODO(you)` and `YOUR NAME` and fill each one in: your name, email,
LinkedIn, an About paragraph in your own words, and a resume PDF if you have one.
Check that the RescueSync live link still works.

## Host it on GitHub Pages

Repository Settings > Pages > Source: "Deploy from a branch" > Branch: `main`, folder `/ (root)`.
The site appears at `https://krbetect2025.github.io/portfolio/`.

## How it is built

- `styles.css` defines every colour as a token at the top. "Plain mode" swaps those tokens
  for calm ones and hides decorations marked `data-loud`.
- `script.js` holds the terminal and the secrets. The terminal reads projects from the HTML,
  so there is one place to edit content.
- If JavaScript fails, the page still shows all content; only the terminal and secrets are lost.
- The moving ticker stops when the visitor's system asks for reduced motion.
