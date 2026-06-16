const assert = require("assert");
const {
  csvEscape,
  splitKeywords,
  parseDetailText,
  buildOptions,
} = require("./portfolio-cdp-scraper");

assert.strictEqual(csvEscape("a,b"), '"a,b"');
assert.strictEqual(csvEscape('a "b"'), '"a ""b"""');
assert.deepStrictEqual(splitKeywords("cat, dog, sky"), ["cat", "dog", "sky"]);

const detail = parseDetailText(`
FILE # 1624460668
DIMENSION
6656 x 3744
FORMAT
JPG
UPLOAD DATE
August 2, 2025
Title
Gardening Tools and Plants in a Well-Organized Shed

Category
Culture and Religion

Language
English

Keywords (39)
gardening tools, shovel, bucket, gloves, plants, wooden shelves, outdoor

RELEASES
DOWNLOADS
2
`);

assert.strictEqual(detail.assetId, "1624460668");
assert.strictEqual(detail.title, "Gardening Tools and Plants in a Well-Organized Shed");
assert.strictEqual(detail.category, "Culture and Religion");
assert.strictEqual(detail.language, "English");
assert.deepStrictEqual(detail.keywords, [
  "gardening tools",
  "shovel",
  "bucket",
  "gloves",
  "plants",
  "wooden shelves",
  "outdoor",
]);

assert.deepStrictEqual(buildOptions(["--maxItems", "10", "--autoNextPage"]), {
  maxItems: 10,
  autoNextPage: true,
});

console.log("portfolio-cdp-scraper tests passed");
