const assert = require("assert");
const {
  auditBatch,
  parseCandidateLines,
  selectBatch,
  selectPrevious,
} = require("./audit-keyword-batch");
const { parseCsv } = require("./check-keyword-overlap");

const portfolioRows = parseCsv(
  [
    "asset_id,title,keywords",
    '1,"Card payment checkout","payment terminal, credit card, retail checkout, fintech, receipt"',
  ].join("\n")
);

const candidates = parseCandidateLines(
  [
    "1. 旧陶瓷静物：ceramic object, studio light, no people, no text, calm surface",
    "2. 新陶瓷静物：ceramic object, studio light, calm surface, no people, no text, new angle",
    "3. 付款终端：payment terminal, credit card, retail checkout, fintech, receipt, no people, no text",
    "4. 缺少文字约束：stone texture, no people, macro surface",
  ].join("\n")
);

assert.strictEqual(candidates.length, 4);
assert.strictEqual(candidates[0].number, 1);
assert.strictEqual(candidates[0].title, "旧陶瓷静物");

const batch = selectBatch(candidates, 2, 4);
const previous = selectPrevious(candidates, 2);
assert.deepStrictEqual(
  batch.map((item) => item.number),
  [2, 3, 4]
);
assert.deepStrictEqual(
  previous.map((item) => item.number),
  [1]
);

const result = auditBatch({
  portfolioRows,
  candidates,
  batch,
  previous,
  options: {
    require: ["no people", "no text"],
    ignore: ["no people", "no text"],
  },
});

assert.strictEqual(result.missingRequired.length, 1);
assert.strictEqual(result.missingRequired[0].candidate.number, 4);
assert.strictEqual(result.portfolioHigh.length, 1);
assert.strictEqual(result.portfolioHigh[0].candidate.number, 3);
assert.strictEqual(result.previousHits.length, 1);
assert.strictEqual(result.previousHits[0].candidate.number, 2);
assert.strictEqual(result.internalHits.length, 0);

console.log("audit-keyword-batch tests passed");
