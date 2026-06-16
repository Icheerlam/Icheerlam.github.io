const assert = require("assert");
const {
  parseCsv,
  splitKeywords,
  scoreCandidate,
} = require("./check-keyword-overlap");

const csv = [
  "asset_id,title,keywords",
  '1,"Interior room","interior design, living room, sofa, home, window, light"',
  '2,"Payment terminal","payment terminal, credit card, retail checkout, fintech, receipt"',
].join("\n");

const rows = parseCsv(csv);
assert.strictEqual(rows.length, 2);
assert.strictEqual(rows[0].title, "Interior room");
assert.strictEqual(rows[1].asset_id, "2");

assert.deepStrictEqual(splitKeywords("cat, dog, sky"), ["cat", "dog", "sky"]);

const score = scoreCandidate(
  {
    title: "Card payment checkout",
    keywords:
      "payment terminal, credit card, retail checkout, fintech, contactless, receipt",
  },
  rows
);

assert.strictEqual(score.risk, "high");
assert.strictEqual(score.bestMatch.asset_id, "2");
assert.strictEqual(score.bestMatch.front10Overlap, 5);

const low = scoreCandidate(
  {
    title: "Flood preparation",
    keywords: "sandbags, flood prevention, storm warning, emergency kit",
  },
  rows
);

assert.strictEqual(low.risk, "low");

console.log("check-keyword-overlap tests passed");
