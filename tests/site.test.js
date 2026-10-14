// End-to-end checks for the portfolio: terminal, styles, secrets, chart, layout and accessibility.
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
  async function termRun(page, cmd) {
    await page.fill("#termInput", cmd); await page.press("#termInput", "Enter");
    return page.$eval("#termOut", el => el.innerText);
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

  // ---------- Terminal ----------
  await test("terminal commands answer correctly", async () => {
    const page = await newPage(); await page.goto(BASE);
    const checks = [
      ["help", /contributions/], ["whoami", /Backend and ML/], ["ls", /lab-report-explainer\s+RescueSync\s+urlshort/],
      ["cat lab-report-explainer", /tests: 52 passing/], ["cat LAB-REPORT-EXPLAINER", /tests: 52 passing/],
      ["open urlshort", /github\.com\/KrBeTect2025\/urlshort/], ["curl /api/projects", /"name": "RescueSync"/],
      ["skills", /Backend: FastAPI/], ["contact", /email:/], ["contributions", /longest streak/],
      ["secrets", /Found \d of 5/], ["nope", /command not found/], ["cat nothing", /no such project/],
      ["style rockstar", /Rockstar/], ["style plain", /Plain/]
    ];
    const fails = [];
    for (const [c, re] of checks) {
      await page.$eval("#termOut", e => e.textContent = "");
      const out = await termRun(page, c);
      if (!re.test(out)) fails.push(`${c} -> ${out.slice(0, 120).replace(/\n/g, " / ")}`);
    }
    await termRun(page, "clear");
    assert((await page.$eval("#termOut", e => e.textContent)) === "", "clear left text");
    assert(!page.errors.length, page.errors.join("|"));
    assert(!fails.length, fails.join(" || "));
    await page.context().close();
  });
  await test("terminal: tab completion and history", async () => {
    const page = await newPage(); await page.goto(BASE);
    await page.fill("#termInput", "wh"); await page.press("#termInput", "Tab");
    assert(await page.inputValue("#termInput") === "whoami ", "tab cmd: " + await page.inputValue("#termInput"));
    await page.fill("#termInput", "cat lab"); await page.press("#termInput", "Tab");
    assert(await page.inputValue("#termInput") === "cat lab-report-explainer", "tab project: " + await page.inputValue("#termInput"));
    await page.press("#termInput", "Enter");
    await termRun(page, "ls");
    await page.press("#termInput", "ArrowUp"); await page.press("#termInput", "ArrowUp");
    assert(await page.inputValue("#termInput") === "cat lab-report-explainer", "history");
    await page.context().close();
  });
  await test("terminal: chips run commands and backtick focuses input", async () => {
    const page = await newPage(); await page.goto(BASE);
    await page.click('#termChips button[data-cmd="ls"]');
    assert(/\$ ls/.test(await page.textContent("#termOut")), "chip");
    await page.focus("body"); await page.keyboard.press("`");
    assert(await page.evaluate(() => document.activeElement.id) === "termInput", "backtick");
    await page.context().close();
  });
  await test("terminal: open links and whitespace handling", async () => {
    const page = await newPage(); await page.goto(BASE);
    const out = await termRun(page, "   cat    urlshort   ");
    assert(/Small learning project/.test(out), "extra spaces broke cat: " + out.slice(-200));
    await page.context().close();
  });

  // ---------- Styles ----------
  await test("style button cycles poster > rock > plain and remembers", async () => {
    const page = await newPage(); await page.goto(BASE); await page.evaluate(() => localStorage.clear()); await page.reload();
    const seq = [];
    for (let i = 0; i < 3; i++) { seq.push(await page.textContent("#modeToggle")); await page.click("#modeToggle"); }
    assert(seq.join("|") === "Style: Poster|Style: Rockstar|Style: Plain", seq.join("|"));
    await page.click('#styleChoices [data-style="rock"]'); await page.reload();
    assert(await page.evaluate(() => document.body.classList.contains("rock")), "not remembered");
    assert(await page.textContent(".section__title") !== "Commit activity", "rock text swap missing");
    await page.context().close();
  });

  // ---------- Secrets ----------
  await test("all five secrets unlock and persist", async () => {
    const page = await newPage(); await page.goto(BASE); await page.evaluate(() => localStorage.clear()); await page.reload();
    await termRun(page, "ls");
    await termRun(page, "sudo");
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
        await page.waitForTimeout(700);
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
  await test("reduced motion: ticker and slam stop", async () => {
    const page = await newPage({ reducedMotion: "reduce" }); await page.goto(BASE); await setStyle(page, "rock");
    const a = await page.$eval(".ticker__track", e => getComputedStyle(e).animationName);
    const b = await page.$eval(".name", e => getComputedStyle(e).animationName);
    assert(a === "none" && b === "none", a + " " + b);
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

  await test("terminal: Run button submits the command", async () => {
    const page = await newPage({ viewport: { width: 390, height: 844 } }); await page.goto(BASE);
    await page.fill("#termInput", "whoami"); await page.click(".term__run");
    assert(/\$ whoami/.test(await page.textContent("#termOut")), "run button");
    assert(await page.inputValue("#termInput") === "", "input not cleared");
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
