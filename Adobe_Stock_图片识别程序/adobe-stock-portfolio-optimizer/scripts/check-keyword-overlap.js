const fs = require("fs");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (inQuotes && char === '"' && next === '"') {
      field += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && char === ",") {
      row.push(field);
      field = "";
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  row.push(field);
  if (row.some((value) => value !== "")) rows.push(row);
  if (rows.length === 0) return [];

  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).map((values) => {
    const object = {};
    headers.forEach((header, index) => {
      object[header] = values[index] || "";
    });
    return object;
  });
}

function splitKeywords(value) {
  return String(value || "")
    .split(",")
    .map((keyword) => keyword.trim().toLowerCase())
    .filter(Boolean);
}

function normalizeTitle(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2);
}

function intersectionCount(left, right) {
  const set = new Set(right);
  return left.filter((item) => set.has(item)).length;
}

function scoreCandidate(candidate, portfolioRows) {
  const candidateKeywords = splitKeywords(candidate.keywords);
  const candidateFront10 = candidateKeywords.slice(0, 10);
  const candidateTitleWords = normalizeTitle(candidate.title);

  const matches = portfolioRows
    .map((row) => {
      const oldKeywords = splitKeywords(row.keywords);
      const oldFront10 = oldKeywords.slice(0, 10);
      const front10Overlap = intersectionCount(candidateFront10, oldFront10);
      const allOverlap = intersectionCount(candidateKeywords, oldKeywords);
      const allOverlapRatio = candidateKeywords.length
        ? allOverlap / candidateKeywords.length
        : 0;
      const titleOverlap = intersectionCount(
        candidateTitleWords,
        normalizeTitle(row.title)
      );

      return {
        asset_id: row.asset_id || row.assetId || "",
        title: row.title || "",
        front10Overlap,
        allOverlap,
        allOverlapRatio,
        titleOverlap,
      };
    })
    .sort((a, b) => {
      return (
        b.front10Overlap - a.front10Overlap ||
        b.allOverlapRatio - a.allOverlapRatio ||
        b.titleOverlap - a.titleOverlap
      );
    });

  const bestMatch = matches[0] || {
    asset_id: "",
    title: "",
    front10Overlap: 0,
    allOverlap: 0,
    allOverlapRatio: 0,
    titleOverlap: 0,
  };

  let risk = "low";
  if (
    bestMatch.front10Overlap >= 5 ||
    bestMatch.allOverlapRatio >= 0.5 ||
    (bestMatch.titleOverlap >= 3 && bestMatch.front10Overlap >= 3)
  ) {
    risk = "high";
  } else if (bestMatch.front10Overlap >= 3 || bestMatch.allOverlapRatio >= 0.3) {
    risk = "medium";
  }

  return {
    risk,
    bestMatch,
  };
}

function parseCandidateLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^\d+\.\s+/.test(line))
    .map((line) => {
      const withoutNumber = line.replace(/^\d+\.\s+/, "");
      const parts = withoutNumber.split(/[:：]/);
      if (parts.length >= 2) {
        return {
          title: parts[0].trim(),
          keywords: parts.slice(1).join(":").trim(),
          source: line,
        };
      }
      return {
        title: "",
        keywords: withoutNumber,
        source: line,
      };
    });
}

function runCli(argv) {
  const [portfolioPath, candidatePath] = argv;
  if (!portfolioPath || !candidatePath) {
    throw new Error(
      "Usage: node check-keyword-overlap.js <portfolio.csv> <candidate-keywords.md>"
    );
  }

  const portfolioRows = parseCsv(fs.readFileSync(portfolioPath, "utf8"));
  const candidates = parseCandidateLines(fs.readFileSync(candidatePath, "utf8"));
  const scored = candidates.map((candidate, index) => ({
    index: index + 1,
    source: candidate.source,
    ...scoreCandidate(candidate, portfolioRows),
  }));

  const high = scored.filter((item) => item.risk === "high");
  const medium = scored.filter((item) => item.risk === "medium");

  console.log(`Candidates: ${scored.length}`);
  console.log(`High risk: ${high.length}`);
  console.log(`Medium risk: ${medium.length}`);

  for (const item of scored.filter((entry) => entry.risk !== "low")) {
    console.log(
      [
        `[${item.risk}] #${item.index}`,
        `match=${item.bestMatch.asset_id}`,
        `front10=${item.bestMatch.front10Overlap}`,
        `ratio=${item.bestMatch.allOverlapRatio.toFixed(2)}`,
        `old="${item.bestMatch.title}"`,
      ].join(" ")
    );
  }
}

if (require.main === module) {
  try {
    runCli(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  parseCsv,
  splitKeywords,
  scoreCandidate,
  parseCandidateLines,
};
