/* Text extraction from PDFs (pdf.js) and images / scans (Tesseract OCR).
   Exposes window.Extractor = { extractText, normalizeText }
   Requires the pdfjsLib and Tesseract globals loaded in index.html. */
(function () {
  const MAX_BYTES = 10 * 1024 * 1024;

  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

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
      if (!row) { row = { y, items: [] }; rows.push(row); }
      row.items.push({ x, str: it.str });
    }
    rows.sort((a, b) => b.y - a.y);
    return rows
      .map((r) => r.items.sort((a, b) => a.x - b.x).map((i) => i.str).join(" ").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join("\n");
  }

  async function ocrMany(sources, onProgress) {
    let index = 0;
    const worker = await Tesseract.createWorker("eng", 1, {
      logger: (m) => {
        if (m.status === "recognizing text" && onProgress) onProgress((index + m.progress) / sources.length);
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
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
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
      text = await ocrMany(blobs, (p) =>
        setStatus({ label: "Scanned PDF, running text recognition", progress: p })
      );
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

  window.Extractor = { extractText, normalizeText };
})();
