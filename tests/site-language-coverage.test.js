const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function publicHtmlFiles() {
  const rootPages = fs.readdirSync(root)
    .filter((name) => name.endsWith('.html'))
    .map((name) => path.join(root, name));
  const nestedPages = fs.readdirSync(path.join(root, 'pages'))
    .filter((name) => name.endsWith('.html'))
    .map((name) => path.join(root, 'pages', name));
  return [...rootPages, ...nestedPages];
}

test('all public pages use exactly one shared language module', () => {
  const failures = [];
  for (const file of publicHtmlFiles()) {
    const html = fs.readFileSync(file, 'utf8');
    const documentMarkup = html.replace(/<script\b([^>]*)>[\s\S]*?<\/script>/gi, (_, attributes) =>
      /\bsrc=/.test(attributes) ? `<script${attributes}></script>` : ''
    );
    const relative = path.relative(root, file);
    const cssCount = (documentMarkup.match(/language\.css/g) || []).length;
    const jsCount = (documentMarkup.match(/language\.js/g) || []).length;
    if (cssCount !== 1) failures.push(`${relative}: language.css=${cssCount}`);
    if (jsCount !== 1) failures.push(`${relative}: language.js=${jsCount}`);
    if (/id=["']langBtn["']/.test(html)) failures.push(`${relative}: legacy langBtn`);
  }
  assert.deepEqual(failures, []);
});

test('all public pages declare bilingual titles and content', () => {
  const failures = [];
  for (const file of publicHtmlFiles()) {
    const html = fs.readFileSync(file, 'utf8');
    const relative = path.relative(root, file);
    if (!/data-title-zh=["'][^"']+["']/.test(html)) failures.push(`${relative}: missing Chinese title`);
    if (!/data-title-en=["'][^"']+["']/.test(html)) failures.push(`${relative}: missing English title`);
    const pairedNodes = /data-lang=["']zh["'][\s\S]*data-lang=["']en["']/.test(html);
    const pairedAttributes = /data-lang-zh=["'][^"']+["'][\s\S]*data-lang-en=["'][^"']+["']/.test(html);
    if (!pairedNodes && !pairedAttributes) failures.push(`${relative}: missing bilingual content`);
  }
  assert.deepEqual(failures, []);
});

test('all public pages retain a complete HTML document structure', () => {
  const failures = [];
  for (const file of publicHtmlFiles()) {
    const html = fs.readFileSync(file, 'utf8');
    const documentMarkup = html.replace(/<script\b[\s\S]*?<\/script>/gi, '');
    const relative = path.relative(root, file);
    for (const tag of ['html', 'head', 'body']) {
      if ((documentMarkup.match(new RegExp(`<${tag}\\b`, 'gi')) || []).length < 1) failures.push(`${relative}: missing <${tag}>`);
      if ((documentMarkup.match(new RegExp(`</${tag}>`, 'gi')) || []).length < 1) failures.push(`${relative}: missing </${tag}>`);
    }
    const cssPath = file.includes(`${path.sep}pages${path.sep}`) ? '../assets/css/language.css' : 'assets/css/language.css';
    const jsPath = file.includes(`${path.sep}pages${path.sep}`) ? '../assets/js/language.js' : 'assets/js/language.js';
    if (!html.includes(`href="${cssPath}"`)) failures.push(`${relative}: wrong CSS path`);
    if (!html.includes(`src="${jsPath}"`)) failures.push(`${relative}: wrong JS path`);
  }
  assert.deepEqual(failures, []);
});
