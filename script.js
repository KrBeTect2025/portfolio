// Signal: the small amount of JavaScript the page needs. Everything here is optional: without it,
// every word, link and section still shows; only the effects, the contribution map and the copy
// button need it. The two ASCII scenes live in vendor/ascii-rest/ascii-scenes.js.
(function () {
  "use strict";

  var root = document.documentElement;
  function $(id) { return document.getElementById(id); }

  // ---------- Motion ----------
  // The page moves unless the system asks for reduced motion or the visitor pressed
  // "Pause animation" (remembered in localStorage). The <head> script already set the class
  // on <html> before the first paint; this keeps it up to date.
  var reduceQuery = window.matchMedia ? matchMedia("(prefers-reduced-motion: reduce)") : null;
  function systemReduces() { return !!(reduceQuery && reduceQuery.matches); }
  var paused = false;
  try { paused = localStorage.getItem("motion") === "off"; } catch (e) { /* storage blocked */ }
  function motionOn() { return !systemReduces() && !paused; }

  var scenes = document.querySelectorAll("ascii-art");
  var motionToggle = $("motionToggle");

  function applyMotion() {
    var on = motionOn();
    root.classList.toggle("sg-anim", on);
    root.classList.toggle("sg-still", !on);
    // fps="0" draws one still frame. Only touch the attribute when it changes, because
    // changing it rebuilds the scene.
    Array.prototype.forEach.call(scenes, function (scene) {
      var still = scene.getAttribute("fps") === "0";
      if (!on && !still) scene.setAttribute("fps", "0");
      if (on && still) scene.removeAttribute("fps");
    });
    // With reduced motion set by the system the scenes are already still, so the button would do nothing.
    motionToggle.hidden = systemReduces();
    motionToggle.textContent = paused ? "Play animation" : "Pause animation";
    if (!on) finishDecrypts();
  }

  motionToggle.addEventListener("click", function () {
    paused = !paused;
    // If storage is blocked, the choice still lasts until the page is closed.
    try {
      if (paused) localStorage.setItem("motion", "off");
      else localStorage.removeItem("motion");
    } catch (e) { /* storage blocked */ }
    applyMotion();
  });
  if (reduceQuery) {
    if (reduceQuery.addEventListener) reduceQuery.addEventListener("change", applyMotion);
    else if (reduceQuery.addListener) reduceQuery.addListener(applyMotion);
  }

  // ---------- Decrypted Text ----------
  // The name scrambles into place once on load, left to right. "Say hi." waits until it is in
  // view, then resolves from its edges toward its centre, and plays again on hover.
  // Each visible letter is its own <span>; the real words are in a .sg-sr twin for screen readers.
  function Decrypt(el, text, opts) {
    this.el = el;
    this.text = text;
    this.pool = opts.pool;
    this.step = opts.step;           // milliseconds between frames
    this.framesPerLetter = opts.framesPerLetter;
    // Which letter resolves first, second... Spaces never scramble, so they are left out; that way
    // the effect ends the moment the last letter lands.
    this.order = opts.order.filter(function (i) { return text[i] !== " "; });
    this.onDone = opts.onDone || function () {};
    this.timer = 0;
    this.spans = [];
    el.textContent = "";
    for (var i = 0; i < text.length; i++) {
      var span = document.createElement("span");
      span.textContent = text[i];
      this.spans.push(span);
      el.appendChild(span);
    }
  }
  Decrypt.prototype.show = function (revealed, noise) {
    for (var i = 0; i < this.text.length; i++) {
      var done = this.text[i] === " " || revealed[i];
      this.spans[i].textContent = done ? this.text[i] : noise[i];
      this.spans[i].className = done ? "" : "sg-x";
    }
  };
  Decrypt.prototype.randomNoise = function () {
    var pool = this.pool;
    return this.text.split("").map(function (ch) {
      return ch === " " ? " " : pool[Math.floor(Math.random() * pool.length)];
    });
  };
  Decrypt.prototype.hold = function (noise) {
    this.stop();
    this.show([], noise.split(""));
  };
  Decrypt.prototype.finish = function () {
    this.stop();
    this.show(this.text.split("").map(function () { return true; }), []);
  };
  Decrypt.prototype.stop = function () {
    clearInterval(this.timer);
    this.timer = 0;
  };
  Decrypt.prototype.running = function () { return !!this.timer; };
  Decrypt.prototype.play = function () {
    var self = this;
    this.stop();
    if (!motionOn()) { this.finish(); this.onDone(); return; }
    var frame = 0;
    var revealed = [];
    this.show(revealed, this.randomNoise());
    this.timer = setInterval(function () {
      frame += 1;
      var count = Math.floor(frame / self.framesPerLetter);
      if (count >= self.order.length) {
        self.finish();
        self.onDone();
        return;
      }
      revealed = [];
      for (var k = 0; k < count; k++) revealed[self.order[k]] = true;
      self.show(revealed, self.randomNoise());
    }, this.step);
  };

  function inOrder(n) { var a = []; for (var i = 0; i < n; i++) a.push(i); return a; }
  // Edges first, centre last, so the line converges.
  function edgesFirst(n) {
    var mid = (n - 1) / 2;
    return inOrder(n).sort(function (a, b) { return Math.abs(b - mid) - Math.abs(a - mid); });
  }

  var nameEl = $("nameText");
  var name = new Decrypt(nameEl, "Krish Rathore", {
    pool: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789#%&*+=<>/",
    step: 45, framesPerLetter: 2, order: inOrder(13)
  });
  nameEl.classList.add("is-live");

  var star = $("star");
  function runStar() {
    if (!motionOn()) return;
    star.classList.remove("sg-run");
    void star.offsetWidth; // restart the animation
    star.classList.add("sg-run");
  }
  var sayEl = $("sayText");
  var say = new Decrypt(sayEl, "Say hi.", {
    pool: "·•●#%&*+=<>/01",
    step: 55, framesPerLetter: 3, order: edgesFirst(7),
    onDone: runStar
  });
  var sayWaiting = false;

  function finishDecrypts() {
    name.finish();
    say.finish();
    sayWaiting = false;
    star.classList.remove("sg-run");
  }

  // ---------- Spotlight Card ----------
  Array.prototype.forEach.call(document.querySelectorAll(".sg-card"), function (card) {
    card.addEventListener("pointermove", function (e) {
      var r = card.getBoundingClientRect();
      card.style.setProperty("--mx", Math.round(e.clientX - r.left) + "px");
      card.style.setProperty("--my", Math.round(e.clientY - r.top) + "px");
    });
  });

  // ---------- Contribution map ----------
  // data/contributions.json is written once a day by the GitHub Action in
  // .github/workflows/deploy.yml, in this shape:
  //   { login, total, updated: "YYYY-MM-DD", weeks: [[{ date, count, level }, ...], ...] }
  // It only exists on the live site, so opening index.html straight from disk shows the note instead.
  var DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  function utc(dateText) { return new Date(dateText + "T00:00:00Z"); }
  function plural(n, word) { return n + " " + word + (n === 1 ? "" : "s"); }
  function shortDate(d) { return DAYS[d.getUTCDay()].slice(0, 3) + " " + d.getUTCDate() + " " + MONTHS[d.getUTCMonth()].slice(0, 3); }
  function longDate(d) { return DAYS[d.getUTCDay()] + " " + d.getUTCDate() + " " + MONTHS[d.getUTCMonth()] + " " + d.getUTCFullYear(); }
  function countText(n) { return (n === 0 ? "No" : n.toLocaleString("en")) + " contribution" + (n === 1 ? "" : "s"); }

  // Turns the file into a flat, date-ordered list of days, keeping only well-formed entries.
  function readDays(data) {
    var days = [];
    if (!data || !Array.isArray(data.weeks)) return days;
    data.weeks.forEach(function (week) {
      if (!Array.isArray(week)) return;
      week.forEach(function (day) {
        if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day.date) || typeof day.count !== "number" || day.count < 0) return;
        var level = day.level;
        if (!(level >= 0 && level <= 4 && level === Math.floor(level))) level = day.count > 0 ? 1 : 0;
        days.push({ date: day.date, count: day.count, level: level });
      });
    });
    days.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    return days;
  }

  // Longest run of days with at least one contribution, and the run that is still going.
  // The newest day is skipped if it has nothing yet, because the data is fetched early in the
  // morning (UTC) before that day has really started.
  function streaks(days) {
    var longest = 0, run = 0, i;
    for (i = 0; i < days.length; i++) {
      run = days[i].count > 0 ? run + 1 : 0;
      if (run > longest) longest = run;
    }
    var current = 0;
    i = days.length - 1;
    if (i >= 0 && days[i].count === 0) i--;
    for (; i >= 0 && days[i].count > 0; i--) current++;
    return { longest: longest, current: current };
  }

  var map = $("ghMap"), wrap = $("ghWrap"), cal = $("ghCal"), ring = $("ghRing"), tip = $("ghTip"), live = $("ghLive");
  var calDays = [];
  var dots = [];
  var cur = -1;           // the day the tooltip points at
  var tipOn = false;
  var tipTimer = 0;
  var warmUntil = 0;      // while warm, the next tooltip opens without a delay

  function drawContributions(data) {
    var days = readDays(data);
    if (!days.length) throw new Error("No days in the contribution data");
    calDays = days;

    // One column per week (Sunday to Saturday), counted from the Sunday on or before the first day.
    var first = utc(days[0].date);
    var start = first.getTime() - first.getUTCDay() * 86400000;
    var weeks = 0;
    var html = "";
    days.forEach(function (day, i) {
      var d = utc(day.date);
      var col = Math.floor((d.getTime() - start) / (7 * 86400000)) + 1;
      if (col > weeks) weeks = col;
      day.d = d;
      html += '<span class="sg-d l' + day.level + '" data-i="' + i + '" style="grid-row:' + (d.getUTCDay() + 1) + ";grid-column:" + col + '"></span>';
    });
    cal.innerHTML = html;
    dots = cal.children;
    wrap.style.setProperty("--weeks", weeks);

    // A month label over the first week that starts in that month. A label is three columns wide,
    // so one that would run past the end or into the next label is left out.
    var labels = [];
    var lastMonth = -1;
    for (var w = 0; w < weeks; w++) {
      var sunday = new Date(start + w * 7 * 86400000);
      var weekStart = w === 0 ? first : sunday;
      var month = weekStart.getUTCMonth();
      if (month !== lastMonth) {
        labels.push({ col: w + 1, text: MONTHS[month].slice(0, 3) });
        lastMonth = month;
      }
    }
    labels = labels.filter(function (label, k) {
      var next = labels[k + 1];
      return label.col + 2 <= weeks && (!next || next.col - label.col >= 3);
    });
    $("ghMonths").innerHTML = labels.map(function (label) {
      return '<span style="grid-column:' + label.col + ' / span 3">' + label.text + "</span>";
    }).join("");

    // The three numbers.
    var total = typeof data.total === "number" ? data.total : days.reduce(function (s, d) { return s + d.count; }, 0);
    var recent = days.slice(-30).reduce(function (s, d) { return s + d.count; }, 0);
    var s = streaks(days);
    $("ghTotal").textContent = total.toLocaleString("en");
    $("ghRecent").textContent = recent.toLocaleString("en");
    var streakLabel;
    if (s.current > 0 && s.current === s.longest) {
      $("ghStreak").textContent = s.current;
      streakLabel = "day streak, my longest so far";
    } else if (s.current > 0) {
      $("ghStreak").textContent = s.current;
      streakLabel = "day streak now; my longest is " + plural(s.longest, "day");
    } else {
      $("ghStreak").textContent = s.longest;
      streakLabel = (s.longest === 1 ? "day" : "days") + " in a row, my longest streak";
    }
    $("ghStreakLabel").textContent = streakLabel;
    $("ghStats").hidden = false;

    var note = "Each dot is a day. Synced daily from GitHub";
    if (/^\d{4}-\d{2}-\d{2}$/.test(data.updated || "")) {
      var u = utc(data.updated);
      note += "; updated " + u.getUTCDate() + " " + MONTHS[u.getUTCMonth()].slice(0, 3) + " " + u.getUTCFullYear();
    }
    $("ghNote").textContent = note + ".";
    $("skillGit").textContent = ", " + total.toLocaleString("en") + " contribution" + (total === 1 ? "" : "s") + " in the last year";
    $("ghLegend").hidden = false;
    map.hidden = false;
    weeksShown = weeks;
    fitMap();

    // Where the map does not fit, it scrolls sideways; start at the latest week.
    map.scrollLeft = map.scrollWidth;
  }

  // Days sit 16px apart where the whole year fits, closing up to 12px; narrower than that, the
  // box scrolls sideways instead.
  var weeksShown = 0;
  function fitMap() {
    if (!weeksShown || map.hidden) return;
    var cell = Math.max(12, Math.min(16, Math.floor(map.clientWidth / weeksShown)));
    if (wrap.style.getPropertyValue("--cell") === cell + "px") return;
    hideDay();
    wrap.style.setProperty("--cell", cell + "px");
    wrap.classList.toggle("is-tight", cell < 14);
  }
  if (window.ResizeObserver) new ResizeObserver(fitMap).observe(map);
  else window.addEventListener("resize", fitMap);

  function contributionsMissing() {
    map.hidden = true;
    $("ghStats").hidden = true;
    $("ghLegend").hidden = true;
    $("ghNote").textContent = "The contribution map could not load. My daily activity is on GitHub.";
  }

  function showDay(i, fromKeyboard) {
    var dot = dots[i];
    if (!dot) return;
    cur = i;
    var day = calDays[i];
    var x = dot.offsetLeft, y = dot.offsetTop, size = dot.offsetWidth;
    ring.style.transform = "translate(" + x + "px, " + y + "px)";
    tip.textContent = countText(day.count) + " · " + shortDate(day.d);
    tip.style.top = y + "px";
    // Keep the label inside the map; the arrow still points at the day.
    var half = tip.offsetWidth / 2;
    var mid = x + size / 2;
    var left = Math.min(Math.max(mid, half), Math.max(half, wrap.offsetWidth - half));
    tip.style.left = left + "px";
    tip.style.setProperty("--ax", (mid - left) + "px");
    ring.classList.add("is-on");
    tip.classList.add("is-on");
    tipOn = true;
    if (fromKeyboard) {
      live.textContent = countText(day.count) + " on " + longDate(day.d);
      if (map.scrollWidth > map.clientWidth) {
        if (x < map.scrollLeft + 24 || x + size > map.scrollLeft + map.clientWidth - 24) {
          map.scrollLeft = Math.max(0, x - map.clientWidth / 2);
        }
      }
    }
  }

  function hideDay() {
    clearTimeout(tipTimer);
    if (tipOn) warmUntil = Date.now() + 500;
    ring.classList.remove("is-on");
    tip.classList.remove("is-on");
    tipOn = false;
  }

  // Warm Tooltip: the first day waits 320 ms, then neighbouring days open at once.
  map.addEventListener("mousemove", function (e) {
    var dot = e.target.closest ? e.target.closest("[data-i]") : null;
    if (!dot) return;
    var i = +dot.getAttribute("data-i");
    if (i === cur && tipOn) return;
    cur = i;
    clearTimeout(tipTimer);
    if (tipOn || Date.now() < warmUntil) showDay(i, false);
    else tipTimer = setTimeout(function () { showDay(cur, false); }, 320);
  });
  map.addEventListener("mouseleave", hideDay);
  // A tap (or click) opens the day straight away.
  map.addEventListener("click", function (e) {
    var dot = e.target.closest ? e.target.closest("[data-i]") : null;
    if (dot) { clearTimeout(tipTimer); showDay(+dot.getAttribute("data-i"), false); }
  });
  map.addEventListener("focus", function () {
    // Only for keyboard focus; a click already chooses its own day.
    var keyboard = true;
    try { keyboard = map.matches(":focus-visible"); } catch (e) { /* older browsers */ }
    if (!keyboard) return;
    showDay(cur < 0 ? calDays.length - 1 : cur, true);
  });
  map.addEventListener("blur", hideDay);
  map.addEventListener("keydown", function (e) {
    if (!calDays.length) return;
    var step = { ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1 }[e.key];
    var i = cur < 0 ? calDays.length - 1 : cur;
    if (step) i = Math.max(0, Math.min(calDays.length - 1, i + step));
    else if (e.key === "Home") i = 0;
    else if (e.key === "End") i = calDays.length - 1;
    else if (e.key === "Escape") { hideDay(); return; }
    else return;
    e.preventDefault();
    clearTimeout(tipTimer);
    showDay(i, true);
  });

  if (window.fetch && location.protocol !== "file:") {
    fetch("data/contributions.json", { cache: "no-cache" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(drawContributions)
      .catch(contributionsMissing);
  } else {
    contributionsMissing();
  }

  // ---------- Copy email (Status Mark) ----------
  var copyBtn = $("copyEmail"), copyMsg = $("copyMsg"), copyLive = $("copyLive");
  var email = $("emailLink").getAttribute("href").replace(/^mailto:/, "").split("?")[0];
  var copyState = "idle", copyTimer = 0;
  var COPY_LABELS = { idle: "Copy", busy: "Copying", done: "Copied", error: "Blocked" };
  $("copyAddr").textContent = email;
  copyBtn.hidden = false;

  function setCopy(state) {
    copyState = state;
    copyBtn.setAttribute("data-copy", state);
    copyMsg.textContent = COPY_LABELS[state];
    copyLive.textContent = state === "done" ? "Email address copied"
      : state === "error" ? "Could not copy. The address is " + email : "";
  }

  // The Clipboard API needs https; the older execCommand way covers the rest.
  function legacyCopy(text) {
    var area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "0";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    area.remove();
    copyBtn.focus();
    return ok ? Promise.resolve() : Promise.reject(new Error("copy failed"));
  }
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(function () { return legacyCopy(text); });
    }
    return legacyCopy(text);
  }

  copyBtn.addEventListener("click", function () {
    if (copyState === "busy") return;
    setCopy("busy");
    function finish(ok) {
      // A short pause so the spinning arc reads as "working" before the check appears.
      setTimeout(function () {
        setCopy(ok ? "done" : "error");
        clearTimeout(copyTimer);
        copyTimer = setTimeout(function () { setCopy("idle"); }, 2400);
      }, motionOn() ? 420 : 0);
    }
    copyText(email).then(function () { finish(true); }, function () { finish(false); });
  });

  // ---------- Start ----------
  applyMotion();
  if (motionOn()) {
    name.play();
    // "Say hi." holds as dots until most of it is on screen.
    if ("IntersectionObserver" in window) {
      say.hold("•·● ●·•");
      sayWaiting = true;
      var sayObserver = new IntersectionObserver(function (entries) {
        if (!entries.some(function (en) { return en.isIntersecting; })) return;
        sayObserver.disconnect();
        if (!sayWaiting) return;
        sayWaiting = false;
        say.play();
      }, { threshold: 0.6 });
      sayObserver.observe($("say"));
    }
  }
  $("say").addEventListener("mouseenter", function () {
    if (motionOn() && !say.running() && !sayWaiting) say.play();
  });
})();
