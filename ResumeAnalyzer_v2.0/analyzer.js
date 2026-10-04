/* Resume analysis engine. Pure functions, no DOM access.
   Exposes window.Analyzer = { analyze, lineSegments } */
(function () {
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
    ("the and for with you your our are will have has from that this their they them who what when where " +
     "which into over than then also able about across such more most other some any all can not but its " +
     "it's per new use using used work works team teams role roles job years year experience skills strong " +
     "ability including within must should would could etc").split(" ")
  );

  const BULLET = /^\s*[-•*–·▪●]\s+/;
  const YEAR = /^(19|20)\d{2}$/;
  const METRIC_SRC = /(\$\s?\d[\d,.]*\s?[kKmMbB]?\b|\b\d[\d,.]*\s?(?:%|x|X|k|K|\+)|\b\d{2,}[\d,.]*\b)/.source;

  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const WEAK_SRC = `\\b(${WEAK_PHRASES.map(escapeRe).join("|")})\\b`;
  const verbRe = new RegExp(`^(\\s*[-•*–·▪●]\\s+)(${ACTION_VERBS.join("|")})\\b`, "i");

  // Fresh global regexes per call (global regexes keep state between uses)
  const metricRe = () => new RegExp(METRIC_SRC, "g");
  const weakRe = () => new RegExp(WEAK_SRC, "gi");

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
    jd = jd || "";
    const lines = text.split("\n");
    const words = (text.match(/\S+/g) || []).length;
    const bullets = lines.filter((l) => BULLET.test(l));
    const lower = text.toLowerCase();

    const contact = {
      Email: /[\w.+-]+@[\w-]+\.[\w.-]+/.test(text),
      Phone: /(\+?\d[\d\s().-]{8,}\d)/.test(text),
      "LinkedIn or GitHub": /linkedin\.com|github\.com/i.test(text),
    };
    const contactHits = Object.values(contact).filter(Boolean).length;

    const foundSections = Object.keys(SECTIONS).filter((name) =>
      lines.some((l) => l.trim().length < 40 && SECTIONS[name].test(l.trim()))
    );

    const strongBullets = bullets.filter((b) => verbRe.test(b)).length;
    const metricBullets = bullets.filter((b) =>
      (b.match(metricRe()) || []).some((x) => !YEAR.test(x.trim()))
    ).length;
    const weakHits = [...text.matchAll(weakRe())].map((m) => m[0].toLowerCase());

    const pct = (a, b) => (b ? a / b : 0);

    const categories = [
      { name: "Contact details", max: 15, score: Math.round((contactHits / 3) * 15) },
      { name: "Structure", max: 20, score: Math.round(Math.min(foundSections.length / 4, 1) * 20) },
      { name: "Action verbs", max: 20, score: Math.round(Math.min(pct(strongBullets, bullets.length) / 0.7, 1) * 20) },
      { name: "Measurable results", max: 20, score: Math.round(Math.min(pct(metricBullets, bullets.length) / 0.5, 1) * 20) },
      { name: "Length", max: 10, score: words >= 350 && words <= 800 ? 10 : words >= 200 && words <= 1000 ? 6 : 2 },
      { name: "Plain language", max: 15, score: Math.max(15 - weakHits.length * 3, 0) },
    ];
    const total = categories.reduce((s, c) => s + c.score, 0);

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

    let match = null;
    if (jd.trim().length > 40) {
      const kws = keywordsFrom(jd);
      const hit = kws.filter((k) => lower.includes(k));
      const miss = kws.filter((k) => !lower.includes(k));
      match = { score: Math.round(pct(hit.length, kws.length) * 100), hit, miss };
    }

    return {
      total, categories, findings, match,
      stats: { words, bullets: bullets.length, strongBullets, metricBullets },
    };
  }

  /* Split one line into [{ text, type }] where type is "verb" | "metric" | "weak" | null */
  function lineSegments(line) {
    const marks = [];
    const v = line.match(verbRe);
    if (v) marks.push({ s: v[1].length, e: v[1].length + v[2].length, t: "verb" });

    for (const m of line.matchAll(weakRe())) marks.push({ s: m.index, e: m.index + m[0].length, t: "weak" });

    if (BULLET.test(line)) {
      for (const m of line.matchAll(metricRe())) {
        if (!YEAR.test(m[0].trim())) marks.push({ s: m.index, e: m.index + m[0].length, t: "metric" });
      }
    }

    marks.sort((a, b) => a.s - b.s);
    const out = [];
    let pos = 0;
    for (const m of marks) {
      if (m.s < pos) continue; // drop overlaps
      if (m.s > pos) out.push({ text: line.slice(pos, m.s), type: null });
      out.push({ text: line.slice(m.s, m.e), type: m.t });
      pos = m.e;
    }
    if (pos < line.length) out.push({ text: line.slice(pos), type: null });
    return out;
  }

  window.Analyzer = { analyze, lineSegments };
})();
