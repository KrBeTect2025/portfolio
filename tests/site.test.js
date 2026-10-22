// End-to-end checks for the portfolio: page structure, the contribution map, the effects, motion
// settings, layout at many widths, accessibility, and the deploy workflow's file list.
// Setup once:  cd tests && npm install && npx playwright install chromium
// Run:         npm test            (from the tests folder)
// It serves the site itself and uses tests/sample-contributions.json as the contribution data.
// To use a Chromium you already have, set CHROME_PATH to its executable.
const { chromium } = require("playwright");
const fs = require("fs");
const http = require("http");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const SAMPLE = path.join(__dirname, "sample-contributions.json");
const OUT = path.join(__dirname, "output");
const AXE = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const DATA = JSON.parse(fs.readFileSync(SAMPLE, "utf8"));
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
  catch (e) { results.push({ name, ok: false, err: String(e && e.message || e).slice(0, 600) }); }
}
function assert(c, m) { if (!c) throw new Error(m); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

// The same sums the page should show, worked out here independently from the data file.
const DAYS = DATA.weeks.flat().sort((a, b) => a.date < b.date ? -1 : 1);
const RECENT = DAYS.slice(-30).reduce((s, d) => s + d.count, 0);
function expectedStreak(days) {
  let longest = 0, run = 0;
  for (const d of days) { run = d.count > 0 ? run + 1 : 0; longest = Math.max(longest, run); }
  let i = days.length - 1, current = 0;
  if (days[i].count === 0) i--;
  while (i >= 0 && days[i].count > 0) { current++; i--; }
  return { longest, current };
}
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function tipText(day) {
  const d = new Date(day.date + "T00:00:00Z");
  return (day.count === 0 ? "No" : day.count) + " contribution" + (day.count === 1 ? "" : "s") + " · " + WD[d.getUTCDay()] + " " + d.getUTCDate() + " " + MON[d.getUTCMonth()];
}

(async () => {
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const BASE = `http://127.0.0.1:${server.address().port}/`;
  const launchOpts = process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {};
  const browser = await chromium.launch(launchOpts);
  // Block Google Fonts so runs are repeatable offline; system fallbacks render instead.
  async function newPage(opts = {}) {
    const { realFonts, ...rest } = opts;
    const ctx = await browser.newContext(Object.assign({ viewport: { width: 1440, height: 900 } }, rest));
    if (!realFonts) await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    const page = await ctx.newPage();
    page.errors = [];
    page.bad = [];
    page.on("pageerror", e => page.errors.push(e.message));
    page.on("console", m => { if (m.type() === "error" && !/fonts|ERR_FAILED|status of 404/.test(m.text())) page.errors.push(m.text()); });
    page.on("response", r => { if (r.status() >= 400 && !/fonts\./.test(r.url())) page.bad.push(r.status() + " " + r.url()); });
    return page;
  }
  const mapReady = page => page.waitForSelector("#ghMap:not([hidden])", { timeout: 5000 });
  // Scrolls the whole page in steps so every lazy scene starts, then returns to the top.
  async function scrollThrough(page) {
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y <= h; y += 400) { await page.evaluate(y => window.scrollTo({ top: y, behavior: "instant" }), y); await sleep(60); }
    await page.waitForFunction(() => document.querySelectorAll("ascii-art canvas").length === 2, null, { timeout: 8000 });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  }
  // Serves index.html with one string swapped, to try other content without editing the file.
  async function withHtml(page, from, to) {
    const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
    assert(html.includes(from), "index.html no longer contains: " + from);
    await page.route(BASE, r => r.fulfill({ status: 200, contentType: "text/html", body: html.split(from).join(to) }));
  }

  // ---------- Load, head, files ----------
  await test("loads with no script errors and no missing files; both scenes draw", async () => {
    const page = await newPage(); await page.goto(BASE); await mapReady(page);
    await scrollThrough(page);
    const labels = await page.$$eval("ascii-art canvas", cs => cs.map(c => c.getAttribute("role") + ":" + c.getAttribute("aria-label")));
    assert(labels.length === 2 && labels.every(l => /^img:Animated ASCII art/.test(l)), labels.join(" | "));
    assert(!page.errors.length, page.errors.join(" | "));
    assert(!page.bad.length, page.bad.join(" | "));
    await page.context().close();
  });

  await test("head: title, description, canonical, preview tags, favicon, theme colour", async () => {
    const page = await newPage(); await page.goto(BASE);
    const m = await page.evaluate(() => {
      const meta = sel => (document.querySelector(sel) || {}).content;
      return {
        title: document.title, desc: meta('meta[name="description"]'), theme: meta('meta[name="theme-color"]'),
        canonical: (document.querySelector('link[rel="canonical"]') || {}).href,
        ogTitle: meta('meta[property="og:title"]'), ogImage: meta('meta[property="og:image"]'),
        ogW: meta('meta[property="og:image:width"]'), ogH: meta('meta[property="og:image:height"]'),
        ogAlt: meta('meta[property="og:image:alt"]'), card: meta('meta[name="twitter:card"]'),
        icon: (document.querySelector('link[rel~="icon"]') || {}).href || "", lang: document.documentElement.lang,
      };
    });
    assert(m.title === "Krish Rathore | Backend and ML developer", "title: " + m.title);
    assert(m.desc && m.desc.length > 50, "description");
    assert(m.theme === "#0E0E0F", "theme-color: " + m.theme);
    assert(m.canonical === "https://krbetect2025.github.io/portfolio/", "canonical: " + m.canonical);
    assert(m.ogTitle && m.ogImage === "https://krbetect2025.github.io/portfolio/og.png" && m.ogW === "1200" && m.ogH === "630" && m.ogAlt, "og tags");
    assert(m.card === "summary_large_image", "twitter card");
    assert(m.icon.startsWith("data:image/svg+xml"), "favicon");
    assert(m.lang === "en", "lang");
    await page.context().close();
  });

  await test("og.png is a 1200x630 PNG", async () => {
    const b = fs.readFileSync(path.join(ROOT, "og.png"));
    assert(b.slice(1, 4).toString() === "PNG", "not a PNG");
    const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
    assert(w === 1200 && h === 630, `size ${w}x${h}`);
  });

  await test("forced dark mode (Chrome, Edge) and Dark Reader leave the colours alone", async () => {
    const page = await newPage(); await page.goto(BASE);
    const m = await page.evaluate(() => ({
      scheme: (document.querySelector('meta[name="color-scheme"]') || {}).content || "",
      lock: !!document.querySelector('meta[name="darkreader-lock"]'),
    }));
    assert(/\bdark\b/.test(m.scheme), "color-scheme meta must declare dark: " + m.scheme);
    assert(m.lock, "darkreader-lock meta missing");
    await page.context().close();
    // Then check for real: Chromium with forced dark switched on.
    const forced = await chromium.launch(Object.assign({}, launchOpts, { args: ["--enable-features=WebContentsForceDark"] }));
    const ctx = await forced.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    const p = await ctx.newPage();
    async function pixel(selector, x, y) {
      const shot = await p.locator(selector).screenshot();
      return p.evaluate(async ([b64, x, y]) => {
        const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode();
        const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
        const g = c.getContext("2d"); g.drawImage(img, 0, 0);
        return [...g.getImageData(x, y < 0 ? img.height + y : y, 1, 1).data].slice(0, 3);
      }, [shot.toString("base64"), x, y]);
    }
    // Control: a plain white page must turn dark, or this browser is not forcing dark at all.
    await p.setContent('<body style="margin:0;background:#fff"><div id="c" style="width:40px;height:40px"></div></body>');
    const control = await pixel("#c", 20, 20);
    if (control[0] > 128) note("forced dark", "This Chromium did not force dark on a white control page, so the real-page check proves nothing here.");
    await p.goto(BASE);
    const btn = await pixel(".sg-btn", 6, 28);   // the orange pill's left edge, inside the button
    assert(Math.abs(btn[0] - 243) < 12 && Math.abs(btn[1] - 128) < 12 && Math.abs(btn[2] - 32) < 12, "Email button recoloured under forced dark: rgb(" + btn + ")");
    await forced.close();
  });

  // ---------- Structure and navigation ----------
  await test("sections are numbered 01 to 05 in page order", async () => {
    const page = await newPage(); await page.goto(BASE);
    const r = await page.$$eval(".sg-num", els => els.map(e => e.textContent + ":" + e.closest("section, footer").id));
    assert(r.join(",") === "01:work,02:skills,03:github,04:approach,05:contact", r.join(","));
    await page.context().close();
  });

  await test("one h1 with the real name, and no skipped heading levels", async () => {
    const page = await newPage(); await page.goto(BASE);
    const r = await page.evaluate(() => ({
      h1: [...document.querySelectorAll("h1")].map(h => h.querySelector(".sg-sr").textContent),
      levels: [...document.querySelectorAll("h1,h2,h3,h4")].map(h => +h.tagName[1]),
      main: document.querySelectorAll("main").length,
    }));
    assert(r.h1.length === 1 && r.h1[0] === "Krish Rathore", "h1: " + r.h1);
    assert(r.main === 1, "one <main>");
    for (let i = 1; i < r.levels.length; i++) assert(r.levels[i] <= r.levels[i - 1] + 1, "heading jumps from h" + r.levels[i - 1] + " to h" + r.levels[i]);
    await page.context().close();
  });

  await test("skip link is the first Tab stop, shows, and jumps to the work", async () => {
    const page = await newPage(); await page.goto(BASE);
    await page.keyboard.press("Tab");
    const f = await page.evaluate(() => ({ cls: document.activeElement.className, top: document.activeElement.getBoundingClientRect().top }));
    assert(f.cls === "sg-skip" && f.top >= 0, JSON.stringify(f));
    await page.keyboard.press("Enter");
    assert(/#work$/.test(page.url()), page.url());
    await page.context().close();
  });

  await test("every #link has a target, and new-tab links are safe and announced", async () => {
    const page = await newPage(); await page.goto(BASE);
    const r = await page.evaluate(() => ({
      missing: [...document.querySelectorAll('a[href^="#"]')].map(a => a.getAttribute("href").slice(1)).filter(id => !document.getElementById(id)),
      unsafe: [...document.querySelectorAll('a[target="_blank"]')].filter(a => !/noopener/.test(a.rel) || a.getAttribute("aria-describedby") !== "newTab").map(a => a.href),
      nav: [...document.querySelectorAll(".sg-dock a")].map(a => a.getAttribute("href")),
    }));
    assert(!r.missing.length, "missing targets: " + r.missing);
    assert(!r.unsafe.length, "unsafe new-tab links: " + r.unsafe);
    assert(r.nav.join(" ") === "#work #skills #github #approach #contact", r.nav.join(" "));
    await page.context().close();
  });

  await test("without JavaScript every word, link and section still shows", async () => {
    const page = await newPage({ javaScriptEnabled: false }); await page.goto(BASE);
    const r = await page.evaluate(() => ({
      name: getComputedStyle(document.getElementById("nameText")).visibility + ":" + document.getElementById("nameText").textContent,
      say: document.getElementById("sayText").textContent,
      note: document.getElementById("ghNote").textContent,
      hidden: ["copyEmail", "motionToggle", "ghMap", "ghStats"].filter(id => document.getElementById(id).getBoundingClientRect().height === 0).length,
      email: document.getElementById("emailLink").getBoundingClientRect().height > 0,
    }));
    assert(r.name === "visible:Krish Rathore" && r.say === "Say hi." && /on GitHub/.test(r.note) && r.hidden === 4 && r.email, JSON.stringify(r));
    await page.context().close();
  });

  await test("if script.js fails to load, the name still appears", async () => {
    const page = await newPage();
    await page.route(/script\.js$/, r => r.fulfill({ status: 404, body: "" }));
    await page.goto(BASE);
    await sleep(1800);
    const v = await page.$eval("#nameText", e => getComputedStyle(e).visibility + ":" + e.textContent);
    assert(v === "visible:Krish Rathore", v);
    await page.context().close();
  });

  // ---------- Contribution map ----------
  await test("map: one dot per day, coloured by each day's level, on the right weekday", async () => {
    const page = await newPage(); await page.goto(BASE); await mapReady(page);
    const dots = await page.$$eval("#ghCal .sg-d", els => els.map(e => ({ cls: e.className, row: getComputedStyle(e).gridRowStart, col: +getComputedStyle(e).gridColumnStart })));
    assert(dots.length === DAYS.length, `${dots.length} dots for ${DAYS.length} days`);
    DAYS.forEach((d, i) => {
      assert(dots[i].cls === "sg-d l" + d.level, `day ${d.date}: ${dots[i].cls}, expected level ${d.level}`);
      assert(+dots[i].row === new Date(d.date + "T00:00:00Z").getUTCDay() + 1, `day ${d.date} in row ${dots[i].row}`);
    });
    assert(dots[0].col === 1 && dots[dots.length - 1].col === DATA.weeks.length, "columns " + dots[0].col + ".." + dots[dots.length - 1].col);
    const months = await page.$$eval("#ghMonths span", els => els.map(e => e.textContent));
    assert(months.length >= 10 && months.every(m => /^[A-Z][a-z]{2}$/.test(m)), "month labels: " + months);
    await page.context().close();
  });

  await test("map: the three numbers, the note and the skills line come from the data", async () => {
    const page = await newPage(); await page.goto(BASE); await mapReady(page);
    const s = expectedStreak(DAYS);
    const r = await page.evaluate(() => ({
      total: document.getElementById("ghTotal").textContent, recent: document.getElementById("ghRecent").textContent,
      streak: document.getElementById("ghStreak").textContent, label: document.getElementById("ghStreakLabel").textContent,
      note: document.getElementById("ghNote").textContent, skill: document.getElementById("skillGit").closest(".sg-used").textContent,
    }));
    assert(r.total === DATA.total.toLocaleString("en"), "total " + r.total);
    assert(r.recent === RECENT.toLocaleString("en"), `last 30 days ${r.recent}, expected ${RECENT}`);
    const want = s.current > 0 ? s.current : s.longest;
    assert(r.streak === String(want), `streak ${r.streak}, expected ${want} (${JSON.stringify(s)}) label "${r.label}"`);
    assert(s.current > 0 && s.current === s.longest ? /longest so far/.test(r.label) : true, r.label);
    const u = new Date(DATA.updated + "T00:00:00Z");
    assert(r.note.includes(`updated ${u.getUTCDate()} ${MON[u.getUTCMonth()]} ${u.getUTCFullYear()}`), r.note);
    assert(r.skill === `every project, ${DATA.total.toLocaleString("en")} contributions in the last year`, r.skill);
    await page.context().close();
  });

  await test("map: streak wording for a streak that is not the longest, and for none", async () => {
    // 3-day run long ago, then a 2-day run ending yesterday, then today with nothing yet.
    const days = [];
    const start = Date.UTC(2026, 0, 4); // a Sunday
    const counts = [0, 1, 2, 3, 0, 0, 0, 0, 4, 5, 0];
    counts.forEach((c, i) => days.push({ date: new Date(start + i * 864e5).toISOString().slice(0, 10), count: c, level: c ? 1 : 0 }));
    const weeks = [days.slice(0, 7), days.slice(7)];
    const page = await newPage();
    await page.route("**/data/contributions.json", r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ login: "x", total: 15, updated: "2026-01-14", weeks }) }));
    await page.goto(BASE); await mapReady(page);
    let r = await page.evaluate(() => [document.getElementById("ghStreak").textContent, document.getElementById("ghStreakLabel").textContent]);
    assert(r[0] === "2" && r[1] === "day streak now; my longest is 3 days", r.join(" / "));
    const none = counts.map((c, i) => i > 6 ? 0 : c);
    days.forEach((d, i) => { d.count = none[i]; });
    await page.unroute("**/data/contributions.json");
    await page.route("**/data/contributions.json", r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ login: "x", total: 6, updated: "2026-01-14", weeks }) }));
    await page.reload(); await mapReady(page);
    r = await page.evaluate(() => [document.getElementById("ghStreak").textContent, document.getElementById("ghStreakLabel").textContent]);
    assert(r[0] === "3" && r[1] === "days in a row, my longest streak", r.join(" / "));
    await page.context().close();
  });

  await test("map: a first week that starts mid-week still lands on the right weekdays", async () => {
    const days = [];
    const start = Date.UTC(2026, 2, 4); // a Wednesday
    for (let i = 0; i < 12; i++) days.push({ date: new Date(start + i * 864e5).toISOString().slice(0, 10), count: i % 3, level: i % 3 });
    const weeks = [days.slice(0, 4), days.slice(4, 11), days.slice(11)];
    const page = await newPage();
    await page.route("**/data/contributions.json", r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ login: "x", total: 12, updated: "2026-03-15", weeks }) }));
    await page.goto(BASE); await mapReady(page);
    const pos = await page.$$eval("#ghCal .sg-d", els => els.map(e => getComputedStyle(e).gridRowStart + "/" + getComputedStyle(e).gridColumnStart));
    assert(pos[0] === "4/1" && pos[3] === "7/1" && pos[4] === "1/2" && pos[11] === "1/3", pos.join(" "));
    await page.context().close();
  });

  await test("map: tooltip waits 320 ms, then neighbouring days open at once", async () => {
    const page = await newPage(); await page.goto(BASE); await mapReady(page);
    const i = DAYS.length - 10;
    await page.locator("#ghMap").scrollIntoViewIfNeeded();
    const box = await page.locator(`#ghCal [data-i="${i}"]`).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await sleep(120);
    assert(!(await page.$("#ghTip.is-on")), "tooltip opened before the delay");
    await page.waitForSelector("#ghTip.is-on", { timeout: 1000 });
    assert(await page.textContent("#ghTip") === tipText(DAYS[i]), await page.textContent("#ghTip"));
    const next = await page.locator(`#ghCal [data-i="${i + 1}"]`).boundingBox();
    await page.mouse.move(next.x + next.width / 2, next.y + next.height / 2);
    await sleep(40);
    assert(await page.textContent("#ghTip") === tipText(DAYS[i + 1]), "warm tooltip did not follow at once: " + await page.textContent("#ghTip"));
    await page.mouse.move(5, 5);
    await sleep(50);
    assert(!(await page.$("#ghTip.is-on")), "tooltip stayed after the pointer left");
    await page.context().close();
  });

  await test("map: keyboard reads each day aloud (arrows, Home, End, Escape)", async () => {
    const page = await newPage(); await page.goto(BASE); await mapReady(page);
    await page.keyboard.press("Tab"); // keyboard mode, so focus shows the latest day
    await page.focus("#ghMap");
    const live = () => page.textContent("#ghLive");
    const last = DAYS[DAYS.length - 1];
    assert((await live()).startsWith((last.count === 0 ? "No" : last.count) + " contribution"), "focus: " + await live());
    assert(await page.$("#ghTip.is-on"), "tooltip not shown on keyboard focus");
    await page.keyboard.press("ArrowLeft");
    assert(await page.textContent("#ghTip") === tipText(DAYS[DAYS.length - 8]), "ArrowLeft: " + await page.textContent("#ghTip"));
    await page.keyboard.press("ArrowUp");
    assert(await page.textContent("#ghTip") === tipText(DAYS[DAYS.length - 9]), "ArrowUp");
    await page.keyboard.press("Home");
    assert(await page.textContent("#ghTip") === tipText(DAYS[0]), "Home");
    const d0 = new Date(DAYS[0].date + "T00:00:00Z");
    assert((await live()).endsWith(d0.getUTCFullYear().toString()) && /on [A-Z][a-z]+day \d+ [A-Z][a-z]+ \d{4}$/.test(await live()), "live text: " + await live());
    await page.keyboard.press("End");
    assert(await page.textContent("#ghTip") === tipText(last), "End");
    await page.keyboard.press("Escape");
    assert(!(await page.$("#ghTip.is-on")), "Escape did not close the tooltip");
    await page.context().close();
  });

  await test("map: the label stays inside the map at the first and last day", async () => {
    for (const vp of [{ width: 1440, height: 900 }, { width: 375, height: 812 }]) {
      const page = await newPage({ viewport: vp }); await page.goto(BASE); await mapReady(page);
      await page.keyboard.press("Tab"); await page.focus("#ghMap");
      for (const key of ["Home", "End"]) {
        await page.keyboard.press(key); await sleep(30);
        const r = await page.evaluate(() => {
          const t = document.getElementById("ghTip").getBoundingClientRect(), w = document.getElementById("ghWrap").getBoundingClientRect();
          return { tl: t.left, tr: t.right, wl: w.left, wr: w.right };
        });
        assert(r.tl >= r.wl - 1 && r.tr <= r.wr + 1, `${vp.width}px ${key}: ${JSON.stringify(r)}`);
      }
      await page.context().close();
    }
  });

  await test("map: on a phone it scrolls sideways inside its box and starts at the latest week", async () => {
    const page = await newPage({ viewport: { width: 375, height: 812 } }); await page.goto(BASE); await mapReady(page);
    const s = await page.$eval("#ghMap", e => ({ l: e.scrollLeft, max: e.scrollWidth - e.clientWidth, ov: getComputedStyle(e).overflowX }));
    assert(s.ov === "auto" && s.max > 0 && Math.abs(s.l - s.max) < 2, JSON.stringify(s));
    await page.context().close();
  });

  await test("map: the whole year fits without scrolling on laptops and tablets, days 12 to 16px apart", async () => {
    const bad = [];
    for (const w of [1920, 1440, 1366, 1280, 1180, 1101, 1100, 1024, 900, 768]) {
      const page = await newPage({ viewport: { width: w, height: 900 } }); await page.goto(BASE); await mapReady(page);
      const r = await page.$eval("#ghMap", e => ({ sw: e.scrollWidth, cw: e.clientWidth, cell: getComputedStyle(document.getElementById("ghWrap")).getPropertyValue("--cell").trim() }));
      if (r.sw > r.cw) bad.push(`${w}px: map ${r.sw} > box ${r.cw} (cell ${r.cell})`);
      if (!/^(1[2-6])px$/.test(r.cell)) bad.push(`${w}px: cell ${r.cell}`);
      await page.context().close();
    }
    assert(!bad.length, bad.join(", "));
  });

  await test("map: a missing or broken data file shows a note and the profile link, not a broken map", async () => {
    for (const [what, reply] of [["404", { status: 404, body: "" }], ["bad JSON", { status: 200, body: "{nope" }], ["wrong shape", { status: 200, body: '{"weeks":"x"}' }], ["no days", { status: 200, body: '{"weeks":[[]]}' }]]) {
      const page = await newPage();
      await page.route("**/data/contributions.json", r => r.fulfill(Object.assign({ contentType: "application/json" }, reply)));
      await page.goto(BASE);
      await page.waitForFunction(() => /could not load/.test(document.getElementById("ghNote").textContent), null, { timeout: 3000 });
      const r = await page.evaluate(() => ({
        map: document.getElementById("ghMap").hidden, stats: document.getElementById("ghStats").hidden,
        legend: document.getElementById("ghLegend").hidden, skill: document.getElementById("skillGit").textContent,
        link: !!document.querySelector('#github a[href="https://github.com/KrBeTect2025"]'),
      }));
      assert(r.map && r.stats && r.legend && r.skill === "" && r.link, what + ": " + JSON.stringify(r));
      assert(!page.errors.length, what + ": " + page.errors.join(" | "));
      await page.context().close();
    }
  });

  // ---------- Effects ----------
  await test("name scrambles into place on load; screen readers get the real name throughout", async () => {
    const page = await newPage(); await page.goto(BASE);
    const early = await page.evaluate(() => ({ text: document.getElementById("nameText").textContent, noisy: document.querySelectorAll("#nameText .sg-x").length }));
    assert(early.noisy > 0, "no scramble seen right after load: " + JSON.stringify(early));
    await page.waitForFunction(() => document.getElementById("nameText").textContent === "Krish Rathore" && !document.querySelector("#nameText .sg-x"), null, { timeout: 2500 });
    const a11y = await page.evaluate(() => [document.querySelector("h1 .sg-sr").textContent, document.getElementById("nameText").getAttribute("aria-hidden")]);
    assert(a11y[0] === "Krish Rathore" && a11y[1] === "true", a11y.join(","));
    await page.context().close();
  });

  await test("'Say hi.' waits as dots, resolves when in view, then Star Border runs once", async () => {
    const page = await newPage(); await page.goto(BASE);
    assert(await page.textContent("#sayText") === "•·● ●·•", "before view: " + await page.textContent("#sayText"));
    await page.evaluate(() => document.getElementById("say").scrollIntoView({ block: "center", behavior: "instant" }));
    await page.waitForFunction(() => document.getElementById("sayText").textContent === "Say hi." && !document.querySelector("#sayText .sg-x"), null, { timeout: 3000 });
    assert(await page.$("#star.sg-run"), "Star Border did not run after the line resolved");
    // Hover plays it again.
    await page.hover("#say"); await sleep(80);
    assert(await page.$("#sayText .sg-x"), "hover did not replay");
    await page.waitForFunction(() => document.getElementById("sayText").textContent === "Say hi.", null, { timeout: 3000 });
    await page.context().close();
  });

  await test("Spotlight Card follows the pointer", async () => {
    const page = await newPage(); await page.goto(BASE);
    await page.locator(".sg-card--lead").scrollIntoViewIfNeeded();
    const box = await page.locator(".sg-card--lead").boundingBox();
    await page.mouse.move(box.x + 100, box.y + 60);
    const v = await page.$eval(".sg-card--lead", e => [e.style.getPropertyValue("--mx"), e.style.getPropertyValue("--my")]);
    assert(v[0] === "100px" && v[1] === "60px", v.join(","));
    await page.context().close();
  });

  await test("copy button: ring, spinner, check; copies the address from the mailto link", async () => {
    const page = await newPage({ permissions: ["clipboard-read", "clipboard-write"] }); await page.goto(BASE);
    const addr = await page.textContent("#copyAddr");
    assert(addr === "you@example.com", "address shown: " + addr);
    await page.click("#copyEmail");
    assert(await page.getAttribute("#copyEmail", "data-copy") === "busy", "no busy state");
    await page.waitForSelector('#copyEmail[data-copy="done"]', { timeout: 2000 });
    assert(await page.textContent("#copyMsg") === "Copied" && await page.textContent("#copyLive") === "Email address copied", "done labels");
    assert(await page.evaluate(() => navigator.clipboard.readText()) === addr, "clipboard holds something else");
    await page.waitForSelector('#copyEmail[data-copy="idle"]', { timeout: 4000 });
    assert(await page.textContent("#copyLive") === "", "live region not cleared");
    await page.context().close();
  });

  await test("copy button: when the browser refuses, it says Blocked and reads out the address", async () => {
    const page = await newPage();
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", { value: { writeText: () => Promise.reject(new Error("denied")) } });
      document.execCommand = () => false;
    });
    await page.goto(BASE);
    await page.click("#copyEmail");
    await page.waitForSelector('#copyEmail[data-copy="error"]', { timeout: 2000 });
    assert(await page.textContent("#copyMsg") === "Blocked", "label");
    assert(/you@example\.com/.test(await page.textContent("#copyLive")), "live: " + await page.textContent("#copyLive"));
    assert(await page.evaluate(() => document.activeElement.id) === "copyEmail", "focus left the button");
    await page.context().close();
  });

  await test("copy button: a real address set only in the mailto link is the one shown and copied", async () => {
    const page = await newPage({ permissions: ["clipboard-read", "clipboard-write"] });
    await withHtml(page, 'href="mailto:you@example.com"', 'href="mailto:a.much.longer.name.for.testing@example.org"');
    await page.goto(BASE);
    assert(await page.textContent("#copyAddr") === "a.much.longer.name.for.testing@example.org", "shown");
    await page.click("#copyEmail");
    await page.waitForSelector('#copyEmail[data-copy="done"]', { timeout: 2000 });
    assert(await page.evaluate(() => navigator.clipboard.readText()) === "a.much.longer.name.for.testing@example.org", "copied");
    await page.context().close();
  });

  // ---------- Motion ----------
  async function canvasChanges(page, index) {
    const grab = () => page.$$eval("ascii-art canvas", (cs, i) => cs[i].toDataURL(), index);
    const a = await grab(); await sleep(700); const b = await grab();
    return a !== b;
  }

  await test("reduced motion: no scramble, no orbit, scenes hold a still frame, no Pause button", async () => {
    const page = await newPage({ reducedMotion: "reduce" }); await page.goto(BASE); await mapReady(page);
    const r = await page.evaluate(() => ({
      cls: document.documentElement.className, name: document.getElementById("nameText").textContent,
      say: document.getElementById("sayText").textContent, button: document.getElementById("motionToggle").hidden,
    }));
    assert(r.cls === "sg-still" && r.name === "Krish Rathore" && r.say === "Say hi." && r.button, JSON.stringify(r));
    await scrollThrough(page);
    assert(!(await canvasChanges(page, 0)), "hero scene still moving");
    await page.evaluate(() => document.getElementById("say").scrollIntoView({ block: "center", behavior: "instant" }));
    await sleep(400);
    const running = await page.evaluate(() => document.getAnimations().filter(a => a.playState === "running").map(a => a.animationName || a.constructor.name));
    assert(!running.length, "animations running: " + running);
    await page.context().close();
  });

  await test("Pause animation stops the scenes and effects, is remembered, and Play restarts them", async () => {
    const page = await newPage(); await page.goto(BASE); await scrollThrough(page);
    assert(await canvasChanges(page, 0), "hero scene is not animating to begin with");
    await page.click("#motionToggle");
    let r = await page.evaluate(() => ({ cls: document.documentElement.className, fps: [...document.querySelectorAll("ascii-art")].map(a => a.getAttribute("fps")), text: document.getElementById("motionToggle").textContent, saved: localStorage.getItem("motion") }));
    assert(r.cls === "sg-still" && r.fps.join() === "0,0" && r.text === "Play animation" && r.saved === "off", JSON.stringify(r));
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.waitForFunction(() => document.querySelectorAll("ascii-art canvas").length === 2);
    await sleep(300);
    assert(!(await canvasChanges(page, 0)), "hero scene still moving after Pause");
    await page.reload();
    r = await page.evaluate(() => ({ cls: document.documentElement.className, name: document.getElementById("nameText").textContent, text: document.getElementById("motionToggle").textContent }));
    assert(r.cls === "sg-still" && r.name === "Krish Rathore" && r.text === "Play animation", "after reload: " + JSON.stringify(r));
    await page.click("#motionToggle");
    r = await page.evaluate(() => ({ cls: document.documentElement.className, fps: [...document.querySelectorAll("ascii-art")].map(a => a.getAttribute("fps")), saved: localStorage.getItem("motion") }));
    assert(r.cls === "sg-anim" && r.fps.join() === "," && r.saved === null, JSON.stringify(r));
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.waitForFunction(() => document.querySelectorAll("ascii-art canvas").length >= 1);
    await sleep(900);
    assert(await canvasChanges(page, 0), "hero scene did not restart after Play");
    await page.context().close();
  });

  // ---------- Layout ----------
  await test("no sideways page scroll from 320px to 1920px (only the map box may scroll)", async () => {
    const bad = [];
    for (const w of [320, 360, 375, 390, 414, 480, 600, 640, 700, 768, 820, 900, 1024, 1100, 1180, 1280, 1366, 1440, 1920]) {
      const page = await newPage({ viewport: { width: w, height: 800 } }); await page.goto(BASE); await mapReady(page);
      const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      if (o.sw > o.cw) bad.push(`${w}px: ${o.sw} > ${o.cw}`);
      await page.context().close();
    }
    // With the real fonts too, where they can be fetched.
    for (const w of [320, 375]) {
      const page = await newPage({ viewport: { width: w, height: 800 }, realFonts: true }); await page.goto(BASE);
      await page.evaluate(() => document.fonts.ready); await mapReady(page);
      const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      if (o.sw > o.cw) bad.push(`${w}px real fonts: ${o.sw} > ${o.cw}`);
      await page.context().close();
    }
    assert(!bad.length, bad.join(", "));
  });

  await test("no top bar; the glass pill sits at the bottom centre and stays there while scrolling", async () => {
    for (const vp of [{ width: 320, height: 640 }, { width: 375, height: 812 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
      const page = await newPage({ viewport: vp }); await page.goto(BASE);
      const read = () => page.evaluate(() => {
        const d = document.getElementById("dock"), b = d.getBoundingClientRect(), cs = getComputedStyle(d);
        return { header: document.querySelectorAll("header, .sg-top").length, pos: cs.position, glass: cs.backdropFilter || cs.webkitBackdropFilter,
          left: b.left, right: innerWidth - b.right, gap: innerHeight - b.bottom, links: [...d.querySelectorAll("a")].map(a => a.getBoundingClientRect().height) };
      });
      const top = await read();
      await page.evaluate(() => document.getElementById("approach").scrollIntoView({ behavior: "instant" }));
      const mid = await read();
      const where = `${vp.width}px ${JSON.stringify(top)}`;
      assert(top.header === 0, "a header is back: " + where);
      assert(top.pos === "fixed" && /blur/.test(top.glass), "not a fixed glass pill: " + where);
      assert(Math.abs(top.gap - 16) <= 1, "not 16px above the bottom: " + where);
      assert(Math.abs(top.left - top.right) <= 1 && top.left >= 8, "not centred inside the screen: " + where);
      assert(top.links.length === 5 && top.links.every(h => h >= 44), "links under 44px: " + where);
      assert(JSON.stringify(mid) === JSON.stringify(top), `moved while scrolling at ${vp.width}px: ${JSON.stringify(mid)}`);
      await page.context().close();
    }
  });

  await test("the pill marks the section being read, slides its highlight there, and marks nothing in the hero", async () => {
    const page = await newPage(); await page.goto(BASE); await mapReady(page);
    const state = () => page.evaluate(() => {
      const on = [...document.querySelectorAll("#dock a[aria-current]")];
      const g = document.getElementById("dockGlow"), gb = g.getBoundingClientRect();
      const lb = on[0] && on[0].getBoundingClientRect();
      return { current: on.map(a => a.textContent).join(), glow: g.classList.contains("is-on"), off: lb ? Math.round(Math.abs(gb.left - lb.left) + Math.abs(gb.width - lb.width)) : null };
    });
    let r = await state();
    assert(r.current === "" && !r.glow, "hero: " + JSON.stringify(r));
    for (const id of ["work", "skills", "github", "approach"]) {
      await page.evaluate(id => document.getElementById(id).scrollIntoView({ behavior: "instant" }), id);
      await page.waitForFunction(id => (document.querySelector("#dock a[aria-current]") || {}).textContent === id, id, { timeout: 2000 });
      await sleep(700);
      r = await state();
      assert(r.glow && r.off <= 1, id + ": " + JSON.stringify(r));
    }
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
    await page.waitForFunction(() => (document.querySelector("#dock a[aria-current]") || {}).textContent === "contact", null, { timeout: 2000 });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.waitForFunction(() => !document.querySelector("#dock a[aria-current]"), null, { timeout: 2000 });
    await page.click('#dock a[href="#skills"]');
    await page.waitForFunction(() => (document.querySelector("#dock a[aria-current]") || {}).textContent === "skills", null, { timeout: 3000 });
    assert(/#skills$/.test(page.url()), page.url());
    await page.context().close();
  });

  await test("at the end of the page the pill covers none of the footer links", async () => {
    const bad = [];
    for (const vp of [{ width: 320, height: 640 }, { width: 375, height: 812 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
      const page = await newPage({ viewport: vp }); await page.goto(BASE);
      await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
      const hit = await page.evaluate(() => {
        const d = document.getElementById("dock").getBoundingClientRect();
        return [...document.querySelectorAll(".sg-bottom a, .sg-bottom button, .sg-bottom span")].filter(e => {
          const b = e.getBoundingClientRect();
          return b.width && b.height && b.left < d.right && b.right > d.left && b.top < d.bottom && b.bottom > d.top;
        }).map(e => e.textContent.trim());
      });
      if (hit.length) bad.push(`${vp.width}px: ${hit.join(", ")}`);
      await page.context().close();
    }
    assert(!bad.length, bad.join(" | "));
  });

  await test("contact text sits on top of the edge orbit scene, which fills the space behind it", async () => {
    const bad = [];
    for (const vp of [{ width: 320, height: 640 }, { width: 375, height: 812 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
      const page = await newPage({ viewport: vp }); await page.goto(BASE);
      await page.evaluate(() => document.getElementById("say").scrollIntoView({ block: "center", behavior: "instant" }));
      await page.waitForSelector(".sg-end-art canvas", { timeout: 8000 });
      const r = await page.evaluate(() => {
        const box = el => el.getBoundingClientRect();
        const art = box(document.querySelector(".sg-end-art")), cv = box(document.querySelector(".sg-end-art canvas"));
        const say = box(document.getElementById("say")), socials = box(document.querySelector(".sg-socials"));
        const email = document.getElementById("emailLink"), e = box(email);
        const topEl = document.elementFromPoint(e.left + e.width / 2, e.top + e.height / 2);
        return { art, cv, say, socials, onTop: email.contains(topEl), ratio: cv.width / art.width };
      });
      const w = `${vp.width}px`;
      if (!(r.cv.top <= r.say.top && r.cv.bottom >= r.socials.bottom)) bad.push(`${w}: scene ${Math.round(r.cv.top)}-${Math.round(r.cv.bottom)} does not span the text ${Math.round(r.say.top)}-${Math.round(r.socials.bottom)}`);
      if (!(r.cv.left <= 0.5 && r.cv.right >= vp.width - 0.5)) bad.push(`${w}: scene is narrower than the screen`);
      if (!(r.say.top >= r.art.top && r.socials.bottom <= r.art.bottom)) bad.push(`${w}: text is outside the scene's box`);
      if (!r.onTop) bad.push(`${w}: the Email me button is not on top`);
      if (r.ratio > 4.01) bad.push(`${w}: scene blown up ${r.ratio.toFixed(2)}x`);
      await page.context().close();
    }
    assert(!bad.length, bad.join(" | "));
  });

  await test("big Krish at the bottom rises letter by letter as the page reaches its end", async () => {
    const page = await newPage(); await page.goto(BASE);
    const read = () => page.evaluate(() => {
      const w = document.getElementById("wordmark");
      return { p: w.style.getPropertyValue("--p"), hidden: w.getAttribute("aria-hidden"), text: w.textContent,
        ty: [...w.children].map(s => Math.round(new DOMMatrix(getComputedStyle(s).transform).m42)) };
    });
    await sleep(500);
    let r = await read();
    assert(r.hidden === "true" && r.text === "Krish", JSON.stringify(r));
    assert(r.p === "0.000" && r.ty.every(t => t > 0), "top of page: " + JSON.stringify(r));
    // Partly in view: the first letters are higher than the last.
    await page.evaluate(() => { const b = document.getElementById("wordmark").getBoundingClientRect(); window.scrollBy({ top: b.top - innerHeight + b.height * 0.4, behavior: "instant" }); });
    await sleep(600);
    r = await read();
    assert(+r.p > 0.3 && +r.p < 0.5 && r.ty[0] < r.ty[4], "partly in view: " + JSON.stringify(r));
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
    await sleep(600);
    r = await read();
    assert(r.p === "1.000" && r.ty.every(t => t === 0), "end of page: " + JSON.stringify(r));
    // Pause animation: the name is simply up, wherever the page is.
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.click("#motionToggle");
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await sleep(100);
    r = await read();
    assert(r.p === "1" && r.ty.every(t => t === 0), "paused: " + JSON.stringify(r));
    await page.context().close();
    // Reduced motion and no JavaScript: up from the start.
    for (const opts of [{ reducedMotion: "reduce" }, { javaScriptEnabled: false }]) {
      const p2 = await newPage(opts); await p2.goto(BASE);
      const ty = await p2.$$eval("#wordmark span", ss => ss.map(s => Math.round(new DOMMatrix(getComputedStyle(s).transform).m42)));
      assert(ty.every(t => t === 0), JSON.stringify(opts) + ": " + ty);
      await p2.context().close();
    }
  });

  await test("a long real email address wraps inside the copy button on a 320px phone", async () => {
    const page = await newPage({ viewport: { width: 320, height: 700 } });
    await withHtml(page, 'href="mailto:you@example.com"', 'href="mailto:firstname.lastname.portfolio@example.org"');
    await page.goto(BASE);
    const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, b: document.getElementById("copyEmail").getBoundingClientRect().right }));
    assert(r.sw <= r.cw && r.b <= r.cw, JSON.stringify(r));
    await page.context().close();
  });

  await test("grids: bento, four skill compartments (4, then 2, then 1 across), phone hero order", async () => {
    const across = async w => {
      const page = await newPage({ viewport: { width: w, height: 900 } }); await page.goto(BASE);
      const r = await page.evaluate(() => {
        const tops = [...document.querySelectorAll(".sg-skills .sg-card")].map(c => Math.round(c.getBoundingClientRect().top));
        const lead = document.querySelector(".sg-card--lead").getBoundingClientRect().width;
        const small = document.querySelector(".sg-bento .sg-card:not(.sg-card--lead)").getBoundingClientRect().width;
        const heroText = document.querySelector(".sg-hero-in").getBoundingClientRect(), art = document.querySelector(".sg-art").getBoundingClientRect();
        return { count: tops.length, firstRow: tops.filter(t => t === tops[0]).length, ratio: lead / small, textAbove: heroText.bottom <= art.top + 1 };
      });
      await page.context().close();
      return r;
    };
    const wide = await across(1440), mid = await across(1000), phone = await across(375);
    assert(wide.count === 4 && wide.firstRow === 4, "1440px skills: " + JSON.stringify(wide));
    assert(mid.firstRow === 2, "1000px skills: " + JSON.stringify(mid));
    assert(phone.firstRow === 1, "375px skills: " + JSON.stringify(phone));
    assert(wide.ratio > 1.9, "headline card should span two columns: " + wide.ratio);
    assert(Math.abs(phone.ratio - 1) < 0.01, "phone cards should be full width: " + phone.ratio);
    assert(phone.textAbove && !wide.textAbove, "hero text should sit above the scene only on phones");
  });

  await test("touch targets are at least 44px tall on a phone (inline text links exempt)", async () => {
    const page = await newPage({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true }); await page.goto(BASE); await mapReady(page);
    const small = await page.$$eval("a, button, [tabindex]", els => els.filter(e => {
      const r = e.getBoundingClientRect(); if (!r.width || !r.height) return false;
      if (e.classList.contains("sg-skip") || e.classList.contains("sg-credit")) return false;
      return r.height < 44 || r.width < 24;
    }).map(e => (e.id || e.className || e.tagName) + " " + Math.round(e.getBoundingClientRect().width) + "x" + Math.round(e.getBoundingClientRect().height)));
    assert(!small.length, small.join(", "));
    await page.context().close();
  });

  // ---------- Accessibility ----------
  for (const vp of [{ width: 1440, height: 900 }, { width: 375, height: 812 }]) {
    await test(`axe accessibility scan at ${vp.width}px (after effects settle)`, async () => {
      const page = await newPage({ viewport: vp }); await page.goto(BASE); await mapReady(page);
      await scrollThrough(page);
      await page.evaluate(() => document.getElementById("say").scrollIntoView({ block: "center", behavior: "instant" }));
      await page.waitForFunction(() => document.getElementById("sayText").textContent === "Say hi.", null, { timeout: 3000 });
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await sleep(1700);
      await page.addScriptTag({ content: AXE });
      const r = await page.evaluate(async () => {
        const res = await axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] });
        return {
          v: res.violations.map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length, help: v.help, t: v.nodes.slice(0, 4).map(n => n.target.join(" ") + " :: " + (n.failureSummary || "").split("\n").slice(1, 2).join("")) })),
          incomplete: res.incomplete.map(v => v.id + "(" + v.nodes.length + ")"),
        };
      });
      fs.writeFileSync(path.join(OUT, `axe-${vp.width}.json`), JSON.stringify(r, null, 1));
      r.v.filter(v => !(v.impact === "serious" || v.impact === "critical")).forEach(v => note("a11y " + vp.width, `${v.id} (${v.impact}, ${v.n}): ${v.help}`));
      const serious = r.v.filter(v => v.impact === "serious" || v.impact === "critical");
      assert(!serious.length, serious.map(v => `${v.id}(${v.n}): ${v.t.join(" ; ")}`).join(" || "));
      await page.context().close();
    });
  }

  await test("text contrast: every small label and body colour passes 4.5:1 on both grounds", async () => {
    const lum = hex => { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
    const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const bad = [];
    for (const fg of ["#EDEDED", "#C9C9C9", "#9A9A9A", "#8A8A92", "#F38020"]) for (const bg of ["#0E0E0F", "#04060C", "#141416"]) {
      if (ratio(fg, bg) < 4.5) bad.push(`${fg} on ${bg}: ${ratio(fg, bg).toFixed(2)}`);
    }
    if (ratio("#0E0E0F", "#F38020") < 4.5) bad.push("button text on orange");
    assert(!bad.length, bad.join(", "));
  });

  // ---------- Deploy ----------
  await test("deploy workflow copies every local file the page loads, and versions the CSS and JS", async () => {
    const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
    const yml = fs.readFileSync(path.join(ROOT, ".github/workflows/deploy.yml"), "utf8");
    const refs = [...html.matchAll(/\s(?:href|src)="([^"#:]+)"/g)].map(m => m[1]).filter(u => !u.startsWith("//"));
    const copied = [], dirs = [];
    for (const m of yml.matchAll(/^\s*cp (-r )?(.+) _site\/?\s*$/gm)) (m[1] ? dirs : copied).push(...m[2].trim().split(/\s+/));
    const missing = refs.filter(u => !fs.existsSync(path.join(ROOT, u)) || !(copied.includes(u) || dirs.some(d => u.startsWith(d.replace(/\/$/, "") + "/"))));
    assert(refs.length >= 3, "found refs: " + refs);
    assert(!missing.length, "not deployed: " + missing.join(", "));
    for (const tag of ['href="styles.css"', 'src="script.js"', 'src="vendor/ascii-rest/ascii-scenes.js"']) {
      assert(html.includes(tag), "index.html lost " + tag + ", so the deploy's version tag would not apply");
      assert(yml.includes(tag.replace(/"/g, '\\"')), "deploy.yml does not version " + tag);
    }
    assert(fs.existsSync(path.join(ROOT, "vendor/ascii-rest/LICENSE")), "ascii.rest MIT licence missing");
  });

  // ---------- Content (findings, not failures) ----------
  await test("content review", async () => {
    const page = await newPage(); await page.goto(BASE);
    const m = await page.evaluate(() => ({
      email: (document.getElementById("emailLink") || {}).getAttribute("href"),
      linkedin: !!document.querySelector('a[href="https://www.linkedin.com/"]'),
    }));
    if (/you@example\.com/.test(m.email)) note("content", "The Email me link still points at you@example.com.");
    if (m.linkedin) note("content", "The LinkedIn link points at linkedin.com, not a profile.");
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
