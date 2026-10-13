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

  // ---------- Plain mode ----------
  var modeBtn = $("modeToggle");
  var plain = load("plain", false);
  function applyMode() {
    document.body.classList.toggle("plain", plain);
    if (plain) {
      // Undo any colour the Konami code set, so plain mode is really plain.
      document.body.style.removeProperty("--stage");
      document.body.style.removeProperty("--stage-dot");
    }
    modeBtn.textContent = "Plain mode: " + (plain ? "on" : "off");
    modeBtn.setAttribute("aria-pressed", String(plain));
  }
  modeBtn.addEventListener("click", function () { plain = !plain; save("plain", plain); applyMode(); });

  // ---------- Secrets ----------
  var SECRETS = [
    { id: "shell",  name: "First command",  hint: "Run any command in the terminal." },
    { id: "lore",   name: "Bug hunter",     hint: "Read the bugs I fixed on the headline project." },
    { id: "sudo",   name: "Nice try",       hint: "Ask the terminal for admin rights." },
    { id: "name",   name: "Type lab",       hint: "Click my name a few times." },
    { id: "konami", name: "Old school",     hint: "Up, up, down, down, left, right, left, right, B, A." }
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

  // Secret: the Konami code cycles the background colour.
  var STAGES = ["#2231d8", "#ff5233", "#11121a", "#1f9e6e"];
  var stageIndex = 0;
  var CODE = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
  var pos = 0;
  document.addEventListener("keydown", function (e) {
    var key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    pos = key === CODE[pos] ? pos + 1 : (key === CODE[0] ? 1 : 0);
    if (pos === CODE.length) {
      pos = 0;
      if (plain) return;
      stageIndex = (stageIndex + 1) % STAGES.length;
      document.body.style.setProperty("--stage", STAGES[stageIndex]);
      document.body.style.setProperty("--stage-dot", "rgba(255,255,255,0.08)");
      unlock("konami");
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
        "secrets              what you have found so far",
        "plain                switch plain mode on or off",
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
    plain: function () { modeBtn.click(); print("Plain mode is " + (plain ? "on." : "off.")); },
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

  // ---------- Start ----------
  applyMode();
  renderCount();
  out.textContent = "";  // drop the no-JavaScript message
  print("Welcome. This terminal answers from the page you are reading.", "hi");
  print("Type help, or click a command below. Press ` anywhere to jump here.");
})();
