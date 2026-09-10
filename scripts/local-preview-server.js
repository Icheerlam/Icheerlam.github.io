const fsp = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { buildMediaIndex } = require('./build-portfolio-media-index.js');

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp4': 'video/mp4',
  '.png': 'image/png',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
};

function safeFileName(value) {
  return String(value || 'upload').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'upload';
}

function normalizeMediaPath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\.\//, '');
}

function isManagedMediaPath(mediaPath) {
  return ['works/graphic/', 'works/3d/', 'assets/portfolio-uploads/'].some((prefix) => mediaPath.startsWith(prefix));
}

function moveToRecycleBin(filePath) {
  return new Promise((resolve, reject) => {
    const escapedPath = String(filePath).replace(/'/g, "''");
    const command = "Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile('" + escapedPath + "', [Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs, [Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin)";
    const process = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true });
    process.on('error', reject);
    process.on('close', (code) => code === 0 ? resolve() : reject(new Error('无法移入回收站')));
  });
}

async function writeMediaIndex(root) {
  await fsp.writeFile(
    path.join(root, 'data', 'portfolio-media-index.json'),
    JSON.stringify({ version: 1, items: buildMediaIndex(root) }, null, 2) + '\n',
    'utf8',
  );
}

async function savePortfolio(root, payload) {
  const inputItems = Array.isArray(payload && payload.items) ? payload.items : [];
  const files = new Map((Array.isArray(payload && payload.files) ? payload.files : [])
    .filter((file) => file && typeof file.id === 'string')
    .map((file) => [file.id, file]));
  const items = inputItems.map((item) => ({
    ...item,
    title: { ...(item && item.title) },
  }));
  const uploadDirectory = path.join(root, 'assets', 'portfolio-uploads');
  await fsp.mkdir(uploadDirectory, { recursive: true });

  for (const item of items) {
    const file = files.get(item.id);
    if (!file) continue;
    const fileName = safeFileName(item.id + '-' + file.name);
    await fsp.writeFile(path.join(uploadDirectory, fileName), Buffer.from(String(file.base64 || ''), 'base64'));
    item.src = '../assets/portfolio-uploads/' + fileName;
  }

  const dataDirectory = path.join(root, 'data');
  await fsp.mkdir(dataDirectory, { recursive: true });
  await fsp.writeFile(
    path.join(dataDirectory, 'graphic-works.json'),
    JSON.stringify({ version: 1, items }, null, 2) + '\n',
    'utf8',
  );
  await writeMediaIndex(root);
  return { items };
}

async function deletePortfolioMedia(root, requestedPath, recycle = moveToRecycleBin) {
  const mediaPath = normalizeMediaPath(requestedPath);
  if (!isManagedMediaPath(mediaPath)) throw new Error('只能删除受管媒体路径');
  const filePath = path.resolve(root, mediaPath);
  const relative = path.relative(root, filePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('媒体路径无效');
  await fsp.access(filePath);
  await recycle(filePath);

  const manifestPath = path.join(root, 'data', 'graphic-works.json');
  const manifest = JSON.parse(await fsp.readFile(manifestPath, 'utf8'));
  const items = (manifest.items || []).filter((item) => {
    if (item.mediaType === 'video-group') {
      return !(item.sources || []).some((source) => normalizeMediaPath(source) === mediaPath);
    }
    return normalizeMediaPath(item.src) !== mediaPath;
  });
  ['graphic', 'ai-store', '3d'].forEach((section) => {
    items.filter((item) => item.section === section)
      .sort((left, right) => left.order - right.order)
      .forEach((item, index) => { item.order = index; });
  });
  await fsp.writeFile(manifestPath, JSON.stringify({ version: 1, items }, null, 2) + '\n', 'utf8');
  await writeMediaIndex(root);
  return { items };
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > 80 * 1024 * 1024) {
        reject(new Error('上传内容超过 80 MiB'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function createPreviewServer(root) {
  return http.createServer(async (request, response) => {
    let apiRequest = false;
    try {
      const url = new URL(request.url || '/', 'http://127.0.0.1');
      apiRequest = url.pathname.startsWith('/api/');
      if (request.method === 'POST' && url.pathname === '/api/portfolio/save') {
        const payload = JSON.parse(await readRequestBody(request));
        const result = await savePortfolio(root, payload);
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify(result));
        return;
      }
      if (request.method === 'POST' && url.pathname === '/api/portfolio/delete') {
        const payload = JSON.parse(await readRequestBody(request));
        const result = await deletePortfolioMedia(root, payload.path);
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify(result));
        return;
      }

      const relativePath = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
      const filePath = path.resolve(root, '.' + relativePath);
      if (!filePath.startsWith(root)) {
        response.writeHead(403);
        response.end();
        return;
      }
      const contents = await fsp.readFile(filePath);
      response.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
      response.end(contents);
    } catch (error) {
      if (apiRequest) {
        response.writeHead(error instanceof SyntaxError ? 400 : 500, { 'Content-Type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ error: error.message || '本地操作失败' }));
        return;
      }
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
    }
  });
}

if (require.main === module) {
  const root = path.resolve(__dirname, '..');
  const port = Number(process.env.PORT || 8080);
  createPreviewServer(root).listen(port, '127.0.0.1', () => {
    console.log('本地预览已启动：http://127.0.0.1:' + port);
  });
}

module.exports = { createPreviewServer, deletePortfolioMedia, savePortfolio };
