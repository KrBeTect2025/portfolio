// End-to-end checks for the portfolio: command palette, styles, secrets, chart, layout and accessibility.
// Setup once:  cd tests && npm install && npx playwright install chromium
// Run:         npm test            (from the tests folder)
// It serves the site itself and uses tests/sample-contributions.json as chart data.
const { chromium } = require("playwright");
const fs = require("fs");
const http = require("http");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const SAMPLE = path.join(__dirname, "sample-contributions.json");
const OUT = path.join(__dirname, "output");
const AXE = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
fs.mkdirSync(OUT, { recursive: true });

// A tiny static server for the repo folder. data/contributions.json comes from the sample file.
const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".png": "image/png" };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  const file = url === "/data/contributions.json" ? SAMPLE : path.join(ROOT, url === "/" ? "index.html" : url);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});

const results = [];
const issues = [];   // findings that are not hard failures
function note(area, msg) { issues.push({ area, msg }); }
async function test(name, fn) {
  try { await fn(); results.push({ name, ok: true }); }
  catch (e) { results.push({ name, ok: false, err: String(e && e.message || e).slice(0, 400) }); }
}
function assert(c, m) { if (!c) throw new Error(m); }

(async () => {
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const BASE = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  // Block Google Fonts so runs are repeatable offline; system fallbacks render instead.
  async function newPage(opts = {}) {
    const { realFonts, ...rest } = opts;
    const ctx = await browser.newContext(Object.assign({ viewport: { width: 1366, height: 900 } }, rest));
    if (!realFonts) await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    const page = await ctx.newPage();
    page.errors = [];
    page.on("pageerror", e => page.errors.push(e.message));
    page.on("console", m => { if (m.type() === "error" && !/fonts|ERR_FAILED/.test(m.text())) page.errors.push(m.text()); });
    return page;
  }
  async function setStyle(page, s) {
    await page.evaluate(s => localStorage.setItem("style", JSON.stringify(s)), s);
    await page.reload(); await page.waitForTimeout(150);
  }
  // Opens the palette, types a query and returns the visible option labels.
  async function palette(page, query) {
    if (!(await page.$(".cmdk.is-open"))) { await page.focus("body"); await page.keyboard.press("/"); }
    await page.fill("#paletteInput", query || "");
    return page.$$eval('#paletteList [role="option"] .cmdk__label', o => o.map(x => x.textContent));
  }

  // ---------- Load, errors, overflow ----------
  const widths = [320, 360, 390, 768, 900, 901, 1024, 1366, 1920];
  for (const style of ["poster", "rock", "plain"]) {
    await test(`no JS errors and no sideways scroll: ${style}`, async () => {
      const page = await newPage();
      await page.goto(BASE); await setStyle(page, style);
      const bad = [];
      for (const w of widths) {
        await page.setViewportSize({ width: w, height: 800 });
        await page.waitForTimeout(700); // let the rock slam animation finish
        const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
        if (o.sw > o.cw) bad.push(`${w}px: page ${o.sw} wide`);
      }
      assert(!page.errors.length, "errors: " + page.errors.join(" | "));
      assert(!bad.length, bad.join(", "));
      await page.context().close();
    });
  }

  // ---------- Activity chart ----------
  await test("activity chart draws every day and month labels", async () => {
    const page = await newPage(); await page.goto(BASE); await page.waitForTimeout(300);
    const data = JSON.parse(fs.readFileSync(SAMPLE));
    const days = data.weeks.reduce((n, w) => n + w.length, 0);
    const cells = await page.$$eval("#activityGrid i", e => e.length);
    const months = await page.$$eval(".activity__month", e => e.map(x => x.textContent));
    assert(cells === days, `cells ${cells} vs days ${days}`);
    assert(months.length >= 11, "months: " + months.join(","));
    const sum = await page.textContent("#activitySummary");
    assert(sum.includes(String(data.total)), "summary lacks total: " + sum);
    await page.context().close();
  });
  await test("activity chart falls back cleanly when the data file is missing", async () => {
    const page = await newPage();
    await page.route(/contributions\.json/, r => r.fulfill({ status: 404, body: "" }));
    await page.goto(BASE); await page.waitForTimeout(300);
    const t = await page.textContent("#activitySummary");
    assert(/GitHub/.test(t) && !/Loading/.test(t), t);
    assert(await page.$eval("#activityScroll", e => e.hidden), "grid still shown");
    const errs = page.errors.filter(e => !/status of 404/.test(e)); // the 404 we forced
    assert(!errs.length, errs.join("|"));
    await page.context().close();
  });
  await test("activity chart on a phone starts scrolled to the newest weeks", async () => {
    const page = await newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(BASE); await page.waitForTimeout(400);
    const s = await page.$eval("#activityScroll", e => ({ l: e.scrollLeft, max: e.scrollWidth - e.clientWidth }));
    assert(s.max > 0 && Math.abs(s.l - s.max) < 3, JSON.stringify(s));
    await page.context().close();
  });
  await test("opening index.html from disk shows the fallback, no errors", async () => {
    const page = await newPage(); await page.goto("file://" + path.join(ROOT, "index.html")); await page.waitForTimeout(300);
    const t = await page.textContent("#activitySummary");
    assert(!/Loading/.test(t), t);
    assert(!page.errors.length, page.errors.join("|"));
    await page.context().close();
  });

  // ---------- Command palette ----------
  await test("palette: / opens a modal dialog with focus in the search box, Esc closes and returns focus", async () => {
    const page = await newPage(); await page.goto(BASE);
    assert(await page.isVisible("#paletteTrigger"), "pill not visible");
    await page.focus("#modeToggle"); await page.keyboard.press("/");
    const d = await page.evaluate(() => ({
      role: document.getElementById("palette").getAttribute("role"), modal: document.getElementById("palette").getAttribute("aria-modal"),
      focus: document.activeElement.id, inert: document.querySelector(".layout").inert, overlay: document.getElementById("paletteOverlay").classList.contains("is-open")
    }));
    assert(d.role === "dialog" && d.modal === "true", JSON.stringify(d));
    assert(d.focus === "paletteInput" && d.inert && d.overlay, JSON.stringify(d));
    await page.keyboard.press("Escape");
    const after = await page.evaluate(() => ({ focus: document.activeElement.id, inert: document.querySelector(".layout").inert, role: document.getElementById("palette").getAttribute("role") }));
    assert(after.focus === "modeToggle" && !after.inert && after.role === null, JSON.stringify(after));
    assert(!page.errors.length, page.errors.join("|"));
    await page.context().close();
  });
  await test("palette: Ctrl+K toggles it, the pill and the overlay open and close it", async () => {
    const page = await newPage(); await page.goto(BASE);
    await page.keyboard.press("Control+k"); assert(await page.$(".cmdk.is-open"), "ctrl+k open");
    await page.keyboard.press("Control+k"); assert(!(await page.$(".cmdk.is-open")), "ctrl+k close");
    await page.click("#paletteTrigger"); assert(await page.$(".cmdk.is-open"), "pill open");
    await page.mouse.click(20, 20); await page.waitForTimeout(50);
    assert(!(await page.$(".cmdk.is-open")), "overlay click did not close");
    await page.context().close();
  });
  await test("palette: lists actions, sections, projects and outside links from the page", async () => {
    const page = await newPage(); await page.goto(BASE); await page.waitForTimeout(300);
    const all = await palette(page, "");
    for (const want of ["Say hi", "Switch to Rockstar", "Switch to Plain", "Secrets", "Activity", "Projects", "Skills", "About", "Contact",
      "lab-report-explainer", "RescueSync", "urlshort", "GitHub", "LinkedIn", "RescueSync demo"]) assert(all.includes(want), "missing " + want + " in " + all.join(","));
    assert(!all.includes("Switch to Poster"), "offers the current style");
    assert(!all.includes("Permission denied"), "hidden item showing");
    const groups = await page.$$eval(".cmdk__group", g => g.map(x => x.textContent));
    assert(groups.join("|") === "Quick actions|Sections|Projects|Elsewhere", groups.join("|"));
    await page.context().close();
  });
  await test("palette: typing filters, and an empty result says so", async () => {
    const page = await newPage(); await page.goto(BASE);
    const r = await palette(page, "rock");
    assert(r.length === 1 && r[0] === "Switch to Rockstar", r.join(","));
    const two = await palette(page, "  SOURCE  url ");
    assert(two.length === 0 || two.every(x => /url/i.test(x)), two.join(","));
    assert(await page.isVisible(".cmdk__empty") || two.length, "no empty state");
    await palette(page, "zzzz");
    assert(/Nothing here/.test(await page.textContent(".cmdk__empty")), "empty text");
    assert(/No results/.test(await page.textContent("#paletteStatus")), "status not announced");
    await page.context().close();
  });
  await test("palette: arrow keys move the selection and wrap, Enter runs it", async () => {
    const page = await newPage(); await page.goto(BASE); await page.evaluate(() => localStorage.clear()); await page.reload();
    await palette(page, "");
    const sel = () => page.evaluate(() => ({ ad: document.getElementById("paletteInput").getAttribute("aria-activedescendant"), n: document.querySelectorAll('[aria-selected="true"]').length }));
    let s1 = await sel(); assert(s1.ad === "palette-o0" && s1.n === 1, JSON.stringify(s1));
    await page.keyboard.press("ArrowUp");
    const last = await page.$$eval('[role="option"]', o => o.length - 1);
    s1 = await sel(); assert(s1.ad === "palette-o" + last, "no wrap: " + JSON.stringify(s1));
    await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowDown");
    s1 = await sel(); assert(s1.ad === "palette-o1", JSON.stringify(s1));
    const hl = await page.$eval("#paletteHl", e => getComputedStyle(e).opacity);
    assert(hl === "1", "highlight hidden");
    await palette(page, "plain"); await page.keyboard.press("Enter"); await page.waitForTimeout(900);
    assert(await page.evaluate(() => document.body.classList.contains("plain")), "Enter did not switch style");
    assert(!(await page.$(".cmdk.is-open")), "still open");
    assert(await page.textContent("#secretCount") === "1", "first jump secret");
    await page.context().close();
  });
  await test("palette: jumping to a section scrolls there and moves focus", async () => {
    const page = await newPage(); await page.goto(BASE);
    await palette(page, "skills tools"); await page.keyboard.press("Enter"); await page.waitForTimeout(1200);
    const r = await page.evaluate(() => ({ top: Math.round(document.getElementById("skills").getBoundingClientRect().top), focus: document.activeElement.id }));
    assert(Math.abs(r.top) < 60 && r.focus === "skills", JSON.stringify(r));
    await palette(page, "urlshort"); await page.keyboard.press("Enter"); await page.waitForTimeout(100);
    assert(await page.evaluate(() => document.activeElement.classList.contains("project")), "project card not focused");
    await page.context().close();
  });
  await test("palette: outside links open in a new tab", async () => {
    const page = await newPage(); await page.goto(BASE);
    await palette(page, "github");
    const [popup] = await Promise.all([page.context().waitForEvent("page"), page.keyboard.press("Enter")]);
    assert(/github\.com\/KrBeTect2025/.test(popup.url()) || popup.url() === "about:blank", popup.url());
    assert(!(await page.$(".cmdk.is-open")), "still open");
    await page.context().close();
  });
  await test("palette: Tab stays inside the dialog", async () => {
    const page = await newPage(); await page.goto(BASE); await palette(page, "");
    const seen = [];
    for (let i = 0; i < 4; i++) { await page.keyboard.press("Tab"); seen.push(await page.evaluate(() => document.activeElement.id)); }
    assert(seen.join(",") === "paletteClose,paletteInput,paletteClose,paletteInput", seen.join(","));
    await page.keyboard.press("Shift+Tab");
    assert(await page.evaluate(() => !!document.activeElement.closest("#palette")), "escaped on Shift+Tab");
    await page.context().close();
  });
  await test("palette: / typed inside a text field does not open it", async () => {
    const page = await newPage(); await page.goto(BASE); await palette(page, "a/b");
    assert(await page.inputValue("#paletteInput") === "a/b", "slash swallowed in the search box");
    await page.keyboard.press("Escape");
    await page.evaluate(() => { const i = document.createElement("input"); i.id = "probe"; document.body.appendChild(i); });
    await page.focus("#probe"); await page.keyboard.press("/");
    assert(!(await page.$(".cmdk.is-open")), "opened while typing");
    await page.context().close();
  });
  await test("palette: secrets view lists all five with hints and Esc goes back", async () => {
    const page = await newPage(); await page.goto(BASE);
    await page.click("#secretsBtn");
    const rows = await page.$$eval('[role="option"] .cmdk__detail', o => o.map(x => x.textContent));
    assert(rows.length === 6, "rows " + rows.length);
    assert(/Found 0 of 5/.test(await page.textContent("#paletteList")), "count missing");
    await page.keyboard.press("Escape");
    assert(await page.$(".cmdk.is-open") && (await palette(page, "")).includes("Say hi"), "Esc did not go back to the main list");
    await page.keyboard.press("Escape");
    assert(!(await page.$(".cmdk.is-open")), "second Esc did not close");
    await page.context().close();
  });
  await test("palette: without JavaScript the pill is not shown", async () => {
    const page = await newPage({ javaScriptEnabled: false }); await page.goto(BASE);
    assert(!(await page.isVisible("#palette")) && !(await page.isVisible("#paletteOverlay")), "dead pill on the page");
    await page.context().close();
  });
  await test("palette: the pill types suggestions, but sits still with reduced motion", async () => {
    const page = await newPage(); await page.goto(BASE);
    const a = await page.textContent("#paletteTyped"); await page.waitForTimeout(3000);
    const b = await page.textContent("#paletteTyped");
    assert(a !== b, "pill text never changes");
    const calm = await newPage({ reducedMotion: "reduce" }); await calm.goto(BASE);
    const c = await calm.textContent("#paletteTyped"); await calm.waitForTimeout(3000);
    assert(c === "Explore my projects" && await calm.textContent("#paletteTyped") === c, "moved with reduced motion");
    const t = await calm.$eval(".cmdk", e => getComputedStyle(e).transitionDuration);
    assert(/^0s(, 0s)*$/.test(t), "transitions on: " + t);
    await page.context().close(); await calm.context().close();
  });

  // ---------- Styles ----------
  await test("style button cycles poster > rock > plain and remembers", async () => {
    const page = await newPage(); await page.goto(BASE); await page.evaluate(() => localStorage.clear()); await page.reload();
    const seq = [];
    for (let i = 0; i < 3; i++) { seq.push(await page.textContent("#modeToggle")); await page.click("#modeToggle"); await page.waitForTimeout(150); }
    assert(seq.join("|") === "Style: Poster|Style: Rockstar|Style: Plain", seq.join("|"));
    await page.click('#styleChoices [data-style="rock"]'); await page.waitForTimeout(150); await page.reload();
    assert(await page.evaluate(() => document.body.classList.contains("rock")), "not remembered");
    assert(await page.textContent(".section__title") !== "Commit activity", "rock text swap missing");
    await page.context().close();
  });

  // ---------- Secrets ----------
  await test("all five secrets unlock and persist", async () => {
    const page = await newPage(); await page.goto(BASE); await page.evaluate(() => localStorage.clear()); await page.reload();
    await palette(page, "projects"); await page.keyboard.press("Enter"); await page.waitForTimeout(100);
    await palette(page, "sudo"); await page.keyboard.press("Enter");
    assert(/Permission denied/.test(await page.textContent("#paletteList")), "sudo item missing");
    await page.keyboard.press("Escape");
    await page.click("#loreDetails summary");
    for (let i = 0; i < 5; i++) await page.click("#name");
    await page.focus("body");
    for (const k of ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"]) await page.keyboard.press(k);
    assert(await page.textContent("#secretCount") === "5", "count " + await page.textContent("#secretCount"));
    await page.reload();
    assert(await page.textContent("#secretCount") === "5", "not persisted");
    await page.context().close();
  });

  // ---------- Keyboard and accessibility ----------
  await test("skip link is first in tab order and lands on projects", async () => {
    const page = await newPage(); await page.goto(BASE);
    await page.keyboard.press("Tab");
    const t = await page.evaluate(() => document.activeElement.className);
    assert(t === "skip-link", "first tab: " + t);
    await page.keyboard.press("Enter");
    assert(/#projects/.test(page.url()), page.url());
    await page.context().close();
  });
  for (const style of ["poster", "rock", "plain"]) {
    for (const vp of [{ width: 1366, height: 900 }, { width: 390, height: 844 }]) {
      await test(`axe accessibility scan: ${style} ${vp.width}px`, async () => {
        const page = await newPage({ viewport: vp }); await page.goto(BASE); await setStyle(page, style);
        await page.waitForTimeout(1300); // let entrance animations settle so contrast is measured on the final colours
        await page.addScriptTag({ content: AXE });
        const r = await page.evaluate(async () => {
          const res = await axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] });
          return res.violations.map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length, help: v.help, t: v.nodes.slice(0, 4).map(n => n.target.join(" ") + " :: " + (n.failureSummary || "").split("\n").slice(1, 2).join("")) }));
        });
        fs.writeFileSync(path.join(OUT, `axe-${style}-${vp.width}.json`), JSON.stringify(r, null, 1));
        const serious = r.filter(v => v.impact === "serious" || v.impact === "critical");
        r.filter(v => !(v.impact === "serious" || v.impact === "critical")).forEach(v => note("a11y " + style + " " + vp.width, `${v.id} (${v.impact}, ${v.n}): ${v.help}`));
        assert(!serious.length, serious.map(v => `${v.id}(${v.n}): ${v.t.join(" ; ")}`).join(" || "));
        await page.context().close();
      });
    }
  }
  for (const style of ["poster", "rock", "plain"]) {
    await test(`axe accessibility scan with the palette open: ${style}`, async () => {
      const page = await newPage(); await page.goto(BASE); await setStyle(page, style);
      await palette(page, ""); await page.waitForTimeout(700);
      await page.addScriptTag({ content: AXE });
      const r = await page.evaluate(async () => {
        const res = await axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] });
        return res.violations.map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length, help: v.help, t: v.nodes.slice(0, 4).map(n => n.target.join(" ") + " :: " + (n.failureSummary || "").split("\n").slice(1, 2).join("")) }));
      });
      const serious = r.filter(v => v.impact === "serious" || v.impact === "critical");
      r.filter(v => !serious.includes(v)).forEach(v => note("a11y palette " + style, `${v.id} (${v.impact}, ${v.n}): ${v.help}`));
      assert(!serious.length, serious.map(v => `${v.id}(${v.n}): ${v.t.join(" ; ")}`).join(" || "));
      await page.context().close();
    });
  }
  await test("animations: cards reveal on scroll and the contact line reads as words", async () => {
    const page = await newPage(); await page.goto(BASE); await page.waitForTimeout(200);
    assert(await page.$("html.motion"), "motion class missing");
    const before = await page.$eval(".contact", e => getComputedStyle(e).opacity);
    await page.evaluate(() => document.getElementById("contact").scrollIntoView({ behavior: "instant" })); await page.waitForTimeout(1500);
    const after = await page.$eval(".contact", e => getComputedStyle(e).opacity);
    assert(before === "0" && after === "1", before + " -> " + after);
    const h = await page.evaluate(() => {
      const el = document.querySelector(".contact__big");
      return { sr: el.querySelector(".sr-only").textContent, letters: el.querySelectorAll(".l").length, hidden: el.querySelector("[aria-hidden]") !== null };
    });
    assert(h.sr === "Let's talk." && h.letters === 10 && h.hidden, JSON.stringify(h));
    await setStyle(page, "rock");
    assert(await page.$eval(".contact__big .sr-only", e => e.textContent) === "Book me.", "rock swap lost the letters");
    const role = await page.$eval(".role", e => e.textContent.replace(/\s+/g, " ").trim());
    assert(role === "Backend and ML developer. I build APIs that turn messy documents into data you can check.", role);
    await page.context().close();
  });
  await test("style switch from the button changes the theme colour too", async () => {
    const page = await newPage(); await page.goto(BASE); await page.evaluate(() => localStorage.clear()); await page.reload();
    await page.click("#modeToggle"); await page.waitForTimeout(900);
    const c = await page.$eval('meta[name="theme-color"]', m => m.content);
    assert(c === "#0d0b0b" && await page.evaluate(() => document.body.classList.contains("rock")), c);
    assert(!page.errors.length, page.errors.join("|"));
    await page.context().close();
  });
  await test("touch targets are at least 24px (WCAG 2.2 AA) on a phone", async () => {
    const page = await newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }); await page.goto(BASE);
    const small = await page.$$eval("a, button, summary, input", els => els.filter(e => {
      const r = e.getBoundingClientRect(); if (!r.width || !r.height) return false;
      if (e.closest("p, li, dd") && e.tagName === "A" && !e.className) return false; // inline text links are exempt
      return r.height < 24 || r.width < 24;
    }).map(e => (e.id || e.className || e.tagName) + " " + Math.round(e.getBoundingClientRect().width) + "x" + Math.round(e.getBoundingClientRect().height)));
    assert(!small.length, small.join(", "));
    await page.context().close();
  });
  await test("reduced motion: ticker, slam and entrance animations stop", async () => {
    const page = await newPage({ reducedMotion: "reduce" }); await page.goto(BASE); await setStyle(page, "rock");
    const a = await page.$eval(".ticker__track", e => getComputedStyle(e).animationName);
    const b = await page.$eval(".name", e => getComputedStyle(e).animationName);
    assert(a === "none" && b === "none", a + " " + b);
    const hidden = await page.$$eval(".project, .contact, .skill-group", els => els.filter(e => getComputedStyle(e).opacity !== "1").length);
    assert(!hidden && !(await page.$("html.motion")) && !(await page.$(".role .w")), "content waits for an animation");
    await page.context().close();
  });
  await test("without JavaScript every section's content is still readable", async () => {
    const page = await newPage({ javaScriptEnabled: false }); await page.goto(BASE);
    const txt = await page.textContent("main");
    for (const w of ["lab-report-explainer", "RescueSync", "urlshort", "FastAPI", "Let's talk"]) assert(txt.includes(w), "missing " + w);
    const loading = await page.textContent("#activitySummary");
    if (/Loading/.test(loading)) note("no-js", "Without JavaScript the chart says 'Loading contributions...' forever.");
    await page.context().close();
  });

  await test("outside links open in a new tab, in-page links do not", async () => {
    const page = await newPage(); await page.goto(BASE);
    const bad = await page.$$eval("a[href]", as => as.filter(a => {
      const outside = /^https?:/.test(a.getAttribute("href"));
      const newTab = a.target === "_blank" && /noopener/.test(a.rel) && a.getAttribute("aria-describedby") === "newTab";
      return outside ? !newTab : a.target === "_blank";
    }).map(a => a.getAttribute("href")));
    assert(!bad.length, bad.join(", "));
    assert(await page.$("#newTab"), "missing the new-tab description");
    await page.context().close();
  });
  await test("copy email button copies the address", async () => {
    const page = await newPage(); await page.context().grantPermissions(["clipboard-read", "clipboard-write"]); await page.goto(BASE);
    assert(await page.isVisible("#copyEmail"), "copy hidden");
    await page.click("#copyEmail");
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    const email = await page.textContent(".contact__email a");
    assert(clip === email.trim(), clip);
    assert(await page.textContent("#copyEmail") === "Copied", "no feedback");
    await page.context().close();
  });
  await test("nav marks the section being read", async () => {
    const page = await newPage(); await page.goto(BASE);
    await page.evaluate(() => window.scrollTo({ top: document.querySelector("#skills").getBoundingClientRect().top + scrollY - 20, behavior: "instant" })); await page.waitForTimeout(300);
    const cur = await page.$$eval('.nav a[aria-current="true"]', a => a.map(x => x.hash));
    assert(cur.length === 1 && cur[0] === "#skills", JSON.stringify(cur));
    await page.context().close();
  });
  await test("Konami code in Plain unlocks and explains the Poster colours", async () => {
    const page = await newPage(); await page.goto(BASE); await page.evaluate(() => localStorage.clear()); await setStyle(page, "plain");
    await page.focus("body");
    for (const k of ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"]) await page.keyboard.press(k);
    const t = await page.$$eval(".toast", t => t.map(x => x.textContent).join(" | "));
    assert(/Poster/.test(t) && await page.textContent("#secretCount") === "1", t);
    await page.context().close();
  });
  await test("sticky sidebar fits on common laptop screens", async () => {
    const bad = [];
    for (const [w, h] of [[1280, 620], [1366, 657], [1440, 760], [1536, 730], [1920, 950]]) {
      for (const st of ["poster", "rock", "plain"]) {
        const page = await newPage({ viewport: { width: w, height: h }, realFonts: true }); await page.goto(BASE); await setStyle(page, st); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(700);
        const r = await page.$eval(".side__inner", e => ({ h: e.getBoundingClientRect().height, pos: getComputedStyle(e).position }));
        if (r.pos === "sticky" && r.h + 32 > h) bad.push(`${w}x${h} ${st}: ${Math.round(r.h)}px`);
        await page.context().close();
      }
    }
    assert(!bad.length, bad.join(", "));
  });

  // ---------- Content and meta checks (findings, not failures) ----------
  await test("content and metadata review", async () => {
    const page = await newPage(); await page.goto(BASE);
    const m = await page.evaluate(() => ({
      title: document.title,
      og: !!document.querySelector('meta[property="og:title"]'),
      ogImage: !!document.querySelector('meta[property="og:image"]'),
      icon: !!document.querySelector('link[rel~="icon"]'),
      canonical: !!document.querySelector('link[rel="canonical"]'),
      theme: !!document.querySelector('meta[name="theme-color"]'),
      placeholders: (document.body.innerText.match(/YOUR NAME|YOUR\s+NAME|you@example\.com/g) || []).length,
      linkedinPlaceholder: !!document.querySelector('a[href="https://www.linkedin.com/"]'),
      blankTargets: [...document.querySelectorAll('a[target="_blank"]')].length,
      h1: document.querySelectorAll("h1").length,
      headings: [...document.querySelectorAll("h1,h2,h3")].map(h => h.tagName + ":" + h.textContent.trim().slice(0, 30)),
    }));
    fs.writeFileSync(path.join(OUT, "meta.json"), JSON.stringify(m, null, 1));
    if (/YOUR NAME/.test(m.title)) note("content", "Title tag still says YOUR NAME; this is what Google and browser tabs show.");
    if (m.placeholders) note("content", m.placeholders + " placeholder strings (YOUR NAME / you@example.com) visible on the live page.");
    if (m.linkedinPlaceholder) note("content", "LinkedIn button points at linkedin.com home page, not a profile.");
    if (!m.og) note("meta", "No Open Graph tags: a link shared on LinkedIn/WhatsApp/Slack shows no title card or image.");
    if (!m.icon) note("meta", "No favicon: browsers request /favicon.ico and get a 404; the tab shows a blank page icon.");
    if (!m.canonical) note("meta", "No canonical URL.");
    await page.context().close();
  });

  await browser.close();
  server.close();

  // ---------- Report ----------
  const pass = results.filter(r => r.ok).length;
  console.log(`\n${pass}/${results.length} checks passed\n`);
  results.forEach(r => console.log((r.ok ? "PASS " : "FAIL ") + r.name + (r.ok ? "" : "\n     " + r.err)));
  console.log("\nFindings:");
  const seen = new Set();
  issues.forEach(i => { const k = i.area.split(" ")[0] + i.msg; if (seen.has(k)) return; seen.add(k); console.log("- [" + i.area + "] " + i.msg); });
  fs.writeFileSync(path.join(OUT, "last-run.json"), JSON.stringify({ results, issues }, null, 1));
  process.exitCode = pass === results.length ? 0 : 1;
})();
