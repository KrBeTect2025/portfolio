# DESIGN.md: Signal (Krish Rathore portfolio)

Read this before building or changing any page of the portfolio. It describes how the Signal direction looks, moves and reads, so every page stays consistent. The reference build is this repository's `index.html`, `styles.css` and `script.js`.

## 1. Visual theme

Dark, quiet and technical. One live picture at each end of the page, everything between them is still.

- The page is a short journey: it opens at dusk (the cloud sea scene, sun setting) and ends at sunrise seen from orbit (the edge orbit scene, requests arcing between city lights). The background darkens from dusk to night on the way down, so the ending feels like an arrival.
- The hero is asymmetric (text top left, sun to the right). The ending is centred. Tension at the top, resolution at the bottom.
- Orange is the only accent. It comes from the scenes themselves (#F38020 appears in both), so the page and the art share one light.

## 2. Colour tokens

| Token | Value | Use |
|---|---|---|
| `ground-dusk` | `#0E0E0F` | Page background from the top to about 1400 px. Same as the cloud sea scene's own background, so the hero has no edge. |
| `ground-night` | `#04060C` | Page background at the bottom. Same as the edge orbit scene's background. |
| `surface` | `#141416` | Cards. |
| `hairline` | `#232327` | 1 px dividers and card borders. `#36363C` on hover. |
| `ink` | `#EDEDED` | Headings and body text. |
| `ink-soft` | `#C9C9C9` | Long body text inside cards and the About paragraph. |
| `muted` | `#9A9A9A` | Secondary text and labels. Passes 4.5:1 on both grounds. |
| `faint` | `#8A8A92` | Month labels, legends and `dt` labels at 11 to 12 px uppercase. Still passes 4.5:1; never go darker for text. |
| `accent` | `#F38020` | Section numbers, the "now" tag, key numbers, the primary button, focus rings. |
| `accent-hot` | `#FAAE40` | Only for the busiest contribution days and the Star Border light. |
| `live` | `#3FCB7E` | The "Live" dot on a deployed project. Nothing else. |
| `error` | `#E5484D` | The copy button's error state. Nothing else. |

Contribution dots use the edge orbit palette, smallest to largest: `#2A2D36`, `#7A3812`, `#D0661A`, `#F38020`, `#FAAE40`. Size changes with colour, so the levels read without colour too.

## 3. Typography

| Role | Font | Size / weight / leading / tracking |
|---|---|---|
| Name (hero) | JetBrains Mono | clamp(36px, 5.6vw, 80px) / 500 / 1.0 / -0.06em |
| Closing line ("Say hi.") | Instrument Sans | clamp(64px, 9vw, 132px) / 500 / 0.9 / -0.05em |
| Section heading | Instrument Sans | clamp(30px, 3vw, 44px) / 500 / 1.1 / -0.03em |
| Card title, headline | Instrument Sans | clamp(30px, 3.2vw, 46px) / 500 / 1.0 / -0.035em |
| Card title, small | Instrument Sans | 28px / 500 / 1.05 / -0.03em |
| Principle | Instrument Sans | 21px / 400 / 1.35 / -0.01em |
| Body | Instrument Sans | 15 to 17px / 400 / 1.55 |
| Label (eyebrow) | JetBrains Mono | 12px / 400 / uppercase / +0.08em |
| Big number | JetBrains Mono | 36 to 76px / 500 / 1.0 / -0.04 to -0.06em |

Section labels are numbered like a route: `01 / Work`, `02 / Skills`, `03 / GitHub`, `04 / Approach`, `05 / Contact`. The number is in `accent`.

## 4. Space, radius, layout

- Side padding 48 px on desktop, 20 px on phones. Sections are 160 px apart (112 px on phones).
- Radii: 16 px cards, 12 px focus areas, 8 px tooltips, 999 px buttons.
- Work is a 3-column bento: the headline project spans 2 columns and 2 rows.
- Skills is four equal compartments in a row (2 by 2 below 1100 px, stacked under 640 px).
- GitHub and Approach are two-column splits (4:8 and 5:7) that stack below 1100 px and 900 px.
- No shadows except the busiest contribution dot's glow and the navigation pill. Depth comes from the two grounds and the scenes.
- There is no top bar. Navigation is the glass pill fixed 16 px above the bottom of the screen (plus the safe area on phones), so the page bottom keeps 96 px of padding to stay clear of it.

## 5. Components

- **Scene frame.** `<ascii-art>` from ascii.rest inside a box with a fixed shape and `overflow: hidden`. Hero: 16:7 on desktop, 2:1 on phones, with gradients that fade the left, top and bottom into `ground-dusk`. Ending: the scene fills the whole contact stage behind the text and the wordmark, like `background-size: cover` anchored to the bottom (never more than 4 times the stage width), its top and bottom fading into `ground-night`. The contact text sits on top of it.
- **Project card.** Label (stack), title, one paragraph, then a `Works / Not yet` or `Note` list, then links. Every card says what does not work yet.
- **Skill compartment.** A card titled Languages, Backend and data, Front end or Practice, with its count in `accent`. Each skill is a row: the name, then in small mono the project that uses it. A skill with no project behind it does not go on the page.
- **Contribution map.** One dot per day, 53 weeks by 7 days, month labels above, legend below, a link to the GitHub profile. Reads `data/contributions.json`, which the deploy writes daily. Days sit 16 px apart where the whole year fits, closing up to 12 px; only where 12 px does not fit (phones) does the box scroll sideways.
- **Primary button.** Orange pill, dark text, 56 px tall, wrapped in the Star Border ring.
- **Copy button.** Outline pill showing the address, with the Status Mark glyph and a one-word state: Copy, Copying, Copied, Blocked. It blurs the scene behind it (10 px).
- **Contact shade.** A soft radial shade follows the contact text, and the paragraph and social links carry a dark halo, so they stay readable where the orbit passes behind them.
- **Navigation pill.** Five mono links (work, skills, github, approach, contact) in a clear liquid-glass pill: 18 px backdrop blur with 180% saturation, a light sheen, a rim that is brighter on top, and a 46% dark tint so the words stay readable over the scenes. A brighter drop of glass sits behind the section being read and slides between links with a little overshoot. Nothing is marked in the hero.
- **Wordmark.** "Krish" in JetBrains Mono 500, as wide as the page (font size is the stage width minus padding, divided by 2.8), at the very end of the contact stage over the Earth. Decorative, so hidden from screen readers; the name is already the h1.

## 6. Motion

Budget: the two scenes, one load effect, one arrival effect, the wordmark rise, and hover or focus feedback. The wordmark is the only thing tied to scroll position.

| Effect (React Bits name) | Where | Trigger | Notes |
|---|---|---|---|
| Decrypted Text | Hero name | Page load, once | Left to right, 45 ms steps. |
| Decrypted Text | "Say hi." | Comes 60% into view, once; again on hover | Edges first, centre last, so the line converges. |
| Spotlight Card | Project cards and skill compartments | Pointer move | Radial accent glow at 12%. |
| Warm Tooltip | Contribution dots | Hover, or arrow keys after focusing the map | First tooltip waits 320 ms, the next ones open at once for 500 ms after leaving. |
| Star Border | Email button | Once after "Say hi." resolves; loops while hovered or focused | One light travelling the outline, then it fades. |
| Status Mark | Copy button | Click | Ring, spinning arc, then a check. |
| (own) Section highlight | Navigation pill | The section crossing a band 40 to 45% down the screen; the page bottom counts as contact | Slides 0.5 s with a slight overshoot. |
| (own) Wordmark rise | "Krish" at the bottom | Scroll: 0 when its top reaches the screen bottom, 1 when it is fully in view | Letters rise from below a clip line one after another (each starts 0.15 later). |

Rules: the Pause animation button (bottom of the page, remembered per visitor) and `prefers-reduced-motion` both stop every effect and hold each scene on a still frame. Scenes start only when they come within a screen of the viewport and build in idle time. With motion off the wordmark is simply in place. Never add custom cursors, scroll-jacking, parallax or a third scene.

## 7. Responsive

| Width | Changes |
|---|---|
| 1100 px and up | Full layout. |
| 900 to 1100 px | GitHub split stacks. |
| 640 to 900 px | Bento and Approach become one column. |
| Under 640 px | Hero text moves above the scene; the hero scene becomes 2:1; the contribution map scrolls sideways inside its box and starts at the latest week; the navigation pill tightens (12 px text, then 11 px under 340 px). |

Touch targets are at least 44 px. The page never scrolls sideways; only the contribution map box may.

## 8. Accessibility

- All text, including 11 px labels, meets 4.5:1 on both grounds.
- Every scene canvas has `role="img"` and a written description.
- The contribution map is one tab stop with a summary label; arrow keys, Home and End move day by day, and each day is announced.
- Animated text keeps its real words in `aria-label`; the scrambled letters are hidden from screen readers.
- Copy results are announced in a polite live region.
- A "Skip to work" link appears on first Tab, before the navigation pill.
- The navigation pill is a `nav` landmark; the section being read has `aria-current="true"`.

## 9. Do and don't

- Do keep the hero exactly as it is.
- Do keep every claim checkable: numbers come from tests or from the GitHub data file.
- Do credit ascii.rest in the footer and keep its MIT licence with the copied files.
- Don't load scenes from ascii.rest at runtime; vendor them.
- Don't add a second accent, gradients on text or emoji. Glass is for the navigation pill only (and the light blur behind the copy button).
- Don't add more scroll-linked motion than the wordmark, or more than one effect to an element.

## 10. Prompt guide for an AI agent

"Build [page] for Krish Rathore's portfolio using DESIGN.md. Dark grounds #0E0E0F to #04060C, one orange accent #F38020, Instrument Sans with JetBrains Mono labels, numbered section labels, 16 px cards with hairline borders, the glass navigation pill at the bottom and no top bar. No new motion beyond the table in section 6. Plain HTML, CSS and JavaScript, no framework."
