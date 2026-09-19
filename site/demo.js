/* eslint-plugin-jev — demo engine.
   Replays recorded ESLint output from ./replay.json. Nothing here calls any API. */

(function () {
  "use strict";

  var byId = function (id) { return document.getElementById(id); };

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  var reduceMotion = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : { matches: false };

  /* ------------------------------------------------------------ copy buttons */

  function flashCopied(btn) {
    var label = btn.querySelector(".copy-label") || btn;
    if (btn.dataset.busy === "1") return;
    btn.dataset.busy = "1";
    var original = label.textContent;
    label.textContent = "Copied";
    btn.classList.add("is-copied");
    window.setTimeout(function () {
      label.textContent = original;
      btn.classList.remove("is-copied");
      btn.dataset.busy = "";
    }, 1200);
  }

  function legacyCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) { /* nothing else to try */ }
    document.body.removeChild(ta);
  }

  function wireCopyButtons() {
    var buttons = document.querySelectorAll(".copy");
    Array.prototype.forEach.call(buttons, function (btn) {
      btn.addEventListener("click", function () {
        var text = btn.dataset.copyText;
        if (!text && btn.dataset.copyFrom) {
          var src = byId(btn.dataset.copyFrom);
          text = src ? src.textContent : "";
        }
        if (!text) return;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(
            function () { flashCopied(btn); },
            function () { legacyCopy(text); flashCopied(btn); }
          );
        } else {
          legacyCopy(text);
          flashCopied(btn);
        }
      });
    });
  }

  /* -------------------------------------------------------------- demo state */

  var tabsEl = byId("tabs");
  var runBtn = byId("runBtn");
  var fixBtn = byId("fixBtn");
  var codeBody = byId("codeBody");
  var codeScroll = byId("codeScroll");
  var codePanel = byId("codePanel");
  var fileName = byId("fileName");
  var checkConfig = byId("checkConfig");
  var checkCode = byId("checkCode");
  var outEl = byId("out");
  var runMeta = byId("runMeta");
  var demoNote = byId("demoNote");
  var hovercard = byId("hovercard");
  var hcRule = byId("hcRule");
  var hcMsg = byId("hcMsg");
  var hcSug = byId("hcSug");

  var data = null;
  var index = 0;
  var variant = "bad";
  var busy = false;
  var alreadyRun = {};          /* "exampleId:variant" -> true */
  var marksByMessage = {};      /* message index -> mark element */
  var diagsByMessage = {};      /* message index -> output row */
  var timers = [];

  function current() { return data.examples[index]; }
  function currentVariant() { return current().variants[variant]; }

  function clearTimers() {
    timers.forEach(function (t) { window.clearTimeout(t); });
    timers = [];
  }
  function later(fn, ms) { timers.push(window.setTimeout(fn, ms)); }

  /* ------------------------------------------------------------------- tabs */

  function buildTabs() {
    data.examples.forEach(function (ex, i) {
      var tab = el("button", "tab", ex.title);
      tab.type = "button";
      tab.id = "tab-" + ex.id;
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-controls", "codePanel");
      tab.setAttribute("aria-selected", i === index ? "true" : "false");
      tab.tabIndex = i === index ? 0 : -1;
      tab.addEventListener("click", function () { select(i); });
      tab.addEventListener("keydown", function (e) {
        var step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        if (!step) return;
        e.preventDefault();
        var next = (i + step + data.examples.length) % data.examples.length;
        select(next);
        tabsEl.children[next].focus();
      });
      tabsEl.appendChild(tab);
    });
  }

  function syncTabs() {
    Array.prototype.forEach.call(tabsEl.children, function (tab, i) {
      tab.setAttribute("aria-selected", i === index ? "true" : "false");
      tab.tabIndex = i === index ? 0 : -1;
    });
  }

  function select(i) {
    if (i === index) return;
    index = i;
    variant = "bad";
    syncTabs();
    render();
  }

  /* ------------------------------------------------------------- code panel */

  function checkSnippet(checks) {
    var lines = ['"jev/check": ["warn", {', "  checks: ["];
    checks.forEach(function (c) {
      lines.push("    { id: " + JSON.stringify(c.id) + ",");
      lines.push("      question: " + JSON.stringify(c.question) + " },");
    });
    lines.push("  ],");
    lines.push("}]");
    return lines.join("\n");
  }

  function renderCode(v) {
    var text = v.code.replace(/\n+$/, "");
    var lines = text.split("\n");
    var messages = v.messages || [];
    var byLine = {};
    messages.forEach(function (m, i) {
      (byLine[m.line] = byLine[m.line] || []).push({ m: m, i: i });
    });

    marksByMessage = {};
    var frag = document.createDocumentFragment();

    lines.forEach(function (lineText, idx) {
      var n = idx + 1;
      var row = el("span", "row");
      var gutter = el("span", "ln", String(n));
      gutter.setAttribute("aria-hidden", "true");
      var src = el("span", "src");

      var items = (byLine[n] || []).slice().sort(function (a, b) {
        return (a.m.column || 1) - (b.m.column || 1);
      });

      var pos = 0;
      items.forEach(function (item) {
        var m = item.m;
        var start = Math.max(0, (m.column || 1) - 1);
        var end = m.endLine === n && m.endColumn ? m.endColumn - 1 : lineText.length;
        if (end > lineText.length) end = lineText.length;
        if (start > lineText.length) start = lineText.length;
        if (start < pos) start = pos;
        if (end <= start) return;
        if (start > pos) src.appendChild(document.createTextNode(lineText.slice(pos, start)));
        var mark = el("span", "mark", lineText.slice(start, end));
        mark.tabIndex = -1;
        mark.dataset.message = String(item.i);
        marksByMessage[item.i] = mark;
        src.appendChild(mark);
        pos = end;
      });
      src.appendChild(document.createTextNode(lineText.slice(pos)));

      row.appendChild(gutter);
      row.appendChild(src);
      frag.appendChild(row);
    });

    codeBody.replaceChildren(frag);
  }

  /* --------------------------------------------------------------- hovercard */

  function hideCard() {
    hovercard.hidden = true;
  }

  function showCard(mark) {
    var i = Number(mark.dataset.message);
    var m = (currentVariant().messages || [])[i];
    if (!m) return;
    hcRule.textContent = m.ruleId + " · line " + m.line + ":" + m.column;
    hcMsg.textContent = m.message;
    var sug = m.suggestions && m.suggestions.length ? m.suggestions[0] : null;
    if (sug && sug.desc) {
      hcSug.textContent = "Suggestion: " + sug.desc;
      hcSug.hidden = false;
    } else {
      hcSug.hidden = true;
    }

    hovercard.hidden = false;
    var panel = codePanel.getBoundingClientRect();
    var rect = mark.getBoundingClientRect();

    var left = rect.left - panel.left;
    var maxLeft = panel.width - hovercard.offsetWidth - 12;
    if (left > maxLeft) left = maxLeft;
    if (left < 12) left = 12;

    /* the panel clips its own overflow, so flip above the line when there is no room below */
    var height = hovercard.offsetHeight;
    var top = rect.bottom - panel.top + 8;
    if (top + height > panel.height - 8) {
      var above = rect.top - panel.top - height - 8;
      top = above > 8 ? above : Math.max(8, panel.height - height - 8);
    }

    hovercard.style.top = top + "px";
    hovercard.style.left = left + "px";
  }

  function wireHovercard() {
    codeBody.addEventListener("pointerover", function (e) {
      var mark = e.target.closest ? e.target.closest(".mark.is-on") : null;
      if (mark) showCard(mark);
    });
    codeBody.addEventListener("pointerout", function (e) {
      var mark = e.target.closest ? e.target.closest(".mark.is-on") : null;
      if (mark) hideCard();
    });
    codeBody.addEventListener("focusin", function (e) {
      var mark = e.target.closest ? e.target.closest(".mark.is-on") : null;
      if (mark) showCard(mark);
    });
    codeBody.addEventListener("focusout", hideCard);
    codeScroll.addEventListener("scroll", hideCard, { passive: true });
    window.addEventListener("keydown", function (e) {
      if (e.key === "Escape") hideCard();
    });
  }

  /* ------------------------------------------------------------ output panel */

  function hint(text) {
    return el("p", "out-hint", text);
  }

  function resetOutput() {
    clearTimers();
    hideCard();
    outEl.replaceChildren(hint("Press Run eslint."));
    runMeta.textContent = "";
    diagsByMessage = {};
  }

  function paint(v, warm) {
    var messages = v.messages || [];
    var frag = document.createDocumentFragment();
    var step = 0;
    var animate = !warm;

    function stagger(node) {
      if (animate) {
        node.classList.add("enter");
        node.style.setProperty("--i", String(step));
      }
      step += 1;
      return node;
    }

    if (!messages.length) {
      frag.appendChild(stagger(el("p", "ok-line", "✔ No problems found")));
    } else {
      frag.appendChild(stagger(el("p", "out-file", current().file)));

      messages.forEach(function (m, i) {
        var row = el("div", "diag");
        row.appendChild(el("span", "pos", m.line + ":" + m.column));
        row.appendChild(el("span", "sev", m.severity === 2 ? "error" : "warning"));
        var msg = el("span", "msg", m.message);
        msg.appendChild(el("span", "rid", m.ruleId));
        row.appendChild(msg);
        row.addEventListener("pointerenter", function () { linkRow(i, true); });
        row.addEventListener("pointerleave", function () { linkRow(i, false); });
        diagsByMessage[i] = row;
        frag.appendChild(stagger(row));
      });

      var summary = el("p", "summary");
      summary.appendChild(el("span", "x", "✖"));
      summary.appendChild(document.createTextNode(
        " " + messages.length + " problem" + (messages.length === 1 ? "" : "s") +
        " (0 errors, " + messages.length + " warning" + (messages.length === 1 ? "" : "s") + ")"
      ));
      frag.appendChild(stagger(summary));
    }

    outEl.replaceChildren(frag);
    runMeta.textContent = warm
      ? "from cache · " + v.warmMs + " ms"
      : v.coldMs + " ms";

    lightUnderlines(messages, warm);
  }

  function lightUnderlines(messages, warm) {
    messages.forEach(function (m, i) {
      var mark = marksByMessage[i];
      if (!mark) return;
      var delay = warm || reduceMotion.matches ? 0 : (i + 1) * 60;
      mark.style.setProperty("--underline-delay", delay + "ms");
      mark.tabIndex = 0;
      mark.setAttribute("aria-describedby", "hovercard");
      later(function () { mark.classList.add("is-on"); }, 16);
    });
  }

  function linkRow(i, on) {
    var mark = marksByMessage[i];
    if (mark) mark.classList.toggle("is-hot", on);
  }

  /* ---------------------------------------------------------------- running */

  function runLint() {
    if (busy || !data) return;
    var v = currentVariant();
    var key = current().id + ":" + variant;
    var warm = alreadyRun[key] === true;
    alreadyRun[key] = true;

    busy = true;
    runBtn.disabled = true;
    outEl.setAttribute("aria-busy", "true");
    clearTimers();
    hideCard();

    function done() {
      busy = false;
      runBtn.disabled = false;
      outEl.removeAttribute("aria-busy");
    }

    if (warm) {
      paint(v, true);
      done();
      return;
    }

    outEl.replaceChildren(hint("linting…"));
    runMeta.textContent = "";
    later(function () {
      paint(v, false);
      done();
    }, Math.min(v.coldMs, 600));
  }

  function toggleFix() {
    if (!data) return;
    variant = variant === "bad" ? "fixed" : "bad";
    fixBtn.setAttribute("aria-pressed", variant === "fixed" ? "true" : "false");
    render();
  }

  /* ----------------------------------------------------------------- render */

  function render() {
    var ex = current();
    var v = ex.variants[variant];

    fileName.textContent = ex.file + (variant === "fixed" ? "  (fixed)" : "");
    fixBtn.setAttribute("aria-pressed", variant === "fixed" ? "true" : "false");

    if (ex.checks && ex.checks.length) {
      checkCode.textContent = checkSnippet(ex.checks);
      checkConfig.hidden = false;
    } else {
      checkConfig.hidden = true;
    }

    renderCode(v);
    codeScroll.scrollLeft = 0;
    resetOutput();
  }

  /* ------------------------------------------------------------------- boot */

  function fail(message) {
    runBtn.disabled = true;
    fixBtn.disabled = true;
    codeBody.replaceChildren();
    fileName.textContent = "replay.json";
    var note = el("div", "out-err");
    note.appendChild(document.createTextNode("Could not load replay.json (" + message + "). "));
    note.appendChild(document.createTextNode(
      "A browser will not read a neighbouring file over file://, so serve this folder over HTTP "
    ));
    var cmd = el("code", null, "python -m http.server");
    note.appendChild(document.createTextNode("— for example "));
    note.appendChild(cmd);
    note.appendChild(document.createTextNode(" inside site/ — and reload."));
    outEl.replaceChildren(note);
    demoNote.textContent = "The demo replays a recorded run. Nothing on this page calls the API.";
  }

  function init(json) {
    data = json;
    buildTabs();
    wireHovercard();
    runBtn.addEventListener("click", runLint);
    fixBtn.addEventListener("click", toggleFix);

    var when = new Date(data.recordedAt);
    var date = isNaN(when.getTime())
      ? String(data.recordedAt)
      : when.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    demoNote.textContent =
      "Recorded from a real run on " + date + " with " + data.model +
      ". Nothing on this page calls the API.";

    render();
  }

  wireCopyButtons();

  fetch("./replay.json")
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(init)
    .catch(function (err) { fail(err && err.message ? err.message : String(err)); });
})();
