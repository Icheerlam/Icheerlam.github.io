const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'pages/video.html'), 'utf8');

test('YouTube embeds provide the client identity required by mobile players', () => {
  const iframeTags = html.match(/<iframe\b[^>]*>/gi) || [];
  const youtubeFrames = iframeTags.filter((tag) => /youtube|data-youtube-id/i.test(tag));

  assert.ok(youtubeFrames.length >= 4, 'expected every YouTube player iframe to be discoverable');
  for (const tag of youtubeFrames) {
    assert.match(tag, /\breferrerpolicy=["']strict-origin-when-cross-origin["']/i);
    assert.match(tag, /\bloading=["']lazy["']/i);
    assert.match(tag, /\btitle=["'][^"']+["']/i);
  }

  assert.match(html, /function\s+buildYouTubeEmbedUrl\s*\(/);
  assert.match(html, /params\.set\(['"]origin['"],\s*window\.location\.origin\)/);
});

test('narrow mobile screens retain YouTube minimum player height', () => {
  const mobileCss = html.match(/@media\s*\(max-width\s*:\s*768px\)[\s\S]*?<\/style>/i)?.[0] || '';
  assert.match(mobileCss, /\.rw-video\s*\{[^}]*min-height\s*:\s*200px/i);
});

test('mobile users can open every YouTube video outside the iframe', () => {
  assert.match(html, /class=["'][^"']*youtube-mobile-link[^"']*["']/i);
  assert.match(html, /@media\s*\(max-width\s*:\s*768px\)[\s\S]*?\.youtube-mobile-link\s*\{[^}]*display\s*:\s*inline-flex/i);
  assert.match(html, /function\s+setYouTubePlayer\s*\(/);
  assert.match(html, /https:\/\/www\.youtube\.com\/watch\?v=/);
});
