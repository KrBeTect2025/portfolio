// Everything interactive lives here. If this file fails to load, every piece of content is
// still in the HTML, so a visitor loses only the command palette and the secrets.
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

  // ---------- Motion ----------
  // Every entrance animation is opt-in: the "motion" class only goes on when the browser can
  // reveal things again (IntersectionObserver) and the visitor has not asked for less motion.
  var reduceMotion = window.matchMedia ? matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  var canReveal = "IntersectionObserver" in window && !reduceMotion.matches;
  if (canReveal) document.documentElement.classList.add("motion");

  // Splits a heading into one span per letter so they can rise one after another.
  // Screen readers get the whole word from the hidden copy, never single letters.
  function splitLetters(el) {
    var text = el.textContent;
    el.textContent = "";
    var sr = document.createElement("span");
    sr.className = "sr-only";
    sr.textContent = text;
    var shown = document.createElement("span");
    shown.setAttribute("aria-hidden", "true");
    // Letters sit inside one span per word, so the line can still wrap between words.
    var i = 0;
    text.split(" ").forEach(function (word, w) {
      if (w) shown.appendChild(document.createTextNode(" "));
      var box = document.createElement("span");
      box.className = "word";
      Array.prototype.forEach.call(word, function (ch) {
        var l = document.createElement("span");
        l.className = "l";
        l.style.setProperty("--i", i++);
        l.textContent = ch;
        box.appendChild(l);
      });
      shown.appendChild(box);
    });
    el.append(sr, shown);
  }

  // Wraps each word in a span so the line can stream in word by word on load.
  function splitWords(el) {
    var i = 0;
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (child) {
        if (child.nodeType === 1) return walk(child);
        if (child.nodeType !== 3) return;
        var frag = document.createDocumentFragment();
        child.textContent.split(/(\s+)/).forEach(function (part) {
          if (!part) return;
          if (/^\s+$/.test(part)) return frag.appendChild(document.createTextNode(part));
          var w = document.createElement("span");
          w.className = "w";
          w.style.setProperty("--i", i++);
          w.textContent = part;
          frag.appendChild(w);
        });
        child.replaceWith(frag);
      });
    })(el);
  }
  if (canReveal) document.querySelectorAll("[data-stream]").forEach(splitWords);

  // ---------- Styles: poster, rockstar, plain ----------
  // Change DEFAULT_STYLE to pick what a first-time visitor sees.
  var DEFAULT_STYLE = "poster";
  var STYLES = { poster: "Poster", rock: "Rockstar", plain: "Plain" };
  var STYLE_NOTES = { poster: "Cobalt, paper and stickers", rock: "A gig poster, black and red", plain: "Calm and quiet" };
  var THEME_COLORS = { poster: "#2231d8", rock: "#0d0b0b", plain: "#f4f4f1" };
  var ORDER = ["poster", "rock", "plain"];
  var modeBtn = $("modeToggle");
  var themeMeta = document.querySelector('meta[name="theme-color"]');
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
    swaps.forEach(function (s) {
      s.el.textContent = style === "rock" ? s.rock : s.normal;
      if (canReveal && s.el.hasAttribute("data-letters")) splitLetters(s.el);
    });
    document.querySelectorAll("#styleChoices button").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.style === style));
    });
    modeBtn.textContent = "Style: " + STYLES[style];
    modeBtn.setAttribute("aria-label", "Style: " + STYLES[style] + ". Click to change.");
    if (themeMeta) themeMeta.content = THEME_COLORS[style];
  }

  // Where a style change should ripple out from: the pointer, or the middle of the control
  // that was pressed with a keyboard (keyboard clicks report 0, 0).
  function originOf(e, el) {
    if (e && e.clientX) return { x: e.clientX, y: e.clientY };
    var r = (el || document.body).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  // The new style spreads out as a circle from where you clicked. Browsers without
  // view transitions, and visitors who prefer less motion, get an instant switch.
  function setStyle(next, origin) {
    if (next === style) return;
    // The choice is stored at once, so quick repeated clicks always step forward.
    style = next;
    save("style", style);
    if (!document.startViewTransition || reduceMotion.matches) return applyMode();
    var x = origin ? origin.x : innerWidth / 2;
    var y = origin ? origin.y : innerHeight / 2;
    var r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    var t = document.startViewTransition(applyMode);
    t.ready.then(function () {
      document.documentElement.animate(
        { clipPath: ["circle(0px at " + x + "px " + y + "px)", "circle(" + r + "px at " + x + "px " + y + "px)"] },
        { duration: 700, easing: "cubic-bezier(.65, 0, .35, 1)", pseudoElement: "::view-transition-new(root)" }
      );
    }).catch(function () { /* the style is applied either way */ });
  }
  $("styleChoices").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-style]");
    if (b) setStyle(b.dataset.style, originOf(e, b));
  });
  modeBtn.addEventListener("click", function (e) {
    setStyle(ORDER[(ORDER.indexOf(style) + 1) % ORDER.length], originOf(e, modeBtn));
  });

  // ---------- Secrets ----------
  var SECRETS = [
    { id: "shell",  name: "First jump",     hint: "Open anything from the palette. Press / to start." },
    { id: "lore",   name: "Bug hunter",     hint: "Read the bugs I fixed on the headline project." },
    { id: "sudo",   name: "Nice try",       hint: "Ask the palette for admin rights." },
    { id: "name",   name: "Type lab",       hint: "Click my name a few times." },
    { id: "konami", name: "Old school",     hint: "Up, up, down, down, left, right, left, right, B, A. Try it in Poster." },
    { id: "sticker", name: "Rearranged",    hint: "Some things on this page are not glued down." }
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

  // ---------- Stickers (the skills section) ----------
  // Pressing a sticker shows where that tool was used. Stickers can also be moved: drag with a
  // mouse, press and hold then drag on a touch screen, or focus one and use the arrow keys.
  var lid = $("lid");
  var decals = Array.prototype.slice.call(document.querySelectorAll(".decal"));
  var picked = null;
  var zTop = 1;
  var REPO = "https://github.com/KrBeTect2025/portfolio";

  decals.forEach(function (d, i) { d.parentElement.style.setProperty("--i", i); });
  if (!plain) $("decalHint").hidden = false;

  function decalName(d) { return d.dataset.full || clean(d.textContent); }
  function projectCard(title) {
    return Array.prototype.find.call(document.querySelectorAll(".project"), function (c) {
      return clean(c.querySelector("h3").textContent) === title;
    });
  }
  function raise(d) { d.parentElement.style.zIndex = ++zTop; }

  function pick(d) {
    if (picked) picked.setAttribute("aria-pressed", "false");
    picked = picked === d ? null : d;
    lid.classList.toggle("has-pick", !!picked);
    $("decalEmpty").hidden = !!picked;
    $("decalBody").hidden = !picked;
    if (!picked) return;
    d.setAttribute("aria-pressed", "true");
    raise(d);
    var logo = $("decalLogo");
    logo.style.setProperty("--bg", d.style.getPropertyValue("--bg"));
    logo.style.setProperty("--fg", d.style.getPropertyValue("--fg"));
    logo.querySelector("use").setAttribute("href", "#i-" + d.dataset.tool);
    $("decalGroup").textContent = d.dataset.group;
    $("decalName").textContent = decalName(d);
    $("decalNote").textContent = d.dataset.note;
    var used = $("decalUsed");
    used.textContent = "Used in";
    d.dataset.used.split(/,\s*/).forEach(function (title) {
      var el;
      if (title === "this site") {
        el = document.createElement("a");
        el.href = REPO; el.target = "_blank"; el.rel = "noopener";
        el.setAttribute("aria-describedby", "newTab");
        el.textContent = "this site";
      } else {
        el = document.createElement("button");
        el.type = "button";
        el.textContent = title;
        el.addEventListener("click", function () { jump(projectCard(title)); });
      }
      used.appendChild(el);
    });
  }

  function moved() {
    $("decalTidy").hidden = false;
    unlock("sticker");
  }
  // Keeps a sticker inside the lid. rect is where the sticker sat when the move started.
  function clampTo(rect, box, dx, dy, start) {
    return {
      x: Math.min(Math.max(dx, start.x + box.left - rect.left), start.x + box.right - rect.right),
      y: Math.min(Math.max(dy, start.y + box.top - rect.top), start.y + box.bottom - rect.bottom)
    };
  }
  function offset(d) {
    return { x: parseFloat(d.style.getPropertyValue("--dx")) || 0, y: parseFloat(d.style.getPropertyValue("--dy")) || 0 };
  }
  function place(d, p) {
    d.style.setProperty("--dx", Math.round(p.x) + "px");
    d.style.setProperty("--dy", Math.round(p.y) + "px");
  }

  var drag = null;      // the move in progress, if any
  var skipClick = null; // a sticker that was just dropped, so its click does not count as a press
  lid.addEventListener("pointerdown", function (e) {
    var d = e.target.closest(".decal");
    if (!d || plain || e.button !== 0) return;
    drag = { d: d, id: e.pointerId, x: e.clientX, y: e.clientY, start: offset(d), rect: d.getBoundingClientRect(),
      box: lid.getBoundingClientRect(), touch: e.pointerType === "touch", live: false, timer: null };
    if (drag.touch) {
      var mine = drag;
      drag.timer = setTimeout(function () {
        mine.live = true;
        d.classList.add("is-held");
        raise(d);
        if (navigator.vibrate) navigator.vibrate(12);
      }, 320);
    }
  });
  lid.addEventListener("pointermove", function (e) {
    if (!drag || e.pointerId !== drag.id) return;
    var mx = e.clientX - drag.x, my = e.clientY - drag.y;
    if (!drag.live) {
      // A touch that moves before the hold is a scroll. A mouse starts dragging after 5px.
      if (Math.hypot(mx, my) < (drag.touch ? 8 : 5)) return;
      if (drag.touch) { clearTimeout(drag.timer); drag = null; return; }
      drag.live = true;
      drag.d.classList.add("is-held");
      raise(drag.d);
    }
    if (!drag.d.hasPointerCapture(e.pointerId)) drag.d.setPointerCapture(e.pointerId);
    place(drag.d, clampTo(drag.rect, drag.box, drag.start.x + mx, drag.start.y + my, drag.start));
  });
  function endDrag(e) {
    if (!drag || e.pointerId !== drag.id) return;
    clearTimeout(drag.timer);
    if (drag.live) {
      drag.d.classList.remove("is-held");
      var p = offset(drag.d);
      if (p.x !== drag.start.x || p.y !== drag.start.y) { skipClick = drag.d; moved(); }
    }
    drag = null;
  }
  lid.addEventListener("pointerup", endDrag);
  lid.addEventListener("pointercancel", endDrag);
  // While a sticker is held on a touch screen, the finger moves the sticker, not the page.
  lid.addEventListener("touchmove", function (e) { if (drag && drag.live) e.preventDefault(); }, { passive: false });
  lid.addEventListener("contextmenu", function (e) { if (e.target.closest(".decal")) e.preventDefault(); });

  lid.addEventListener("click", function (e) {
    var d = e.target.closest(".decal");
    if (!d) return;
    if (skipClick === d) { skipClick = null; return; }
    skipClick = null;
    pick(d);
  });
  var NUDGE = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  lid.addEventListener("keydown", function (e) {
    var d = e.target.closest(".decal");
    var step = NUDGE[e.key];
    if (!d || !step || plain || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    var start = offset(d);
    var size = e.shiftKey ? 48 : 16;
    place(d, clampTo(d.getBoundingClientRect(), lid.getBoundingClientRect(), start.x + step[0] * size, start.y + step[1] * size, start));
    raise(d);
    moved();
  });
  $("decalTidy").addEventListener("click", function () {
    decals.forEach(function (d) { place(d, { x: 0, y: 0 }); });
    $("decalTidy").hidden = true;
  });

  // ---------- Command palette ----------
  // A pill at the bottom of the screen that grows into a search box. Everything in it is read
  // from this page (sections, projects, links), so the HTML stays the single source of truth.
  var panel = $("palette");
  var overlay = $("paletteOverlay");
  var menu = $("paletteMenu");
  var list = $("paletteList");
  var hl = $("paletteHl");
  var trigger = $("paletteTrigger");
  var search = $("paletteSearch");
  var input = $("paletteInput");
  var status = $("paletteStatus");
  var isOpen = false;
  var view = "main";      // "main", or "secrets" for the list of secrets
  var shown = [];         // the items currently in the list, in order
  var active = 0;         // index into shown
  var lastFocus = null;

  // Small line icons, drawn on a 24px grid.
  var ICONS = {
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
    brush: '<path d="M14 4l6 6-8.5 8.5a3 3 0 0 1-4.2 0l-1.8-1.8a3 3 0 0 1 0-4.2z"/><path d="M4 20c1.5 0 3-1 3-3"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    hash: '<path d="M5 9h15M4 15h15M10 3 8 21M16 3l-2 18"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    out: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    check: '<path d="m5 12 5 5L20 7"/>',
    back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    tag: '<path d="M12 3 20 7.5v9L12 21l-8-4.5v-9z"/><circle cx="12" cy="12" r="2.5"/>'
  };
  function icon(name) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICONS[name] + "</svg>";
  }
  function clean(text) { return (text || "").replace(/\s+/g, " ").trim(); }

  var SECTION_NOTES = {
    activity: "My GitHub contributions",
    projects: "Things I have built",
    skills: "Tools I have used",
    about: "A little about me",
    contact: "Email and links"
  };

  // Scroll to a section or card, then hand it keyboard focus so Tab carries on from there.
  function jump(el) {
    if (!el) return;
    if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
    el.scrollIntoView({ behavior: reduceMotion.matches ? "auto" : "smooth", block: "start" });
    el.focus({ preventScroll: true });
    if (el.classList.contains("project")) {
      el.classList.remove("is-found");
      void el.offsetWidth;  // restart the animation if it is already there
      el.classList.add("is-found");
      setTimeout(function () { el.classList.remove("is-found"); }, 1600);
    }
    return el;
  }

  function contactEmail() { return document.querySelector(".contact__email a").textContent.trim(); }

  function mainItems() {
    var items = [];
    items.push({ group: "Quick actions", label: "Say hi", detail: "Jump to my contact details", icon: "mail",
      run: function () { return jump($("contact")); } });
    if (navigator.clipboard) {
      items.push({ group: "Quick actions", label: "Copy my email", detail: contactEmail(), icon: "copy",
        run: function () {
          navigator.clipboard.writeText(contactEmail()).then(function () {
            toast("Copied", contactEmail());
          }, function () { toast("Copy failed", "Select the address and copy it by hand."); });
        } });
    }
    ORDER.forEach(function (s) {
      if (s === style) return;
      items.push({ group: "Quick actions", label: "Switch to " + STYLES[s], detail: STYLE_NOTES[s], icon: "brush",
        words: "style theme look", run: function (origin) { setStyle(s, origin); } });
    });
    items.push({ group: "Quick actions", label: "Secrets", detail: "Found " + foundCount() + " of " + SECRETS.length,
      icon: "star", words: "game hidden easter eggs", keep: true, run: function () { setView("secrets"); } });

    document.querySelectorAll(".nav a").forEach(function (a) {
      var id = a.hash.slice(1);
      var detail = SECTION_NOTES[id] || "";
      if (id === "activity" && activity) detail = plural(activity.total, "contribution") + " in the last year";
      items.push({ group: "Sections", label: clean(a.textContent), detail: detail, icon: "hash",
        run: function () { return jump(document.getElementById(id)); } });
    });

    document.querySelectorAll(".project").forEach(function (card) {
      items.push({ group: "Projects", label: clean(card.querySelector("h3").textContent),
        detail: clean(card.querySelector(".project__tag").textContent), icon: "folder",
        run: function () { return jump(card); } });
    });

    // Outside links: the contact buttons, plus any live demo.
    var seen = {};
    var links = Array.prototype.slice.call(document.querySelectorAll(".contact .btn, .project .links a"))
      .filter(function (a) { return a.closest(".contact") || /demo/i.test(a.textContent); });
    links.forEach(function (a) {
      if (seen[a.href]) return;
      seen[a.href] = true;
      var card = a.closest(".project");
      items.push({ group: "Elsewhere", label: card ? clean(card.querySelector("h3").textContent) + " demo" : clean(a.textContent),
        detail: a.href.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""), icon: "out", href: a.href });
    });

    // Tools: only once you type, so the list does not open with fifteen stickers in it.
    decals.forEach(function (d) {
      items.push({ group: "Tools", label: decalName(d), detail: "Used in " + d.dataset.used, icon: "tag", needsQuery: true,
        words: d.dataset.group + " skills sticker", run: function () {
          jump($("skills"));
          if (picked !== d) pick(d);
          d.focus({ preventScroll: true });
          return d;
        } });
    });

    // Hidden: only shows up when typed exactly. One of the five secrets.
    items.push({ group: "Hmm", label: "Permission denied", detail: "Nice try, though. The contact section is the way in.",
      icon: "lock", hidden: /^sudo(\s|$)/i, keep: true, run: function () { unlock("sudo"); } });
    return items;
  }

  function secretItems() {
    var items = [{ group: "Secrets", label: "Back", detail: "Return to everything", icon: "back", keep: true,
      run: function () { setView("main"); } }];
    SECRETS.forEach(function (s) {
      var got = !!found[s.id];
      items.push({ group: "Found " + foundCount() + " of " + SECRETS.length, label: got ? s.name : "Not found yet",
        detail: s.hint, icon: got ? "check" : "lock", keep: true, inert: true });
    });
    return items;
  }

  function filter(items, query) {
    var q = query.trim().toLowerCase();
    var words = q.split(/\s+/).filter(Boolean);
    return items.filter(function (it) {
      if (it.hidden) return it.hidden.test(q);
      if (it.needsQuery && !q) return false;
      var hay = (it.label + " " + it.detail + " " + it.group + " " + (it.words || "")).toLowerCase();
      return words.every(function (w) { return hay.indexOf(w) !== -1; });
    });
  }

  function render() {
    shown = filter(view === "secrets" ? secretItems() : mainItems(), view === "secrets" ? "" : input.value);
    active = Math.min(active, Math.max(shown.length - 1, 0));
    Array.prototype.slice.call(list.children).forEach(function (c) { if (c !== hl) c.remove(); });
    var group = null;
    var box = null;
    shown.forEach(function (it, i) {
      if (it.group !== group) {
        group = it.group;
        box = document.createElement("div");
        box.setAttribute("role", "group");
        var label = document.createElement("div");
        label.className = "cmdk__group";
        label.id = "palette-g" + i;
        label.textContent = group;
        box.setAttribute("aria-labelledby", label.id);
        box.appendChild(label);
        list.appendChild(box);
      }
      var opt = document.createElement("div");
      opt.className = "cmdk__item";
      opt.id = "palette-o" + i;
      opt.setAttribute("role", "option");
      opt.dataset.index = i;
      opt.innerHTML = '<span class="cmdk__icon"></span><span class="cmdk__label"></span><span class="cmdk__detail"></span>';
      opt.querySelector(".cmdk__icon").innerHTML = icon(it.icon);
      opt.querySelector(".cmdk__label").textContent = it.label;
      opt.querySelector(".cmdk__detail").textContent = it.detail;
      if (it.href) {
        opt.insertAdjacentHTML("beforeend", '<span class="cmdk__go" aria-hidden="true">&#8599;</span><span class="sr-only">Opens in a new tab.</span>');
      } else if (!it.inert) {
        opt.insertAdjacentHTML("beforeend", '<span class="cmdk__go" aria-hidden="true">&rarr;</span>');
      }
      box.appendChild(opt);
    });
    if (!shown.length) {
      var empty = document.createElement("p");
      empty.className = "cmdk__empty";
      empty.textContent = "Nothing here. Try “projects” or “style”.";
      list.appendChild(empty);
    }
    status.textContent = shown.length ? plural(shown.length, "result") : "No results";
    highlight(true);
  }

  // Moves the coloured block behind the active row. It slides, rather than jumping,
  // because only its position changes; the rows themselves never move.
  function highlight(instant) {
    list.querySelectorAll('[aria-selected="true"]').forEach(function (o) { o.setAttribute("aria-selected", "false"); });
    var opt = $("palette-o" + active);
    if (!opt) {
      hl.style.opacity = "0";
      input.removeAttribute("aria-activedescendant");
      return;
    }
    opt.setAttribute("aria-selected", "true");
    input.setAttribute("aria-activedescendant", opt.id);
    if (instant) hl.classList.add("is-instant");
    hl.style.opacity = "1";
    hl.style.transform = "translateY(" + opt.offsetTop + "px)";
    hl.style.height = opt.offsetHeight + "px";
    if (instant) { void hl.offsetWidth; hl.classList.remove("is-instant"); }
    opt.scrollIntoView({ block: "nearest" });
  }

  function setView(next) {
    view = next;
    active = next === "secrets" ? 1 : 0;
    input.value = "";
    input.placeholder = next === "secrets" ? "Esc to go back" : "Where would you like to go?";
    input.readOnly = next === "secrets";
    render();
  }

  // Everything except the palette and the toasts goes inert while it is open,
  // so Tab, clicks and screen readers stay inside the dialog.
  var outside = Array.prototype.filter.call(document.body.children, function (el) {
    return el !== panel && el !== overlay && el.id !== "toasts" && el.tagName !== "SCRIPT";
  });

  function openPalette(startView) {
    if (isOpen) return;
    isOpen = true;
    lastFocus = document.activeElement;
    stopTyping();
    panel.classList.remove("is-tucked");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-label", "Search this page");
    trigger.hidden = true;
    search.hidden = false;
    menu.inert = false;
    outside.forEach(function (el) { el.inert = true; });
    document.documentElement.classList.add("cmdk-locked");
    setView(startView || "main");
    panel.classList.add("is-open");
    overlay.classList.add("is-open");
    input.focus({ preventScroll: true });
    highlight(true);
  }

  function closePalette(focusTarget) {
    if (!isOpen) return;
    isOpen = false;
    panel.classList.remove("is-open");
    overlay.classList.remove("is-open");
    panel.removeAttribute("role");
    panel.removeAttribute("aria-modal");
    panel.removeAttribute("aria-label");
    menu.inert = true;
    search.hidden = true;
    trigger.hidden = false;
    outside.forEach(function (el) { el.inert = false; });
    document.documentElement.classList.remove("cmdk-locked");
    status.textContent = "";
    var back = focusTarget || (lastFocus && lastFocus !== document.body && lastFocus.isConnected ? lastFocus : trigger);
    back.focus({ preventScroll: !!focusTarget });
    startTyping();
  }

  function choose(i) {
    var it = shown[i];
    if (!it || it.inert) return;
    if (it.keep) return it.run();
    // Ripple a style change out from the palette's input, where the eye already is.
    var origin = originOf(null, search);
    closePalette(it.href ? null : document.body);
    unlock("shell");
    if (it.href) return window.open(it.href, "_blank", "noopener");
    var target = it.run(origin);
    if (!target) (lastFocus && lastFocus !== document.body && lastFocus.isConnected ? lastFocus : trigger).focus();
  }

  function move(step) {
    if (!shown.length) return;
    active = (active + step + shown.length) % shown.length;
    highlight();
  }

  input.addEventListener("input", function () { active = 0; render(); });

  panel.addEventListener("keydown", function (e) {
    if (!isOpen) return;
    if (e.key === "Escape") {
      e.preventDefault();
      if (view === "secrets") setView("main"); else closePalette();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      move(e.key === "ArrowDown" ? 1 : -1);
    } else if (e.key === "Enter" && e.target === input) {
      e.preventDefault();
      choose(active);
    } else if (e.key === "Tab") {
      // Only two stops inside: the search box and the close button.
      e.preventDefault();
      (document.activeElement === input ? $("paletteClose") : input).focus();
    }
  });

  list.addEventListener("click", function (e) {
    var opt = e.target.closest("[role=option]");
    if (opt) { active = Number(opt.dataset.index); highlight(); choose(active); }
  });
  list.addEventListener("pointermove", function (e) {
    var opt = e.target.closest("[role=option]");
    if (opt && Number(opt.dataset.index) !== active) { active = Number(opt.dataset.index); highlight(); }
  });
  // Clicking a row should not pull focus out of the search box.
  list.addEventListener("mousedown", function (e) { if (e.target.closest("[role=option]")) e.preventDefault(); });

  trigger.addEventListener("click", function () { openPalette(); });
  overlay.addEventListener("click", function () { closePalette(); });
  $("paletteClose").addEventListener("click", function () { closePalette(); });
  $("secretsBtn").addEventListener("click", function () { openPalette("secrets"); });

  // "/" opens it from anywhere you are not typing. Ctrl+K (Cmd+K on a Mac) also toggles it.
  document.addEventListener("keydown", function (e) {
    var el = document.activeElement;
    var typing = el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      if (isOpen) closePalette(); else openPalette();
    } else if (e.key === "/" && !typing && !isOpen && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      openPalette();
    }
  });

  // The pill types out a few suggestions, then deletes them, like someone at a prompt.
  var PROMPTS = ["Explore my projects", "Find all " + SECRETS.length + " secrets", "Switch the style", "Say hi"];
  var typed = $("paletteTyped");
  var typeTimer = null;
  function stopTyping() { clearTimeout(typeTimer); typeTimer = null; }
  function startTyping() {
    stopTyping();
    if (reduceMotion.matches) { typed.textContent = PROMPTS[0]; return; }
    var n = 0, len = PROMPTS[0].length, deleting = true;
    (function step() {
      var word = PROMPTS[n];
      len += deleting ? -1 : 1;
      typed.textContent = word.slice(0, len);
      var wait = deleting ? 35 : 70;
      if (len === word.length) { deleting = true; wait = 2200; }
      if (len === 0) { deleting = false; n = (n + 1) % PROMPTS.length; wait = 400; }
      typeTimer = setTimeout(step, wait);
    })();
  }

  // Tuck the pill away while you scroll down to read, bring it back when you scroll up.
  var lastY = window.scrollY;
  window.addEventListener("scroll", function () {
    var y = window.scrollY;
    if (!isOpen && Math.abs(y - lastY) > 6) {
      var atEnd = window.innerHeight + y >= document.documentElement.scrollHeight - 40;
      panel.classList.toggle("is-tucked", y > lastY && y > 240 && !atEnd);
      lastY = y;
    }
  }, { passive: true });
  // Focusing the pill with Tab always brings it back into view.
  trigger.addEventListener("focus", function () { panel.classList.remove("is-tucked"); });

  // Phones: keep the open palette above the on-screen keyboard.
  if (window.visualViewport) {
    visualViewport.addEventListener("resize", function () {
      var hidden = window.innerHeight - visualViewport.height - visualViewport.offsetTop;
      panel.style.setProperty("--kb", Math.max(0, hidden) + "px");
    });
  }

  panel.hidden = false;
  overlay.hidden = false;
  startTyping();

  // ---------- Reveal on scroll ----------
  // Cards pop up as they come into view. Without the "motion" class nothing is ever hidden.
  if (canReveal) {
    var REVEAL = ".activity, .project, .lid, .about, .contact, .style-hint, .section__title";
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add("is-in");
        io.unobserve(en.target);
      });
    }, { rootMargin: "0px 0px -8% 0px" });
    document.querySelectorAll(REVEAL).forEach(function (el) {
      var siblings = el.parentElement.querySelectorAll(":scope > .project");
      el.style.setProperty("--d", Math.max(0, Array.prototype.indexOf.call(siblings, el)) * 90 + "ms");
      el.classList.add("reveal");
      io.observe(el);
    });
  }

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
})();
