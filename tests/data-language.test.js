const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.resolve(__dirname, '../pages/data.html'), 'utf8');

test('data page keeps the ROI strategy sentence fully bilingual', () => {
  assert.match(html, /<span data-lang="zh">（对 ROI &lt; 0\.3 及缩减预算），年度整体投放效率提升 <\/span>/);
  assert.match(html, /<span data-lang="en">\(for ROI &lt; 0\.3 and reduced budgets\), improving overall annual ad efficiency by <\/span>/);
});

test('data page English video labels contain no Chinese characters', () => {
  const englishLabels = [...html.matchAll(/<span data-lang="en">([^<]*)<\/span>/g)].map((match) => match[1]);
  assert.equal(englishLabels.some((label) => /[\u3400-\u9fff]/u.test(label)), false);
});
