const fs = require("fs");
const path = require("path");
const { parseCsv, scoreCandidate } = require("./check-keyword-overlap");

const DEFAULT_IGNORED_TERMS = [
  "no people",
  "no text",
  "no writing",
  "no markings",
  "no logo",
  "unbranded",
  "unlabeled",
  "blank",
  "plain",
  "clean background",
  "simple arrangement",
  "studio surface",
  "studio still life",
  "soft reflection",
  "clean surface",
  "simple object",
  "product mockup",
  "minimal composition",
  "copy space",
];

function parseArgs(argv) {
  const options = {
    portfolio: "",
    candidates: "",
    from: null,
    to: null,
    require: [],
    ignore: DEFAULT_IGNORED_TERMS,
    failOnIssues: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--portfolio") {
      options.portfolio = next;
      index += 1;
    } else if (arg === "--candidates") {
      options.candidates = next;
      index += 1;
    } else if (arg === "--from") {
      options.from = Number(next);
      index += 1;
    } else if (arg === "--to") {
      options.to = Number(next);
      index += 1;
    } else if (arg === "--require") {
      options.require = splitList(next);
      index += 1;
    } else if (arg === "--ignore") {
      options.ignore = [...DEFAULT_IGNORED_TERMS, ...splitList(next)];
      index += 1;
    } else if (arg === "--failOnIssues") {
      options.failOnIssues = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function splitList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function parseCandidateLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^\d+\.\s+/.test(line))
    .map((line) => {
      const match = line.match(/^(\d+)\.\s+(.*)$/);
      const number = Number(match[1]);
      const body = match[2];
      const separatorIndex = body.search(/[:：]/);
      const title =
        separatorIndex >= 0 ? body.slice(0, separatorIndex).trim() : "";
      const keywords =
        separatorIndex >= 0 ? body.slice(separatorIndex + 1).trim() : body;

      return {
        number,
        title,
        keywords,
        keywordList: splitList(keywords),
        source: line,
      };
    });
}

function selectBatch(candidates, from, to) {
  if (Number.isFinite(from) && Number.isFinite(to)) {
    return candidates.filter(
      (candidate) => candidate.number >= from && candidate.number <= to
    );
  }
  return candidates;
}

function selectPrevious(candidates, from) {
  if (Number.isFinite(from)) {
    return candidates.filter((candidate) => candidate.number < from);
  }
  return [];
}

function filteredKeywords(candidate, ignoredTerms) {
  const ignored = new Set(ignoredTerms);
  return candidate.keywordList.filter((keyword) => !ignored.has(keyword));
}

function intersectionCount(left, right) {
  const set = new Set(right);
  return left.filter((item) => set.has(item)).length;
}

function bestCandidateMatch(candidate, previous, ignoredTerms) {
  const candidateKeywords = filteredKeywords(candidate, ignoredTerms);
  const candidateFront10 = candidateKeywords.slice(0, 10);

  let best = {
    previous: null,
    front10Overlap: 0,
    allOverlap: 0,
    allOverlapRatio: 0,
  };

  for (const old of previous) {
    const oldKeywords = filteredKeywords(old, ignoredTerms);
    const oldFront10 = oldKeywords.slice(0, 10);
    const front10Overlap = intersectionCount(candidateFront10, oldFront10);
    const allOverlap = intersectionCount(candidateKeywords, oldKeywords);
    const allOverlapRatio = candidateKeywords.length
      ? allOverlap / candidateKeywords.length
      : 0;

    if (
      front10Overlap > best.front10Overlap ||
      (front10Overlap === best.front10Overlap &&
        allOverlapRatio > best.allOverlapRatio)
    ) {
      best = { previous: old, front10Overlap, allOverlap, allOverlapRatio };
    }
  }

  return best;
}

function auditBatch({ portfolioRows, candidates, batch, previous, options }) {
  const requiredTerms = options.require;
  const ignoredTerms = options.ignore;

  const missingRequired = batch
    .map((candidate) => {
      const raw = candidate.source.toLowerCase();
      const missing = requiredTerms.filter((term) => !raw.includes(term));
      return missing.length ? { candidate, missing } : null;
    })
    .filter(Boolean);

  const portfolioScored = portfolioRows
    ? batch.map((candidate) => ({
        candidate,
        ...scoreCandidate(candidate, portfolioRows),
      }))
    : [];

  const portfolioHigh = portfolioScored.filter((item) => item.risk === "high");
  const portfolioMedium = portfolioScored.filter(
    (item) => item.risk === "medium"
  );

  const previousHits = [];
  for (const candidate of batch) {
    const best = bestCandidateMatch(candidate, previous, ignoredTerms);
    if (
      best.previous &&
      (best.front10Overlap >= 3 || best.allOverlapRatio >= 0.3)
    ) {
      previousHits.push({ candidate, best });
    }
  }

  const internalHits = [];
  for (let i = 0; i < batch.length; i += 1) {
    for (let j = i + 1; j < batch.length; j += 1) {
      const left = batch[i];
      const right = batch[j];
      const leftKeywords = filteredKeywords(left, ignoredTerms);
      const rightKeywords = filteredKeywords(right, ignoredTerms);
      const front10Overlap = intersectionCount(
        leftKeywords.slice(0, 10),
        rightKeywords.slice(0, 10)
      );
      const allOverlap = intersectionCount(leftKeywords, rightKeywords);
      const allOverlapRatio = leftKeywords.length
        ? allOverlap / leftKeywords.length
        : 0;

      if (front10Overlap >= 4 || allOverlapRatio >= 0.45) {
        internalHits.push({
          left,
          right,
          front10Overlap,
          allOverlap,
          allOverlapRatio,
        });
      }
    }
  }

  return {
    totalCandidates: candidates.length,
    batchCount: batch.length,
    previousCount: previous.length,
    missingRequired,
    portfolioHigh,
    portfolioMedium,
    previousHits,
    internalHits,
  };
}

function formatPercent(value) {
  return value.toFixed(2);
}

function printAudit(result, options) {
  console.log(`Candidates total: ${result.totalCandidates}`);
  console.log(`Batch candidates: ${result.batchCount}`);
  if (Number.isFinite(options.from) && Number.isFinite(options.to)) {
    console.log(`Batch range: ${options.from}-${options.to}`);
  }
  console.log(`Previous candidates: ${result.previousCount}`);
  console.log(`Missing required terms: ${result.missingRequired.length}`);
  console.log(`Portfolio high risk: ${result.portfolioHigh.length}`);
  console.log(`Portfolio medium risk: ${result.portfolioMedium.length}`);
  console.log(`Previous-candidate similar hits: ${result.previousHits.length}`);
  console.log(`In-batch similar pairs: ${result.internalHits.length}`);

  for (const item of result.missingRequired) {
    console.log(
      `[missing] #${item.candidate.number} missing=${item.missing.join("|")}`
    );
  }

  for (const item of [...result.portfolioHigh, ...result.portfolioMedium]) {
    console.log(
      [
        `[portfolio:${item.risk}] #${item.candidate.number}`,
        `match=${item.bestMatch.asset_id}`,
        `front10=${item.bestMatch.front10Overlap}`,
        `ratio=${formatPercent(item.bestMatch.allOverlapRatio)}`,
        `old="${item.bestMatch.title}"`,
      ].join(" ")
    );
  }

  for (const item of result.previousHits) {
    console.log(
      [
        `[previous] #${item.candidate.number} "${item.candidate.title}"`,
        `old=#${item.best.previous.number} "${item.best.previous.title}"`,
        `front10=${item.best.front10Overlap}`,
        `ratio=${formatPercent(item.best.allOverlapRatio)}`,
      ].join(" ")
    );
  }

  for (const item of result.internalHits) {
    console.log(
      [
        `[internal] #${item.left.number} "${item.left.title}"`,
        `#${item.right.number} "${item.right.title}"`,
        `front10=${item.front10Overlap}`,
        `ratio=${formatPercent(item.allOverlapRatio)}`,
      ].join(" ")
    );
  }
}

function usage() {
  return [
    "Usage:",
    "  node audit-keyword-batch.js --portfolio portfolio-latest.csv --candidates candidates.md --from 1121 --to 1220 --require \"no people,no text\"",
    "",
    "Options:",
    "  --portfolio PATH     Portfolio CSV exported by portfolio-cdp-scraper.js",
    "  --candidates PATH    Markdown/text file with numbered candidate lines",
    "  --from N --to N      Candidate number range to audit",
    "  --require A,B        Required terms that must appear in every batch line",
    "  --ignore A,B         Extra keyword terms ignored in candidate-vs-candidate checks",
    "  --failOnIssues       Exit with code 2 when any issue is found",
  ].join("\n");
}

function runCli(argv) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return;
  }
  if (!options.candidates) {
    throw new Error("Missing --candidates\n\n" + usage());
  }

  const candidatePath = path.resolve(options.candidates);
  const candidates = parseCandidateLines(fs.readFileSync(candidatePath, "utf8"));
  const batch = selectBatch(candidates, options.from, options.to);
  const previous = selectPrevious(candidates, options.from);

  let portfolioRows = null;
  if (options.portfolio) {
    portfolioRows = parseCsv(fs.readFileSync(path.resolve(options.portfolio), "utf8"));
  }

  const result = auditBatch({ portfolioRows, candidates, batch, previous, options });
  printAudit(result, options);

  const issueCount =
    result.missingRequired.length +
    result.portfolioHigh.length +
    result.portfolioMedium.length +
    result.previousHits.length +
    result.internalHits.length;

  if (options.failOnIssues && issueCount > 0) {
    process.exitCode = 2;
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
  DEFAULT_IGNORED_TERMS,
  parseArgs,
  parseCandidateLines,
  selectBatch,
  selectPrevious,
  filteredKeywords,
  bestCandidateMatch,
  auditBatch,
};
