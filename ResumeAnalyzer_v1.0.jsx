import { useMemo, useRef, useState } from "react";

/* ------------------------------------------------------------------ */
/*  Analysis engine (runs fully in the browser, no API calls)          */
/* ------------------------------------------------------------------ */

const ACTION_VERBS = [
  "achieved","analyzed","architected","automated","boosted","built","coordinated","created","cut",
  "delivered","deployed","designed","developed","drove","established","founded","generated",
  "implemented","improved","increased","initiated","integrated","launched","led","managed","mentored",
  "migrated","negotiated","optimized","owned","produced","reduced","resolved","saved","scaled",
  "shipped","spearheaded","streamlined","supervised","trained","wrote",
];

const WEAK_PHRASES = [
  "responsible for","worked on","helped with","helped to","duties included","assisted with",
  "team player","hard worker","hard-working","detail-oriented","results-driven","go-getter",
  "references available","references upon request","various","etc","think outside the box",
];

const SECTIONS = {
  Summary: /^(professional\s+)?(summary|profile|objective|about)/i,
  Experience: /^(work\s+|professional\s+)?(experience|history)|^employment/i,
  Education: /^education|^academic/i,
  Skills: /^(technical\s+|core\s+)?skills|^technologies|^competencies/i,
  Projects: /^projects|^selected work/i,
};

const STOPWORDS = new Set(
  "the and for with you your our are will have has from that this their they them who what when where which into over than then also able about across such more most other some any all can not but its it's per new use using used work works team teams role roles job years year experience skills strong ability including within must should would could etc".split(" ")
);

const BULLET = /^\s*[-•*–·▪●]\s+/;
const YEAR = /^(19|20)\d{2}$/;
const METRIC = /(\$\s?\d[\d,.]*\s?[kKmMbB]?\b|\b\d[\d,.]*\s?(?:%|x|X|k|K|\+)|\b\d{2,}[\d,.]*\b)/g;

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const weakRe = new RegExp(`\\b(${WEAK_PHRASES.map(escapeRe).join("|")})\\b`, "gi");
const verbRe = new RegExp(`^(\\s*[-•*–·▪●]\\s+)(${ACTION_VERBS.join("|")})\\b`, "i");

function keywordsFrom(jd) {
  const freq = {};
  (jd.toLowerCase().match(/[a-z][a-z+#.\-]{2,}/g) || []).forEach((w) => {
    w = w.replace(/[.\-]+$/, "");
    if (w.length < 3 || STOPWORDS.has(w)) return;
    freq[w] = (freq[w] || 0) + 1;
  });
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .map(([w]) => w);
}

function analyze(text, jd) {
  const lines = text.split("\n");
  const words = (text.match(/\S+/g) || []).length;
  const bullets = lines.filter((l) => BULLET.test(l));
  const lower = text.toLowerCase();

  // Contact
  const contact = {
    Email: /[\w.+-]+@[\w-]+\.[\w.-]+/.test(text),
    Phone: /(\+?\d[\d\s().-]{8,}\d)/.test(text),
    "LinkedIn or GitHub": /linkedin\.com|github\.com/i.test(text),
  };
  const contactHits = Object.values(contact).filter(Boolean).length;

  // Sections
  const foundSections = Object.keys(SECTIONS).filter((name) =>
    lines.some((l) => l.trim().length < 40 && SECTIONS[name].test(l.trim()))
  );

  // Bullets
  const strongBullets = bullets.filter((b) => verbRe.test(b)).length;
  const metricBullets = bullets.filter((b) => {
    const m = b.match(METRIC) || [];
    return m.some((x) => !YEAR.test(x.trim()));
  }).length;
  const weakHits = [...text.matchAll(weakRe)].map((m) => m[0].toLowerCase());

  const pct = (a, b) => (b ? a / b : 0);

  const categories = [
    { name: "Contact details", max: 15, score: Math.round((contactHits / 3) * 15) },
    { name: "Structure", max: 20, score: Math.round(Math.min(foundSections.length / 4, 1) * 20) },
    { name: "Action verbs", max: 20, score: Math.round(Math.min(pct(strongBullets, bullets.length) / 0.7, 1) * 20) },
    { name: "Measurable results", max: 20, score: Math.round(Math.min(pct(metricBullets, bullets.length) / 0.5, 1) * 20) },
    {
      name: "Length",
      max: 10,
      score: words >= 350 && words <= 800 ? 10 : words >= 200 && words <= 1000 ? 6 : 2,
    },
    { name: "Plain language", max: 15, score: Math.max(15 - weakHits.length * 3, 0) },
  ];
  const total = categories.reduce((s, c) => s + c.score, 0);

  // Findings
  const findings = [];
  const add = (level, title, detail) => findings.push({ level, title, detail });

  if (!contact.Email) add("fix", "Add an email address", "Recruiters and applicant tracking systems look for one first.");
  if (!contact.Phone) add("tip", "Add a phone number", "A phone number gives recruiters a faster way to reach you.");
  if (!contact["LinkedIn or GitHub"]) add("tip", "Link a professional profile", "A LinkedIn or GitHub URL lets readers verify your work.");
  if (contactHits === 3) add("good", "Contact details are complete", "Email, phone and a profile link were all found.");

  const missing = Object.keys(SECTIONS).filter((s) => !foundSections.includes(s) && s !== "Projects" && s !== "Summary");
  if (missing.length) add("fix", `Add a clear ${missing.join(" and ")} heading`, "Use standard headings so scanners can sort your content.");
  else add("good", "Standard section headings found", `Detected: ${foundSections.join(", ")}.`);

  if (!bullets.length) {
    add("fix", "Use bullet points for accomplishments", "Start lines with “-” or “•” so each achievement stands alone.");
  } else {
    const weakStarts = bullets.length - strongBullets;
    if (weakStarts > bullets.length * 0.4)
      add("fix", `${weakStarts} of ${bullets.length} bullets don't open with an action verb`, "Start with verbs like Built, Reduced, Led or Launched.");
    else add("good", "Bullets open with strong verbs", `${strongBullets} of ${bullets.length} bullets start with an action verb.`);

    if (metricBullets < bullets.length * 0.3)
      add("fix", "Add numbers to your results", `Only ${metricBullets} of ${bullets.length} bullets include a figure. Add percentages, revenue, users or time saved.`);
    else add("good", "Results are quantified", `${metricBullets} of ${bullets.length} bullets include a measurable result.`);
  }

  if (weakHits.length) {
    const uniq = [...new Set(weakHits)];
    add("fix", "Replace vague phrases", `Found: ${uniq.map((w) => `“${w}”`).join(", ")}. Say what you did and what changed.`);
  }

  if (words < 200) add("fix", "Resume is too short", `${words} words. Aim for 350–800 words.`);
  else if (words > 1000) add("fix", "Resume is too long", `${words} words. Trim older roles and aim for 350–800.`);
  else if (words < 350 || words > 800) add("tip", "Length is acceptable", `${words} words. 350–800 is the sweet spot.`);
  else add("good", "Length is on target", `${words} words.`);

  // Keyword match
  let match = null;
  if (jd.trim().length > 40) {
    const kws = keywordsFrom(jd);
    const hit = kws.filter((k) => lower.includes(k));
    const miss = kws.filter((k) => !lower.includes(k));
    match = { score: Math.round(pct(hit.length, kws.length) * 100), hit, miss };
  }

  return { total, categories, findings, match, stats: { words, bullets: bullets.length, strongBullets, metricBullets } };
}

/* Build highlight segments for one line */
function segmentsFor(line) {
  const marks = [];
  const isBullet = BULLET.test(line);

  const v = line.match(verbRe);
  if (v) marks.push({ s: v[1].length, e: v[1].length + v[2].length, t: "verb" });

  for (const m of line.matchAll(weakRe)) marks.push({ s: m.index, e: m.index + m[0].length, t: "weak" });

  if (isBullet) {
    for (const m of line.matchAll(METRIC)) {
      if (!YEAR.test(m[0].trim())) marks.push({ s: m.index, e: m.index + m[0].length, t: "metric" });
    }
  }

  marks.sort((a, b) => a.s - b.s);
  const clean = [];
  let cursor = 0;
  for (const m of marks) {
    if (m.s >= cursor) {
      clean.push(m);
      cursor = m.e;
    }
  }

  const out = [];
  let pos = 0;
  clean.forEach((m, i) => {
    if (m.s > pos) out.push(line.slice(pos, m.s));
    out.push(
      <mark key={i} className={`ra-mark ra-${m.t}`}>
        {line.slice(m.s, m.e)}
      </mark>
    );
    pos = m.e;
  });
  if (pos < line.length) out.push(line.slice(pos));
  return out;
}

/* ------------------------------------------------------------------ */
/*  Sample                                                             */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  File extraction: PDF (pdfjs-dist) and images / scans (tesseract.js) */
/*  Both libraries are loaded on demand, so they don't bloat first load */
/* ------------------------------------------------------------------ */

const MAX_BYTES = 10 * 1024 * 1024;

function normalizeText(t) {
  return t
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((l) => l.replace(/^\s*[«»●■▪◦○]\s*/, "• "))
    .join("\n")
    .trim();
}

/* Rebuild readable lines from pdf.js text items by grouping on the y position */
async function pageToText(page) {
  const content = await page.getTextContent();
  const rows = [];
  for (const it of content.items) {
    if (!("str" in it) || !it.str.trim()) continue;
    const x = it.transform[4];
    const y = it.transform[5];
    let row = rows.find((r) => Math.abs(r.y - y) < 3);
    if (!row) rows.push((row = { y, items: [] }));
    row.items.push({ x, str: it.str });
  }
  rows.sort((a, b) => b.y - a.y);
  return rows
    .map((r) => r.items.sort((a, b) => a.x - b.x).map((i) => i.str).join(" ").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

async function ocrMany(sources, onProgress) {
  const { createWorker } = await import("tesseract.js");
  let index = 0;
  const worker = await createWorker("eng", 1, {
    logger: (m) => {
      if (m.status === "recognizing text") onProgress?.((index + m.progress) / sources.length);
    },
  });
  try {
    const out = [];
    for (index = 0; index < sources.length; index++) {
      const { data } = await worker.recognize(sources[index]);
      out.push(data.text);
    }
    return out.join("\n");
  } finally {
    await worker.terminate();
  }
}

async function extractFromPdf(file, setStatus) {
  const pdfjs = await import("pdfjs-dist");
  // Worker is loaded from a CDN so this works in any bundler. Self-host it if you prefer.
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;

  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    setStatus({ label: `Reading page ${i} of ${pdf.numPages}`, progress: i / pdf.numPages });
    pages.push(await pageToText(await pdf.getPage(i)));
  }
  let text = pages.join("\n");

  // Scanned PDFs have no text layer: render the first pages and run OCR instead
  if (text.replace(/\s/g, "").length < 80) {
    const count = Math.min(pdf.numPages, 3);
    const blobs = [];
    for (let i = 1; i <= count; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      blobs.push(await new Promise((res) => canvas.toBlob(res, "image/png")));
    }
    text = await ocrMany(blobs, (p) => setStatus({ label: "Scanned PDF, running text recognition", progress: p }));
  }
  return text;
}

async function extractText(file, setStatus) {
  const name = file.name.toLowerCase();
  if (file.size > MAX_BYTES) throw new Error("File is larger than 10 MB. Try a smaller file.");

  if (file.type === "application/pdf" || name.endsWith(".pdf")) return extractFromPdf(file, setStatus);

  if (file.type.startsWith("image/")) {
    setStatus({ label: "Running text recognition", progress: 0 });
    return ocrMany([file], (p) => setStatus({ label: "Running text recognition", progress: p }));
  }

  if (/\.(txt|md)$/.test(name) || file.type === "text/plain") return file.text();

  throw new Error("Unsupported file type. Upload a PDF, an image (PNG, JPG, WebP) or a .txt file.");
}

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

/* ------------------------------------------------------------------ */
/*  UI                                                                 */
/* ------------------------------------------------------------------ */

function ScoreRing({ value }) {
  const r = 54;
  const c = 2 * Math.PI * r;
  const color = value >= 75 ? "var(--good)" : value >= 50 ? "var(--warn)" : "var(--fix)";
  return (
    <svg width="140" height="140" viewBox="0 0 140 140" role="img" aria-label={`Score ${value} out of 100`}>
      <circle cx="70" cy="70" r={r} fill="none" stroke="var(--line)" strokeWidth="10" />
      <circle
        cx="70" cy="70" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} transform="rotate(-90 70 70)"
        style={{ transition: "stroke-dashoffset .9s cubic-bezier(.2,.8,.2,1)" }}
      />
      <text x="70" y="72" textAnchor="middle" className="ra-ring-num">{value}</text>
      <text x="70" y="94" textAnchor="middle" className="ra-ring-sub">out of 100</text>
    </svg>
  );
}

export default function ResumeAnalyzer() {
  const [text, setText] = useState("");
  const [jd, setJd] = useState("");
  const [showJd, setShowJd] = useState(false);
  const [result, setResult] = useState(null);
  const [analyzedText, setAnalyzedText] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState(null); // { label, progress } while extracting
  const [fileName, setFileName] = useState("");
  const [dragging, setDragging] = useState(false);
  const busy = status !== null;
  const fileRef = useRef(null);

  const run = () => {
    if (text.trim().length < 80) {
      setError("Paste your full resume text first. It looks too short to analyze.");
      return;
    }
    setError("");
    setResult(analyze(text, jd));
    setAnalyzedText(text);
  };

  const handleFile = async (file) => {
    if (!file) return;
    setError("");
    setFileName("");
    setStatus({ label: "Starting", progress: 0 });
    try {
      const extracted = normalizeText(await extractText(file, setStatus));
      if (extracted.length < 40) {
        throw new Error("No readable text found. Try a clearer scan or a higher-resolution image.");
      }
      setText(extracted);
      setFileName(file.name);
      setResult(null);
    } catch (err) {
      setError(err?.message || "Could not read that file.");
    } finally {
      setStatus(null);
    }
  };

  const onFile = (e) => {
    handleFile(e.target.files?.[0]);
    e.target.value = "";
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    if (!busy) handleFile(e.dataTransfer.files?.[0]);
  };

  const annotated = useMemo(
    () => analyzedText.split("\n").map((line, i) => (
      <div key={i} className="ra-line">{line ? segmentsFor(line) : "\u00A0"}</div>
    )),
    [analyzedText]
  );

  const grade = result
    ? result.total >= 80 ? "Strong" : result.total >= 60 ? "Solid, with gaps" : result.total >= 40 ? "Needs work" : "Needs a rewrite"
    : "";

  return (
    <div className="ra-root">
      <style>{css}</style>

      <header className="ra-head">
        <h1>Resume check</h1>
        <p>Paste your resume and get a score, marked-up text and a short list of fixes. Your text never leaves this page.</p>
      </header>

      <main className="ra-grid">
        {/* Input */}
        <section className="ra-panel" aria-label="Resume input">
          <div
            className={`ra-drop ${dragging ? "ra-drop-on" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,application/pdf,image/png,image/jpeg,image/webp,.txt,.md,text/plain"
              hidden
              onChange={onFile}
            />
            {busy ? (
              <div className="ra-progress" role="status">
                <p>{status.label}</p>
                <div className="ra-bar" role="presentation">
                  <div className="ra-bar-fill" style={{ width: `${Math.round(status.progress * 100)}%`, background: "var(--ink)" }} />
                </div>
              </div>
            ) : (
              <>
                <p className="ra-drop-title">Drop your resume here</p>
                <p className="ra-sub">PDF, or a photo or screenshot (PNG, JPG, WebP). Up to 10 MB.</p>
                <button className="ra-secondary" onClick={() => fileRef.current?.click()}>Choose file</button>
                {fileName && <p className="ra-file">Read {fileName}. Check the text below before analyzing.</p>}
              </>
            )}
          </div>

          <div className="ra-row">
            <label htmlFor="resume" className="ra-label">Resume text</label>
            <div className="ra-actions">
              <button className="ra-link" onClick={() => { setText(SAMPLE); setFileName(""); }}>Use sample</button>
              {text && <button className="ra-link" onClick={() => { setText(""); setFileName(""); setResult(null); }}>Clear</button>}
            </div>
          </div>
          <textarea
            id="resume"
            className="ra-textarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"Extracted text appears here, or paste it yourself.\nStart achievements with “-” or “•” so bullets are detected."}
            rows={14}
          />

          <button className="ra-toggle" onClick={() => setShowJd(!showJd)} aria-expanded={showJd}>
            {showJd ? "Remove job description" : "Compare against a job description"}
          </button>
          {showJd && (
            <textarea
              className="ra-textarea ra-jd"
              value={jd}
              onChange={(e) => setJd(e.target.value)}
              placeholder="Paste the job description to see which keywords your resume covers."
              rows={7}
              aria-label="Job description"
            />
          )}

          {error && <p className="ra-error" role="alert">{error}</p>}
          <button className="ra-primary" onClick={run}>Analyze resume</button>
        </section>

        {/* Results */}
        <section className="ra-results" aria-live="polite">
          {!result ? (
            <div className="ra-empty">
              <p className="ra-empty-title">Nothing analyzed yet</p>
              <p>Add your resume on the left, then select Analyze resume. Or try the sample to see how the marked-up view works.</p>
              <ul className="ra-legend">
                <li><mark className="ra-mark ra-verb">Built</mark> strong action verb</li>
                <li><mark className="ra-mark ra-metric">42%</mark> measurable result</li>
                <li><mark className="ra-mark ra-weak">worked on</mark> vague phrase to replace</li>
              </ul>
            </div>
          ) : (
            <>
              <div className="ra-score-card">
                <ScoreRing value={result.total} />
                <div>
                  <p className="ra-grade">{grade}</p>
                  <p className="ra-stats">
                    {result.stats.words} words, {result.stats.bullets} bullets, {result.stats.metricBullets} with numbers
                  </p>
                </div>
              </div>

              <div className="ra-block">
                <h2>Score breakdown</h2>
                {result.categories.map((c) => (
                  <div key={c.name} className="ra-bar-row">
                    <span>{c.name}</span>
                    <div className="ra-bar" role="presentation">
                      <div
                        className="ra-bar-fill"
                        style={{
                          width: `${(c.score / c.max) * 100}%`,
                          background: c.score / c.max >= 0.75 ? "var(--good)" : c.score / c.max >= 0.5 ? "var(--warn)" : "var(--fix)",
                        }}
                      />
                    </div>
                    <span className="ra-bar-num">{c.score}/{c.max}</span>
                  </div>
                ))}
              </div>

              <div className="ra-block">
                <h2>What to change</h2>
                <ul className="ra-findings">
                  {[...result.findings]
                    .sort((a, b) => ["fix", "tip", "good"].indexOf(a.level) - ["fix", "tip", "good"].indexOf(b.level))
                    .map((f, i) => (
                      <li key={i} className={`ra-find ra-find-${f.level}`}>
                        <span className="ra-tag">{f.level === "fix" ? "Fix" : f.level === "tip" ? "Tip" : "Good"}</span>
                        <div>
                          <strong>{f.title}</strong>
                          <p>{f.detail}</p>
                        </div>
                      </li>
                    ))}
                </ul>
              </div>

              {result.match && (
                <div className="ra-block">
                  <h2>Job description match: {result.match.score}%</h2>
                  <p className="ra-sub">Found in your resume</p>
                  <div className="ra-chips">
                    {result.match.hit.length ? result.match.hit.map((k) => <span key={k} className="ra-chip ra-chip-hit">{k}</span>) : <span className="ra-sub">None</span>}
                  </div>
                  <p className="ra-sub">Missing. Add the ones that are true for you.</p>
                  <div className="ra-chips">
                    {result.match.miss.length ? result.match.miss.map((k) => <span key={k} className="ra-chip ra-chip-miss">{k}</span>) : <span className="ra-sub">Nothing missing</span>}
                  </div>
                </div>
              )}

              <div className="ra-block">
                <h2>Marked-up resume</h2>
                <ul className="ra-legend ra-legend-inline">
                  <li><mark className="ra-mark ra-verb">verb</mark></li>
                  <li><mark className="ra-mark ra-metric">result</mark></li>
                  <li><mark className="ra-mark ra-weak">vague</mark></li>
                </ul>
                <div className="ra-paper">{annotated}</div>
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const css = `
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&family=Instrument+Sans:wght@400;500;600&display=swap');

.ra-root{
  --ink:#16213a; --muted:#5b6478; --paper:#ffffff; --bg:#eef2f8; --line:#d9e0ec;
  --fix:#c8283d; --warn:#b7791f; --good:#1f8a5f;
  --hl-verb:#ffe45e; --hl-metric:#b8ecd0; --hl-weak:#ffd3d8;
  min-height:100vh; background:var(--bg); color:var(--ink);
  font-family:'Instrument Sans',system-ui,sans-serif; font-size:15px; line-height:1.5;
  padding:clamp(20px,4vw,56px); box-sizing:border-box;
}
.ra-root *{box-sizing:border-box}
@media (prefers-color-scheme:dark){
  .ra-root{--ink:#e7ecf7; --muted:#9aa5bd; --paper:#1a2338; --bg:#0f1526; --line:#2b3654;
    --hl-verb:#6b5a00; --hl-metric:#14573b; --hl-weak:#6a2430; --fix:#ff6b7f; --warn:#e0a94a; --good:#4cc48f}
}
.ra-head{max-width:1200px;margin:0 auto 28px}
.ra-head h1{font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:clamp(34px,5vw,56px);letter-spacing:-.02em;line-height:1.02;margin:0 0 10px}
.ra-head p{margin:0;max-width:56ch;color:var(--muted);font-size:17px}

.ra-grid{max-width:1200px;margin:0 auto;display:grid;gap:24px;grid-template-columns:minmax(0,5fr) minmax(0,6fr);align-items:start}
@media (max-width:900px){.ra-grid{grid-template-columns:1fr}}

.ra-panel{background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:20px;position:sticky;top:20px}
@media (max-width:900px){.ra-panel{position:static}}
.ra-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.ra-label{font-weight:600}
.ra-actions{display:flex;gap:14px}
.ra-link,.ra-toggle{background:none;border:0;color:var(--ink);text-decoration:underline;text-underline-offset:3px;cursor:pointer;font:inherit;padding:0}
.ra-toggle{margin:12px 0 8px;display:block}
.ra-textarea{width:100%;resize:vertical;border:1px solid var(--line);border-radius:8px;padding:14px;background:transparent;color:var(--ink);
  font-family:'Source Serif 4',Georgia,serif;font-size:15px;line-height:1.6}
.ra-jd{font-family:'Instrument Sans',sans-serif;font-size:14px}
.ra-textarea:focus,.ra-primary:focus-visible,.ra-link:focus-visible,.ra-toggle:focus-visible{outline:3px solid var(--ink);outline-offset:2px}
.ra-primary{margin-top:14px;width:100%;padding:14px;border:0;border-radius:8px;background:var(--ink);color:var(--paper);font:600 16px 'Instrument Sans',sans-serif;cursor:pointer}
.ra-primary:hover{opacity:.9}
.ra-error{color:var(--fix);margin:10px 0 0;font-weight:500}

.ra-drop{border:2px dashed var(--line);border-radius:10px;padding:20px;margin-bottom:18px;text-align:center;transition:border-color .15s,background .15s}
.ra-drop-on{border-color:var(--ink);background:var(--bg)}
.ra-drop-title{font:700 20px 'Bricolage Grotesque',sans-serif;margin:0 0 2px}
.ra-drop .ra-sub{margin:0 0 12px}
.ra-secondary{padding:9px 18px;border:1.5px solid var(--ink);border-radius:8px;background:transparent;color:var(--ink);font:600 14px 'Instrument Sans',sans-serif;cursor:pointer}
.ra-secondary:hover{background:var(--bg)}
.ra-secondary:focus-visible{outline:3px solid var(--ink);outline-offset:2px}
.ra-file{margin:12px 0 0;color:var(--good);font-weight:500;font-size:14px}
.ra-progress p{margin:0 0 10px;font-weight:500}

.ra-empty{background:var(--paper);border:1px dashed var(--line);border-radius:14px;padding:28px}
.ra-empty-title{font-family:'Bricolage Grotesque',sans-serif;font-size:22px;font-weight:700;margin:0 0 6px}
.ra-empty p{margin:0 0 14px;color:var(--muted);max-width:52ch}

.ra-score-card{display:flex;gap:24px;align-items:center;background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:20px;margin-bottom:16px}
.ra-ring-num{font:700 40px 'Bricolage Grotesque',sans-serif;fill:var(--ink)}
.ra-ring-sub{font:500 12px 'Instrument Sans',sans-serif;fill:var(--muted)}
.ra-grade{font:700 28px 'Bricolage Grotesque',sans-serif;margin:0;letter-spacing:-.01em}
.ra-stats{margin:4px 0 0;color:var(--muted)}

.ra-block{background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:20px;margin-bottom:16px}
.ra-block h2{font:700 20px 'Bricolage Grotesque',sans-serif;margin:0 0 14px;letter-spacing:-.01em}
.ra-sub{color:var(--muted);margin:10px 0 6px;font-size:14px}

.ra-bar-row{display:grid;grid-template-columns:150px 1fr 52px;gap:12px;align-items:center;margin-bottom:9px}
@media (max-width:480px){.ra-bar-row{grid-template-columns:110px 1fr 46px}}
.ra-bar{height:8px;background:var(--line);border-radius:99px;overflow:hidden}
.ra-bar-fill{height:100%;border-radius:99px;transition:width .8s cubic-bezier(.2,.8,.2,1)}
.ra-bar-num{text-align:right;color:var(--muted);font-variant-numeric:tabular-nums}

.ra-findings{list-style:none;margin:0;padding:0;display:grid;gap:12px}
.ra-find{display:grid;grid-template-columns:52px 1fr;gap:12px;align-items:start}
.ra-find p{margin:2px 0 0;color:var(--muted)}
.ra-tag{font-weight:600;font-size:13px;text-align:center;border-radius:6px;padding:3px 0;border:1.5px solid currentColor}
.ra-find-fix .ra-tag{color:var(--fix)} .ra-find-tip .ra-tag{color:var(--warn)} .ra-find-good .ra-tag{color:var(--good)}

.ra-chips{display:flex;flex-wrap:wrap;gap:6px}
.ra-chip{padding:3px 10px;border-radius:99px;font-size:13px;border:1px solid var(--line)}
.ra-chip-hit{background:var(--hl-metric)} .ra-chip-miss{border-style:dashed}

.ra-paper{font-family:'Source Serif 4',Georgia,serif;font-size:15px;line-height:1.7;border:1px solid var(--line);border-radius:8px;padding:18px;overflow-x:auto;background:var(--bg)}
.ra-line{white-space:pre-wrap;overflow-wrap:anywhere}
.ra-mark{color:inherit;padding:0 2px;border-radius:3px}
.ra-verb{background:var(--hl-verb)} .ra-metric{background:var(--hl-metric)}
.ra-weak{background:var(--hl-weak);text-decoration:underline wavy var(--fix);text-underline-offset:3px}

.ra-legend{list-style:none;padding:0;margin:0;display:grid;gap:8px}
.ra-legend-inline{display:flex;gap:14px;margin-bottom:12px}

@media (prefers-reduced-motion:reduce){.ra-bar-fill,.ra-root circle{transition:none!important}}
`;
