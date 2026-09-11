const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('图库与视频分析入口使用 Qwen3 模型，不再调用已淘汰的旧模型', () => {
  const sources = [
    'Adobe_Stock_图片识别程序/alibaba_image_recognizer.py',
    'pages/adobe_stock.html',
    'pages/视频分析功能.html',
    'Adobe_Stock_图片识别程序/README.md'
  ];
  const legacyModels = /qwen-vl-max|qwen-max/;
  const missing = [];

  for (const relative of sources) {
    const content = fs.readFileSync(path.join(root, relative), 'utf8');
    if (legacyModels.test(content)) missing.push(`${relative} 仍包含旧模型`);
  }

  const recognizer = fs.readFileSync(
    path.join(root, 'Adobe_Stock_图片识别程序/alibaba_image_recognizer.py'),
    'utf8'
  );
  const adobePage = fs.readFileSync(path.join(root, 'pages/adobe_stock.html'), 'utf8');
  const videoPage = fs.readFileSync(path.join(root, 'pages/视频分析功能.html'), 'utf8');

  assert.match(recognizer, /qwen3-vl-flash/);
  assert.match(recognizer, /qwen-plus/);
  assert.match(adobePage, /qwen3-vl-flash/);
  assert.match(adobePage, /qwen-plus/);
  assert.match(videoPage, /qwen3-vl-flash/);
  assert.deepEqual(missing, []);
});
