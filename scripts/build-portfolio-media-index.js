const fs = require('node:fs');
const path = require('node:path');

const MANAGED_DIRECTORIES = [
  'works/graphic',
  'works/3d',
  'assets/portfolio-uploads',
];

const IMAGE_EXTENSIONS = new Set(['.avif', '.gif', '.jpeg', '.jpg', '.png', '.webp']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.webm']);

function mediaTypeFor(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (IMAGE_EXTENSIONS.has(extension)) return 'image';
  if (VIDEO_EXTENSIONS.has(extension)) return 'video';
  return null;
}

function listMediaFiles(root, relativeDirectory) {
  const directory = path.join(root, relativeDirectory);
  if (!fs.existsSync(directory)) return [];

  return fs.readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name))
    .filter((filePath) => mediaTypeFor(filePath))
    .map((filePath) => {
      const relativePath = path.relative(root, filePath).split(path.sep).join('/');
      return {
        path: relativePath,
        name: path.basename(filePath),
        mediaType: mediaTypeFor(filePath),
      };
    });
}

function buildMediaIndex(root) {
  return MANAGED_DIRECTORIES
    .flatMap((directory) => listMediaFiles(root, directory))
    .sort((left, right) => left.path.localeCompare(right.path, 'en'));
}

function writeMediaIndex(root) {
  const outputPath = path.join(root, 'data', 'portfolio-media-index.json');
  const contents = {
    version: 1,
    items: buildMediaIndex(root),
  };
  fs.writeFileSync(outputPath, `${JSON.stringify(contents, null, 2)}\n`, 'utf8');
  return contents;
}

if (require.main === module) {
  const root = path.resolve(__dirname, '..');
  const { items } = writeMediaIndex(root);
  console.log(`已生成 ${items.length} 个作品媒体索引：data/portfolio-media-index.json`);
}

module.exports = { buildMediaIndex, writeMediaIndex };
