(() => {
  "use strict";

  const PRODUCTS = window.FOODLE_PRODUCTS;
  const MAX_GUESSES = 6;
  const YEAR_CLOSE = 10;              // years within this range show yellow
  const LAUNCH = new Date(2026, 9, 27); // Foodle #1 (local date)
  const STORE_KEY = "foodle.v1";

  const ATTRS = [
    { key: "category", label: "Category" },
    { key: "colors",   label: "Color", multi: true },
    { key: "taste",    label: "Taste" },
    { key: "storage",  label: "Storage" },
    { key: "packages", label: "Package", multi: true },
    { key: "year",     label: "Year", year: true },
    { key: "company",  label: "Company" },
  ];

  const $ = (id) => document.getElementById(id);
  const els = {
    daily: $("mode-daily"), practice: $("mode-practice"),
    ingredients: $("ingredients"), puzzleId: $("puzzle-id"),
    count: $("ingredient-count"), guessCount: $("guess-count"),
    form: $("guess-form"), input: $("guess-input"), btn: $("guess-btn"),
    list: $("suggestions"), msg: $("form-msg"),
    known: $("known"), body: $("board-body"), result: $("result"),
    stats: $("stats"), catalog: $("catalog"),
  };

  // ---------- Storage (optional; the game works without it) ----------
  function load() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; }
  }
  function save(data) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch { /* private mode */ }
  }
  let store = load();
  store.stats ||= { played: 0, wins: 0, streak: 0, best: 0, dist: [0, 0, 0, 0, 0, 0], lastDay: null };

  // ---------- Daily puzzle order ----------
  // A fixed shuffle so every product appears once before any repeats.
  function mulberry32(seed) {
    return () => {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffled(n, seed) {
    const rand = mulberry32(seed), order = [...Array(n).keys()];
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    return order;
  }
  function dayNumber(date = new Date()) {
    const today = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    return Math.max(0, Math.round((today - LAUNCH) / 86400000));
  }
  function dailyIndex(day) {
    const cycle = Math.floor(day / PRODUCTS.length);
    return shuffled(PRODUCTS.length, 20261027 + cycle)[day % PRODUCTS.length];
  }

  // ---------- Game state ----------
  let state; // { mode, answer, guesses: [index], done, won, day }

  function startDaily() {
    const day = dayNumber();
    const saved = store.daily;
    state = (saved && saved.day === day)
      ? { ...saved, mode: "daily" }
      : { mode: "daily", day, answer: dailyIndex(day), guesses: [], done: false, won: false };
    render(true);
  }

  function startPractice() {
    const daily = dailyIndex(dayNumber());
    let answer;
    do { answer = Math.floor(Math.random() * PRODUCTS.length); }
    while (answer === daily || (state && state.mode === "practice" && answer === state.answer));
    state = { mode: "practice", answer, guesses: [], done: false, won: false };
    render(true);
  }

  function persist() {
    if (state.mode === "daily") { store.daily = state; save(store); }
  }

  // ---------- Comparison ----------
  function compare(guess, answer) {
    return ATTRS.map((a) => {
      const g = guess[a.key], t = answer[a.key];
      if (a.multi) {
        const overlap = g.filter((v) => t.includes(v));
        const same = overlap.length === g.length && g.length === t.length;
        return { attr: a, value: g.join(", "), status: same ? "hit" : overlap.length ? "part" : "miss", overlap };
      }
      if (a.year) {
        const diff = t - g;
        const status = diff === 0 ? "hit" : Math.abs(diff) <= YEAR_CLOSE ? "part" : "miss";
        return { attr: a, value: String(g), status, dir: diff > 0 ? "↑" : diff < 0 ? "↓" : "" };
      }
      return { attr: a, value: g, status: g === t ? "hit" : "miss" };
    });
  }

  // ---------- Guessing ----------
  function submitGuess(index) {
    if (state.done) return;
    if (state.guesses.includes(index)) { say("You already guessed that one."); return; }
    state.guesses.push(index);
    if (index === state.answer) { state.done = true; state.won = true; }
    else if (state.guesses.length >= MAX_GUESSES) { state.done = true; }
    if (state.done && state.mode === "daily") recordStats();
    persist();
    els.input.value = "";
    closeList();
    say("");
    render(false);
  }

  function recordStats() {
    const s = store.stats;
    if (s.lastDay === state.day) return;
    s.played++;
    if (state.won) {
      s.wins++;
      s.streak = s.lastWinDay === state.day - 1 ? s.streak + 1 : 1;
      s.best = Math.max(s.best, s.streak);
      s.dist[state.guesses.length - 1]++;
      s.lastWinDay = state.day;
    } else {
      s.streak = 0;
    }
    s.lastDay = state.day;
  }

  // ---------- Rendering ----------
  function countIngredients(text) {
    // Top-level items only: commas outside parentheses/brackets.
    let depth = 0, n = 1;
    for (const ch of text.replace(/\.$/, "")) {
      if ("([{".includes(ch)) depth++;
      else if (")]}".includes(ch)) depth--;
      else if ((ch === "," || ch === ".") && depth === 0) n++;
    }
    return n;
  }

  function render(fresh) {
    const answer = PRODUCTS[state.answer];
    els.daily.setAttribute("aria-selected", state.mode === "daily");
    els.practice.setAttribute("aria-selected", state.mode === "practice");
    els.puzzleId.textContent = state.mode === "daily" ? `Foodle #${state.day + 1}` : "Practice";
    els.ingredients.textContent = answer.ingredients;
    els.count.textContent = `${countIngredients(answer.ingredients)} listed items`;
    els.guessCount.textContent = state.done
      ? `${state.guesses.length} of ${MAX_GUESSES} guesses used`
      : `Guess ${state.guesses.length + 1} of ${MAX_GUESSES}`;
    els.input.disabled = els.btn.disabled = state.done;

    renderBoard(fresh);
    renderKnown();
    renderResult();
    renderStats();
    renderCatalog();
  }

  function renderBoard(fresh) {
    const answer = PRODUCTS[state.answer];
    els.body.textContent = "";
    state.guesses.forEach((gi, row) => {
      const guess = PRODUCTS[gi];
      const tr = document.createElement("tr");
      const name = document.createElement("td");
      name.className = "name";
      name.textContent = guess.name;
      tr.append(name);
      const animate = !fresh && row === state.guesses.length - 1;
      compare(guess, answer).forEach((c, i) => {
        const td = document.createElement("td");
        td.className = `tile ${c.status}${animate ? " flip" : ""}`;
        if (animate) td.style.animationDelay = `${i * 90}ms`;
        td.textContent = c.value;
        td.title = `${c.attr.label}: ${c.status === "hit" ? "match" : c.status === "part" ? "partly right" : "no match"}`;
        if (c.dir) {
          const d = document.createElement("span");
          d.className = "dir";
          d.textContent = c.dir;
          d.setAttribute("aria-label", c.dir === "↑" ? "answer is newer" : "answer is older");
          td.append(d);
        }
        tr.append(td);
      });
      els.body.append(tr);
    });
    if (!state.guesses.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 8;
      td.style.color = "var(--muted)";
      td.style.fontWeight = "500";
      td.textContent = "Your guesses will show up here, with each attribute colored by how close it is.";
      tr.append(td);
      els.body.append(tr);
    }
  }

  function renderKnown() {
    const answer = PRODUCTS[state.answer];
    const rows = state.guesses.map((gi) => compare(PRODUCTS[gi], answer));
    els.known.textContent = "";
    ATTRS.forEach((a, i) => {
      const cells = rows.map((r) => r[i]);
      let text = null, cls = "";
      if (state.done || cells.some((c) => c.status === "hit")) {
        text = a.multi ? answer[a.key].join(", ") : String(answer[a.key]);
        cls = "found";
      } else if (a.multi) {
        const confirmed = [...new Set(cells.flatMap((c) => c.overlap))];
        if (confirmed.length) { text = `Includes ${confirmed.join(", ")}`; cls = "hint"; }
      } else if (a.year) {
        let lo = -Infinity, hi = Infinity;
        cells.forEach((c) => {
          const y = Number(c.value);
          if (c.dir === "↑") lo = Math.max(lo, y + 1); else if (c.dir === "↓") hi = Math.min(hi, y - 1);
          if (c.status === "part") { lo = Math.max(lo, y - YEAR_CLOSE); hi = Math.min(hi, y + YEAR_CLOSE); }
          if (c.status === "miss") {
            if (c.dir === "↑") lo = Math.max(lo, y + YEAR_CLOSE + 1); else hi = Math.min(hi, y - YEAR_CLOSE - 1);
          }
        });
        if (lo > -Infinity && hi < Infinity) text = `${lo}–${hi}`;
        else if (lo > -Infinity) text = `${lo} or later`;
        else if (hi < Infinity) text = `${hi} or earlier`;
        if (text) cls = "hint";
      } else {
        const ruledOut = [...new Set(cells.filter((c) => c.status === "miss").map((c) => c.value))];
        if (ruledOut.length) { text = `Not ${ruledOut.join(", ")}`; cls = "hint ruled"; }
      }
      const dl = document.createElement("dl");
      dl.className = `fact ${cls}`;
      const dt = document.createElement("dt");
      dt.textContent = a.label;
      const dd = document.createElement("dd");
      if (text) dd.textContent = text;
      else { dd.innerHTML = '<span class="unknown">?</span>'; }
      if (cls.includes("ruled")) dl.classList.remove("hint");
      dl.append(dt, dd);
      els.known.append(dl);
    });
  }

  function shareText() {
    const answer = PRODUCTS[state.answer];
    const icon = { hit: "🟩", part: "🟨", miss: "⬜" };
    const lines = state.guesses.map((gi) => compare(PRODUCTS[gi], answer).map((c) => icon[c.status]).join(""));
    const score = state.won ? state.guesses.length : "X";
    const head = state.mode === "daily" ? `Foodle #${state.day + 1} ${score}/${MAX_GUESSES}` : `Foodle practice ${score}/${MAX_GUESSES}`;
    return `${head}\n${lines.join("\n")}`;
  }

  let timer = null;
  function renderResult() {
    clearInterval(timer);
    if (!state.done) { els.result.hidden = true; return; }
    const answer = PRODUCTS[state.answer];
    els.result.hidden = false;
    els.result.className = `result ${state.won ? "win" : "lose"}`;
    els.result.innerHTML = "";

    const verdict = el("p", "verdict", state.won
      ? `Got it in ${state.guesses.length}`
      : "Out of guesses. It was:");
    const title = el("h2", "", answer.name);
    const meta = el("p", "meta", `${answer.company} · since ${answer.year} · ${answer.category}`);
    const preview = el("pre", "share-preview", shareText());
    const actions = el("div", "actions");

    const share = el("button", "btn", "Copy result");
    share.type = "button";
    share.addEventListener("click", () => {
      const text = shareText();
      const done = () => { share.textContent = "Copied"; setTimeout(() => (share.textContent = "Copy result"), 1600); };
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(done, () => selectText(preview));
      } else selectText(preview);
    });
    actions.append(share);

    const next = el("button", "btn secondary", state.mode === "daily" ? "Play practice" : "Next food");
    next.type = "button";
    next.addEventListener("click", startPractice);
    actions.append(next);

    if (state.mode === "daily") {
      const cd = el("span", "countdown");
      const tick = () => {
        const now = new Date();
        const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        const s = Math.max(0, Math.floor((tomorrow - now) / 1000));
        const hh = String(Math.floor(s / 3600)).padStart(2, "0");
        const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
        const ss = String(s % 60).padStart(2, "0");
        cd.textContent = `Next Foodle in ${hh}:${mm}:${ss}`;
        if (s === 0) { clearInterval(timer); startDaily(); }
      };
      tick();
      timer = setInterval(tick, 1000);
      actions.append(cd);
    }
    els.result.append(verdict, title, meta, preview, actions);
  }

  function renderStats() {
    const s = store.stats;
    if (state.mode !== "daily" || !s.played) { els.stats.hidden = true; return; }
    els.stats.hidden = false;
    els.stats.innerHTML = "<h3>Your daily record</h3>";
    const row = el("div", "stats-row");
    [[s.played, "Played"], [Math.round((s.wins / s.played) * 100) + "%", "Won"], [s.streak, "Streak"], [s.best, "Best streak"]]
      .forEach(([v, k]) => {
        const d = el("div", "stat");
        d.append(el("b", "", String(v)), el("span", "", k));
        row.append(d);
      });
    els.stats.append(row);
  }

  function renderCatalog() {
    const groups = {};
    PRODUCTS.forEach((p, i) => (groups[p.category] ||= []).push(i));
    els.catalog.textContent = "";
    Object.entries(groups).forEach(([cat, idxs]) => {
      const sec = el("section");
      sec.append(el("h4", "", cat));
      const ul = el("ul");
      idxs.sort((a, b) => PRODUCTS[a].name.localeCompare(PRODUCTS[b].name)).forEach((i) => {
        const li = el("li");
        const b = el("button", state.guesses.includes(i) ? "used" : "", PRODUCTS[i].name);
        b.type = "button";
        b.addEventListener("click", () => {
          if (state.done) return;
          els.input.value = PRODUCTS[i].name;
          els.input.focus();
          els.input.scrollIntoView({ block: "center", behavior: "smooth" });
        });
        li.append(b);
        ul.append(li);
      });
      sec.append(ul);
      els.catalog.append(sec);
    });
  }

  function el(tag, cls = "", text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function selectText(node) {
    const r = document.createRange();
    r.selectNodeContents(node);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
    say("Press Ctrl+C (or Cmd+C) to copy.");
  }
  function say(text) { els.msg.textContent = text; }

  // ---------- Autocomplete ----------
  const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const SEARCH = PRODUCTS.map((p) => norm(p.name));
  const AKA = PRODUCTS.map((p) => (p.aka || []).map(norm));
  const CATS = PRODUCTS.map((p) => norm(p.category));
  let matches = [], active = -1, why = {};

  // Lower rank = better. Name matches beat search-word matches, which beat category matches.
  function rank(i, q, words) {
    const name = SEARCH[i];
    const has = (text) => words.every((w) => text.split(" ").some((t) => t.startsWith(w)) || text.includes(w));
    if (name.startsWith(q)) return [0];
    if (name.split(" ").some((t) => t.startsWith(q))) return [1];
    if (has(name)) return [2];
    const aka = AKA[i].find((a) => a.startsWith(q)) || AKA[i].find((a) => has(a));
    if (aka) return [3, aka];
    if (has(`${name} ${AKA[i].join(" ")} ${CATS[i]}`)) return [4, PRODUCTS[i].category.toLowerCase()];
    return null;
  }

  function updateList() {
    const q = norm(els.input.value);
    if (!q) { closeList(); return; }
    const words = q.split(" ");
    why = {};
    const scored = [];
    PRODUCTS.forEach((_, i) => {
      if (state.guesses.includes(i)) return;
      const r = rank(i, q, words);
      if (r) { scored.push([r[0], i]); if (r[1]) why[i] = r[1]; }
    });
    matches = scored
      .sort((a, b) => a[0] - b[0] || SEARCH[a[1]].localeCompare(SEARCH[b[1]]))
      .map(([, i]) => i)
      .slice(0, 15);
    active = matches.length ? 0 : -1;
    drawList();
  }
  function drawList() {
    els.list.textContent = "";
    if (!matches.length) { closeList(); return; }
    matches.forEach((i, n) => {
      const li = el("li");
      li.id = `opt-${i}`;
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", n === active);
      li.append(el("span", "", PRODUCTS[i].name), el("small", "", why[i] ? `“${why[i]}”` : PRODUCTS[i].category));
      li.addEventListener("mousedown", (e) => { e.preventDefault(); submitGuess(i); });
      els.list.append(li);
    });
    els.list.hidden = false;
    els.input.setAttribute("aria-expanded", "true");
    if (active >= 0) els.input.setAttribute("aria-activedescendant", `opt-${matches[active]}`);
  }
  function closeList() {
    matches = []; active = -1;
    els.list.hidden = true;
    els.input.setAttribute("aria-expanded", "false");
    els.input.removeAttribute("aria-activedescendant");
  }

  els.input.addEventListener("input", updateList);
  els.input.addEventListener("blur", () => setTimeout(closeList, 100));
  els.input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!matches.length) { updateList(); return; }
      e.preventDefault();
      active = (active + (e.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length;
      drawList();
      document.getElementById(`opt-${matches[active]}`)?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Escape") closeList();
  });

  els.form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (state.done) return;
    const q = norm(els.input.value);
    if (!q) { say("Type a food or drink, then pick it from the list."); return; }
    const exact = SEARCH.indexOf(q);
    if (exact >= 0) { submitGuess(exact); return; }
    if (matches.length && active >= 0) { submitGuess(matches[active]); return; }
    say("That isn't one of the 100 foods. Pick a name from the list.");
  });

  els.daily.addEventListener("click", startDaily);
  els.practice.addEventListener("click", startPractice);

  startDaily();
})();
