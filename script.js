// Everything interactive lives here. If this file fails to load, every piece of content is
// still in the HTML, so a visitor loses only the terminal and the secrets.
(function () {
  "use strict";

  // ---------- Storage helpers ----------
  // localStorage can throw in private windows or with blocked cookies, so wrap every access.
  function load(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignore */ }
  }
  function $(id) { return document.getElementById(id); }

  // ---------- Styles: poster, rockstar, plain ----------
  // Change DEFAULT_STYLE to pick what a first-time visitor sees.
  var DEFAULT_STYLE = "poster";
  var STYLES = { poster: "Poster", rock: "Rockstar", plain: "Plain" };
  var ORDER = ["poster", "rock", "plain"];
  var modeBtn = $("modeToggle");
  var style = load("style", DEFAULT_STYLE);
  if (!STYLES[style]) style = DEFAULT_STYLE;
  var plain = false;

  // Elements with data-rock="..." swap their text in the rockstar style.
  var swaps = Array.prototype.map.call(document.querySelectorAll("[data-rock]"), function (el) {
    return { el: el, normal: el.textContent, rock: el.dataset.rock };
  });

  function applyMode() {
    plain = style === "plain";
    document.body.classList.toggle("plain", plain);
    document.body.classList.toggle("rock", style === "rock");
    // Drop any colour the Konami code set when leaving the poster style.
    if (style !== "poster") {
      document.body.style.removeProperty("--stage");
      document.body.style.removeProperty("--stage-dot");
    }
    swaps.forEach(function (s) { s.el.textContent = style === "rock" ? s.rock : s.normal; });
    document.querySelectorAll("#styleChoices button").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.style === style));
    });
    modeBtn.textContent = "Style: " + STYLES[style];
    modeBtn.setAttribute("aria-label", "Style: " + STYLES[style] + ". Click to change.");
  }
  function setStyle(next) { style = next; save("style", style); applyMode(); }
  $("styleChoices").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-style]");
    if (b) setStyle(b.dataset.style);
  });
  modeBtn.addEventListener("click", function () {
    setStyle(ORDER[(ORDER.indexOf(style) + 1) % ORDER.length]);
  });

  // ---------- Secrets ----------
  var SECRETS = [
    { id: "shell",  name: "First command",  hint: "Run any command in the terminal." },
    { id: "lore",   name: "Bug hunter",     hint: "Read the bugs I fixed on the headline project." },
    { id: "sudo",   name: "Nice try",       hint: "Ask the terminal for admin rights." },
    { id: "name",   name: "Type lab",       hint: "Click my name a few times." },
    { id: "konami", name: "Old school",     hint: "Up, up, down, down, left, right, left, right, B, A. Try it in Poster." }
  ];
  var found = load("secrets", {});
  var countEl = $("secretCount");
  $("secretTotal").textContent = SECRETS.length;

  function foundCount() { return SECRETS.filter(function (s) { return found[s.id]; }).length; }
  function renderCount() { countEl.textContent = foundCount(); }

  function toast(title, body) {
    var el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = "<strong></strong><span></span>";
    el.querySelector("strong").textContent = title;
    el.querySelector("span").textContent = body;
    $("toasts").appendChild(el);
    setTimeout(function () { el.remove(); }, 3500);
  }

  function unlock(id) {
    if (found[id]) return;
    var s = SECRETS.find(function (x) { return x.id === id; });
    if (!s) return;
    found[id] = true;
    save("secrets", found);
    renderCount();
    toast("Secret " + foundCount() + " of " + SECRETS.length, s.name);
  }

  // Secret: open the bug list.
  var lore = $("loreDetails");
  if (lore) lore.addEventListener("toggle", function () { if (lore.open) unlock("lore"); });

  // Secret: click the name five times. It swaps colours each time after that.
  var nameEl = $("name");
  var nameClicks = 0;
  nameEl.addEventListener("click", function () {
    nameClicks += 1;
    if (nameClicks >= 5) { nameEl.classList.toggle("party"); unlock("name"); }
  });

  // Secret: the Konami code. In the poster style it also cycles the background colour.
  var STAGES = ["#2231d8", "#ff5233", "#11121a", "#1f9e6e"];
  var stageIndex = 0;
  var CODE = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
  var pos = 0;
  document.addEventListener("keydown", function (e) {
    var key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    pos = key === CODE[pos] ? pos + 1 : (key === CODE[0] ? 1 : 0);
    if (pos === CODE.length) {
      pos = 0;
      unlock("konami");
      if (style !== "poster") return toast("Old school", "Switch to the Poster style to see the colours change.");
      stageIndex = (stageIndex + 1) % STAGES.length;
      document.body.style.setProperty("--stage", STAGES[stageIndex]);
      document.body.style.setProperty("--stage-dot", "rgba(255,255,255,0.08)");
    }
  });

  // ---------- Terminal ----------
  // It reads projects straight from the HTML, so the page is the single source of truth.
  var out = $("termOut");
  var input = $("termInput");

  var projects = Array.prototype.map.call(document.querySelectorAll(".project"), function (card) {
    var stats = {};
    card.querySelectorAll(".stats div").forEach(function (d) {
      stats[d.querySelector("dt").textContent.toLowerCase()] = d.querySelector("dd").textContent;
    });
    var source = Array.prototype.find.call(card.querySelectorAll(".links a"), function (a) {
      return /source/i.test(a.textContent);
    });
    return {
      name: card.querySelector("h3").textContent.trim(),
      summary: card.querySelector("h3 + p").textContent.replace(/\s+/g, " ").trim(),
      stats: stats,
      source: source ? source.href : null
    };
  });
  function findProject(name) {
    name = (name || "").toLowerCase();
    return projects.find(function (p) { return p.name.toLowerCase() === name; });
  }

  function print(text, cls) {
    var line = document.createElement("div");
    if (cls) line.className = cls;
    line.textContent = text;
    out.appendChild(line);
    out.scrollTop = out.scrollHeight;
  }
  function printLink(label, href) {
    var line = document.createElement("div");
    var a = document.createElement("a");
    a.href = href; a.textContent = label; a.rel = "noopener"; a.target = "_blank";
    line.appendChild(a);
    out.appendChild(line);
    out.scrollTop = out.scrollHeight;
  }

  var COMMANDS = {
    help: function () {
      print([
        "whoami               who I am",
        "ls                   list projects",
        "cat <project>        details of one project",
        "open <project>       link to its source code",
        "curl /api/projects   all projects as JSON",
        "skills               tools I have used",
        "contact              how to reach me",
        "contributions        my GitHub activity this year",
        "secrets              what you have found so far",
        "style <name>         poster, rock or plain",
        "clear                clear the screen",
        "",
        "Tab completes commands and project names. Up and down repeat earlier commands."
      ].join("\n"));
    },
    whoami: function () {
      print(nameEl.textContent.replace(/\s+/g, " ").trim(), "hi");
      print(document.querySelector(".role").textContent.replace(/\s+/g, " ").trim());
    },
    ls: function () { print(projects.map(function (p) { return p.name; }).join("    ")); },
    cat: function (arg) {
      var p = findProject(arg);
      if (!p) return print("cat: " + (arg || "") + ": no such project. Try ls.", "err");
      var lines = [p.summary, ""];
      Object.keys(p.stats).forEach(function (k) { lines.push(k + ": " + p.stats[k]); });
      print(p.name, "hi");
      print(lines.join("\n"));
    },
    open: function (arg) {
      var p = findProject(arg);
      if (!p || !p.source) return print("open: " + (arg || "") + ": no such project. Try ls.", "err");
      print("Source code for " + p.name + ":");
      printLink(p.source, p.source);
    },
    curl: function (arg) {
      if (arg !== "/api/projects") return print("curl: try curl /api/projects", "err");
      print("HTTP/1.1 200 OK\ncontent-type: application/json\n");
      print(JSON.stringify(projects, null, 2));
    },
    skills: function () {
      print(Array.prototype.map.call(document.querySelectorAll(".skill-group"), function (g) {
        var items = Array.prototype.map.call(g.querySelectorAll("li"), function (li) { return li.textContent; });
        return g.querySelector("h3").textContent + ": " + items.join(", ");
      }).join("\n"));
    },
    contact: function () {
      var email = document.querySelector(".contact__email a");
      print("email: " + email.textContent);
      document.querySelectorAll(".contact .btn").forEach(function (a) { print(a.textContent.toLowerCase() + ": " + a.href); });
    },
    contributions: function () {
      if (!activity) return print("contributions: no data here yet. It loads on the live site.", "err");
      var days = [];
      activity.weeks.forEach(function (w) { days = days.concat(w); });
      var busiest = days.reduce(function (a, b) { return b.count > a.count ? b : a; }, days[0]);
      var s = streaks(days);
      print("git log --since='1 year ago' --author=" + activity.login, "hi");
      print([
        "total:          " + activity.total,
        "active days:    " + days.filter(function (d) { return d.count > 0; }).length + " of " + days.length,
        "busiest day:    " + busiest.date + " (" + busiest.count + ")",
        "longest streak: " + plural(s.best, "day"),
        "current streak: " + plural(s.current, "day"),
        "updated:        " + activity.updated
      ].join("\n"));
    },
    secrets: function () {
      print("Found " + foundCount() + " of " + SECRETS.length + ":", "hi");
      SECRETS.forEach(function (s) {
        print((found[s.id] ? "[x] " + s.name : "[ ] ???") + "    hint: " + s.hint);
      });
    },
    sudo: function () {
      print("Permission denied. Nice try, though.", "err");
      print("If you want admin rights, the contact command is the way in.");
      unlock("sudo");
    },
    style: function (arg) {
      arg = (arg || "").toLowerCase();
      if (arg === "rockstar") arg = "rock";
      if (!STYLES[arg]) return print("style: pick one of poster, rock, plain. Now: " + style, "err");
      setStyle(arg);
      print("Style is now " + STYLES[style] + ".");
    },
    clear: function () { out.innerHTML = ""; }
  };
  var NAMES = Object.keys(COMMANDS).filter(function (c) { return c !== "sudo"; });

  var history = [];
  var histPos = 0;

  function run(line) {
    line = line.trim();
    if (!line) return;
    history.push(line);
    histPos = history.length;
    print("$ " + line, "cmd");
    var parts = line.split(/\s+/);
    var cmd = parts[0].toLowerCase();
    if (Object.prototype.hasOwnProperty.call(COMMANDS, cmd)) {
      COMMANDS[cmd](parts.slice(1).join(" "));
      unlock("shell");
    } else {
      print(cmd + ": command not found. Type help.", "err");
    }
  }

  $("termForm").addEventListener("submit", function (e) {
    e.preventDefault();
    run(input.value);
    input.value = "";
  });

  input.addEventListener("keydown", function (e) {
    if (e.key === "ArrowUp" && history.length) {
      e.preventDefault();
      histPos = Math.max(0, histPos - 1);
      input.value = history[histPos];
    } else if (e.key === "ArrowDown" && history.length) {
      e.preventDefault();
      histPos = Math.min(history.length, histPos + 1);
      input.value = history[histPos] || "";
    } else if (e.key === "Tab") {
      // Complete the command, or the project name after cat/open.
      var parts = input.value.split(" ");
      var pool = parts.length === 1 ? NAMES : projects.map(function (p) { return p.name; });
      var word = parts[parts.length - 1].toLowerCase();
      var matches = pool.filter(function (n) { return n.toLowerCase().indexOf(word) === 0; });
      if (matches.length === 1) {
        e.preventDefault();
        parts[parts.length - 1] = matches[0];
        input.value = parts.join(" ") + (parts.length === 1 ? " " : "");
      } else if (matches.length > 1) {
        e.preventDefault();
        print(matches.join("    "));
      }
      // No match: let Tab move focus as normal, so keyboard users are never trapped.
    }
  });

  $("termChips").addEventListener("click", function (e) {
    var btn = e.target.closest("button[data-cmd]");
    if (btn) run(btn.dataset.cmd);
  });

  // The secrets counter jumps to the terminal and lists them.
  $("secretsBtn").addEventListener("click", function () {
    $("terminal").scrollIntoView({ behavior: "smooth", block: "start" });
    run("secrets");
  });

  // Backtick jumps to the terminal from anywhere.
  document.addEventListener("keydown", function (e) {
    var typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
    if (e.key === "`" && !typing) {
      e.preventDefault();
      $("terminal").scrollIntoView({ behavior: "smooth", block: "start" });
      input.focus({ preventScroll: true });
    }
  });

  // ---------- Activity chart ----------
  // data/contributions.json is written once a day by the GitHub Action in
  // .github/workflows/deploy.yml. It only exists on the live site, so opening
  // index.html straight from disk shows the fallback text instead.
  var activity = null;
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function plural(n, word) { return n + " " + word + (n === 1 ? "" : "s"); }

  // Longest and current runs of days with at least one contribution.
  function streaks(days) {
    var best = 0, run = 0;
    days.forEach(function (d) { run = d.count > 0 ? run + 1 : 0; best = Math.max(best, run); });
    var current = 0;
    for (var i = days.length - 1; i >= 0 && days[i].count > 0; i--) current++;
    return { best: best, current: current };
  }

  function drawActivity(data, isSample) {
    activity = data;
    var grid = $("activityGrid");
    var days = [];
    var lastMonth = -1;
    grid.textContent = "";
    data.weeks.forEach(function (week, w) {
      week.forEach(function (day) {
        var date = new Date(day.date + "T00:00:00Z");
        var cell = document.createElement("i");
        cell.dataset.l = day.level;
        cell.style.gridColumn = String(w + 1);
        cell.style.gridRow = String(date.getUTCDay() + 2);
        cell.title = plural(day.count, "contribution") + " on " + day.date;
        grid.appendChild(cell);
        days.push(day);
      });
      // A month label above the first week that starts in a new month.
      var month = new Date(week[0].date + "T00:00:00Z").getUTCMonth();
      if (month !== lastMonth && w < data.weeks.length - 2) {
        var label = document.createElement("span");
        label.className = "activity__month";
        label.textContent = MONTHS[month];
        label.style.gridColumn = (w + 1) + " / span 3";
        label.style.gridRow = "1";
        grid.appendChild(label);
        lastMonth = month;
      }
    });
    var active = days.filter(function (d) { return d.count > 0; }).length;
    var s = streaks(days);
    var summary = $("activitySummary");
    summary.innerHTML = "<b></b> in the last year<small></small>";
    summary.querySelector("b").textContent = plural(data.total, "contribution");
    summary.querySelector("small").textContent =
      "Active on " + plural(active, "day") + ". Longest streak: " + plural(s.best, "day") +
      ". Updated " + data.updated + ".";
    if (isSample) {
      var badge = document.createElement("span");
      badge.className = "activity__badge";
      badge.textContent = "Sample data";
      summary.querySelector("b").after(badge);
    }
    grid.setAttribute("aria-label", plural(data.total, "contribution") + " on GitHub in the last year, active on " + plural(active, "day") + ".");
    // On narrow screens the chart scrolls sideways; start at the most recent weeks.
    var scroller = $("activityScroll");
    scroller.scrollLeft = scroller.scrollWidth;
  }

  function activityFallback() {
    $("activityScroll").hidden = true;
    document.querySelector(".activity__legend").hidden = true;
    $("activitySummary").textContent =
      "The chart appears on the live site, where it refreshes daily. Until then, see the full history on GitHub.";
  }

  if (window.SAMPLE_CONTRIBUTIONS) {
    drawActivity(window.SAMPLE_CONTRIBUTIONS, true);
  } else if (window.fetch && location.protocol !== "file:") {
    $("activitySummary").textContent = "Loading contributions...";
    fetch("data/contributions.json", { cache: "no-cache" })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (data) { drawActivity(data, false); })
      .catch(activityFallback);
  } else {
    activityFallback();
  }

  // ---------- Copy email ----------
  // mailto links do nothing on computers without a mail app, so offer a copy button too.
  var copyBtn = $("copyEmail");
  if (copyBtn && navigator.clipboard) {
    copyBtn.hidden = false;
    copyBtn.addEventListener("click", function () {
      var email = document.querySelector(".contact__email a").textContent.trim();
      navigator.clipboard.writeText(email).then(function () {
        copyBtn.textContent = "Copied";
        setTimeout(function () { copyBtn.textContent = "Copy"; }, 2000);
      }, function () { toast("Copy failed", "Select the address and copy it by hand."); });
    });
  }

  // ---------- Current section in the nav ----------
  // Highlights the section you are reading, so the sticky sidebar doubles as a map.
  var navLinks = Array.prototype.slice.call(document.querySelectorAll(".nav a"));
  var navTicking = false;
  function markCurrent() {
    navTicking = false;
    var line = window.innerHeight * 0.35;
    var atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
    var current = null;
    navLinks.forEach(function (a) {
      var el = document.querySelector(a.hash);
      if (el && (atEnd || el.getBoundingClientRect().top <= line)) current = a;
    });
    navLinks.forEach(function (a) {
      if (a === current) a.setAttribute("aria-current", "true");
      else a.removeAttribute("aria-current");
    });
  }
  window.addEventListener("scroll", function () {
    if (!navTicking) { navTicking = true; requestAnimationFrame(markCurrent); }
  }, { passive: true });
  markCurrent();

  // ---------- Start ----------
  applyMode();
  renderCount();
  out.textContent = "";  // drop the no-JavaScript message
  print("Welcome. This terminal answers from the page you are reading.", "hi");
  print("Type help, or click a command below.");
  // The backtick shortcut only makes sense with a keyboard.
  if (window.matchMedia && matchMedia("(pointer: fine)").matches) print("Press ` anywhere to jump here.");
})();
