/* UI wiring. Depends on analyzer.js and extract.js. */
(function () {
  const SAMPLE = `Aarav Mehta
aarav.mehta@example.com | +91 98765 43210 | linkedin.com/in/aaravmehta

SUMMARY
Results-driven software engineer and team player with experience in web development.

EXPERIENCE
Software Engineer, Finlytics (2022 - Present)
- Responsible for the checkout service used by various internal teams
- Built a caching layer that cut API latency by 42% across 3 services
- Worked on the dashboard rewrite in React
- Led a team of 4 engineers to ship a payments feature used by 120,000 customers

Junior Developer, Brightside Labs (2020 - 2022)
- Helped with bug fixes and code reviews
- Automated release checks, saving 6 hours of manual QA per week

EDUCATION
B.Tech, Computer Science, IIT Kanpur (2016 - 2020)

SKILLS
JavaScript, React, Node.js, PostgreSQL, Docker`;

  const $ = (id) => document.getElementById(id);
  const el = (tag, className, text) => {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined) n.textContent = text;
    return n;
  };

  const ui = {
    drop: $("dropzone"), file: $("fileInput"), choose: $("chooseBtn"),
    idle: $("dropIdle"), busy: $("dropBusy"), busyLabel: $("busyLabel"), busyFill: $("busyFill"),
    fileNote: $("fileNote"), resume: $("resume"), sample: $("sampleBtn"), clear: $("clearBtn"),
    jdToggle: $("jdToggle"), jd: $("jd"), error: $("error"), analyze: $("analyzeBtn"),
    empty: $("empty"), report: $("report"),
  };

  let busy = false;

  /* ---------- state helpers ---------- */
  function showError(msg) {
    ui.error.textContent = msg || "";
    ui.error.hidden = !msg;
  }

  function setStatus(s) {
    busy = s !== null;
    ui.idle.hidden = busy;
    ui.busy.hidden = !busy;
    if (s) {
      ui.busyLabel.textContent = s.label;
      ui.busyFill.style.width = Math.round(s.progress * 100) + "%";
    }
  }

  function setFileNote(name) {
    ui.fileNote.hidden = !name;
    ui.fileNote.textContent = name ? `Read ${name}. Check the text below before analyzing.` : "";
  }

  function syncClear() {
    ui.clear.hidden = !ui.resume.value;
  }

  function resetReport() {
    ui.report.hidden = true;
    ui.empty.hidden = false;
  }

  /* ---------- file handling ---------- */
  async function handleFile(file) {
    if (!file || busy) return;
    showError("");
    setFileNote("");
    setStatus({ label: "Starting", progress: 0 });
    try {
      const extracted = Extractor.normalizeText(await Extractor.extractText(file, setStatus));
      if (extracted.length < 40) {
        throw new Error("No readable text found. Try a clearer scan or a higher-resolution image.");
      }
      ui.resume.value = extracted;
      setFileNote(file.name);
      resetReport();
    } catch (err) {
      showError((err && err.message) || "Could not read that file.");
    } finally {
      setStatus(null);
      syncClear();
    }
  }

  ui.choose.addEventListener("click", () => ui.file.click());
  ui.file.addEventListener("change", (e) => {
    handleFile(e.target.files[0]);
    e.target.value = "";
  });
  ui.drop.addEventListener("dragover", (e) => { e.preventDefault(); ui.drop.classList.add("ra-drop-on"); });
  ui.drop.addEventListener("dragleave", () => ui.drop.classList.remove("ra-drop-on"));
  ui.drop.addEventListener("drop", (e) => {
    e.preventDefault();
    ui.drop.classList.remove("ra-drop-on");
    handleFile(e.dataTransfer.files[0]);
  });

  /* ---------- text controls ---------- */
  ui.resume.addEventListener("input", syncClear);
  ui.sample.addEventListener("click", () => { ui.resume.value = SAMPLE; setFileNote(""); syncClear(); });
  ui.clear.addEventListener("click", () => { ui.resume.value = ""; setFileNote(""); syncClear(); resetReport(); });

  ui.jdToggle.addEventListener("click", () => {
    const open = ui.jd.hidden;
    ui.jd.hidden = !open;
    ui.jdToggle.setAttribute("aria-expanded", String(open));
    ui.jdToggle.textContent = open ? "Remove job description" : "Compare against a job description";
    if (!open) ui.jd.value = "";
  });

  ui.analyze.addEventListener("click", () => {
    const text = ui.resume.value;
    if (text.trim().length < 80) {
      showError("Add your resume first. The text looks too short to analyze.");
      return;
    }
    showError("");
    render(Analyzer.analyze(text, ui.jd.hidden ? "" : ui.jd.value), text);
  });

  /* ---------- rendering ---------- */
  function scoreRing(value) {
    const r = 54, c = 2 * Math.PI * r;
    const color = value >= 75 ? "var(--good)" : value >= 50 ? "var(--warn)" : "var(--fix)";
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("width", "140"); svg.setAttribute("height", "140");
    svg.setAttribute("viewBox", "0 0 140 140");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", `Score ${value} out of 100`);

    const make = (tag, attrs) => {
      const n = document.createElementNS(NS, tag);
      Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
      return n;
    };
    svg.append(make("circle", { cx: 70, cy: 70, r, fill: "none", stroke: "var(--line)", "stroke-width": 10 }));
    const arc = make("circle", {
      cx: 70, cy: 70, r, fill: "none", stroke: color, "stroke-width": 10, "stroke-linecap": "round",
      "stroke-dasharray": c, "stroke-dashoffset": c, transform: "rotate(-90 70 70)",
    });
    arc.style.transition = "stroke-dashoffset .9s cubic-bezier(.2,.8,.2,1)";
    svg.append(arc);
    requestAnimationFrame(() => requestAnimationFrame(() => arc.setAttribute("stroke-dashoffset", c * (1 - value / 100))));

    const num = make("text", { x: 70, y: 72, "text-anchor": "middle", class: "ra-ring-num" });
    num.textContent = value;
    const sub = make("text", { x: 70, y: 94, "text-anchor": "middle", class: "ra-ring-sub" });
    sub.textContent = "out of 100";
    svg.append(num, sub);
    return svg;
  }

  function chips(container, items, cls, emptyText) {
    container.replaceChildren();
    if (!items.length) { container.append(el("span", "ra-sub", emptyText)); return; }
    items.forEach((k) => container.append(el("span", `ra-chip ${cls}`, k)));
  }

  function render(result, text) {
    ui.empty.hidden = true;
    ui.report.hidden = false;

    // Score card
    $("ring").replaceChildren(scoreRing(result.total));
    $("grade").textContent =
      result.total >= 80 ? "Strong" : result.total >= 60 ? "Solid, with gaps" : result.total >= 40 ? "Needs work" : "Needs a rewrite";
    const s = result.stats;
    $("stats").textContent = `${s.words} words, ${s.bullets} bullets, ${s.metricBullets} with numbers`;

    // Breakdown
    const breakdown = $("breakdown");
    breakdown.replaceChildren();
    result.categories.forEach((c) => {
      const ratio = c.score / c.max;
      const row = el("div", "ra-bar-row");
      const bar = el("div", "ra-bar");
      const fill = el("div", "ra-bar-fill");
      fill.style.width = "0";
      fill.style.background = ratio >= 0.75 ? "var(--good)" : ratio >= 0.5 ? "var(--warn)" : "var(--fix)";
      bar.append(fill);
      row.append(el("span", "", c.name), bar, el("span", "ra-bar-num", `${c.score}/${c.max}`));
      breakdown.append(row);
      requestAnimationFrame(() => requestAnimationFrame(() => (fill.style.width = ratio * 100 + "%")));
    });

    // Findings
    const order = ["fix", "tip", "good"];
    const labels = { fix: "Fix", tip: "Tip", good: "Good" };
    const list = $("findings");
    list.replaceChildren();
    [...result.findings]
      .sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level))
      .forEach((f) => {
        const li = el("li", `ra-find ra-find-${f.level}`);
        const body = el("div");
        body.append(el("strong", "", f.title), el("p", "", f.detail));
        li.append(el("span", "ra-tag", labels[f.level]), body);
        list.append(li);
      });

    // Job description match
    $("matchBlock").hidden = !result.match;
    if (result.match) {
      $("matchTitle").textContent = `Job description match: ${result.match.score}%`;
      chips($("hitChips"), result.match.hit, "ra-chip-hit", "None");
      chips($("missChips"), result.match.miss, "ra-chip-miss", "Nothing missing");
    }

    // Marked-up text
    const paper = $("paper");
    paper.replaceChildren();
    text.split("\n").forEach((line) => {
      const div = el("div", "ra-line");
      if (!line) div.textContent = "\u00A0";
      Analyzer.lineSegments(line).forEach((seg) => {
        if (seg.type) div.append(el("mark", `ra-mark ra-${seg.type}`, seg.text));
        else div.append(document.createTextNode(seg.text));
      });
      paper.append(div);
    });

    ui.report.scrollIntoView({ behavior: "smooth", block: "start" });
  }
})();
