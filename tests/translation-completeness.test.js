const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

const requiredTranslations = {
  'pages/adobe_stock.html': ['抓图库建避重库', '生成不撞车关键词', '待识别素材', '批量上架'],
  'pages/data.html': ['主导年度短视频剪辑', '关键数据与策略拆解', '内容运营与爆款打造'],
  'pages/resume.html': ['右侧简历文字可直接点击修改', '下次打开自动恢复'],
  'pages/video-art-demo.html': ['3 种艺术方向对比', '查看完整作品', '查看对比分析', '查看全部作品'],
  'pages/video-gallery-3d-wall-sample.html': ['作为正式页首屏或精选作品区', '正式版可以增加鼠标视差'],
  'pages/video-layout-demo.html': ['年会大屏投屏', '游戏买量素材包装对比', '学术品牌视频'],
  'pages/video.html': ['版本一', '版本二', '海外AI人卖画', '书法剧情']
};

function hasEnglishPair(html, phrase) {
  const index = html.indexOf(phrase);
  if (index < 0) return false;
  const context = html.slice(Math.max(0, index - 500), index + phrase.length + 500);
  return /data-lang-en=["'][^"']+["']/.test(context) || /data-lang=["']en["']/.test(context);
}

test('known visible Chinese content has a nearby English counterpart', () => {
  const failures = [];
  for (const [relative, phrases] of Object.entries(requiredTranslations)) {
    const html = fs.readFileSync(path.join(root, relative), 'utf8');
    for (const phrase of phrases) {
      if (!hasEnglishPair(html, phrase)) failures.push(`${relative}: ${phrase}`);
    }
  }
  assert.deepEqual(failures, []);
});

test('Chinese UI attributes provide static English values', () => {
  const checks = [
    ['index.html', 'aria-label="返回顶部"', 'data-aria-label-en="Back to top"'],
    ['pages/adobe_stock.html', 'placeholder="请输入 API Key（sk-...）"', 'data-lang-en="Enter API Key (sk-...)"'],
    ['pages/video-art-demo.html', 'data-desc="2024-2025 年度视频设计/剪辑合集', 'data-desc-en='],
    ['pages/data.html', 'title="点击放大查看原图"', 'data-title-en="View full-size image"']
  ];
  const failures = [];
  for (const [relative, source, expected] of checks) {
    const html = fs.readFileSync(path.join(root, relative), 'utf8');
    if (!html.includes(source) || !html.includes(expected)) failures.push(`${relative}: ${expected}`);
  }
  assert.deepEqual(failures, []);
});

test('resume content is not hidden as a Chinese-only page block', () => {
  const html = fs.readFileSync(path.join(root, 'pages/resume.html'), 'utf8');
  assert.doesNotMatch(html, /id=["']resume-canvas["'][^>]*data-lang=["']zh["']/);
});
