const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
});

const encode = (value) => btoa(unescape(encodeURIComponent(value))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
const decode = (value) => decodeURIComponent(escape(atob(value.replace(/-/g, '+').replace(/_/g, '/'))));
const bytes = (value) => new TextEncoder().encode(value);

async function sign(value, secret) {
  const key = await crypto.subtle.importKey('raw', bytes(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, bytes(value));
  return encode(String.fromCharCode(...new Uint8Array(signature)));
}

async function signed(value, secret) { return value + '.' + await sign(value, secret); }

async function verify(value, secret) {
  const dot = String(value || '').lastIndexOf('.');
  if (dot < 1) return null;
  const body = value.slice(0, dot);
  const expected = await sign(body, secret);
  if (expected !== value.slice(dot + 1)) return null;
  try { return JSON.parse(decode(body)); } catch (_) { return null; }
}

function cookie(request, name) {
  const match = (request.headers.get('Cookie') || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return match && decodeURIComponent(match[1]);
}

function cors(request, env) {
  const origin = request.headers.get('Origin');
  return origin === env.SITE_ORIGIN ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Access-Control-Allow-Credentials': 'true' } : {};
}

async function requireAdmin(request, env) {
  const signedSession = await verify(cookie(request, 'portfolio_admin'), env.SESSION_SECRET);
  let session;
  try { session = signedSession && JSON.parse(decode(signedSession)); } catch (_) { session = null; }
  if (!session || session.exp < Date.now() || session.login.toLowerCase() !== env.ADMIN_GITHUB_LOGIN.toLowerCase()) throw new Error('未授权');
  return session;
}

function workerUrl(request, path) { return new URL(path, request.url).toString(); }

async function github(request, env, path, options = {}) {
  const response = await fetch('https://api.github.com' + path, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer ' + env.GITHUB_WRITE_TOKEN,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || 'GitHub 写入失败');
  return body;
}

const repoPath = (env, file) => '/repos/' + env.GITHUB_REPO + '/contents/' + file.split('/').map(encodeURIComponent).join('/');
const fileContent = async (request, env, file) => github(request, env, repoPath(env, file) + '?ref=' + encodeURIComponent(env.GITHUB_BRANCH));

async function putFile(request, env, file, content, message) {
  let sha;
  try { sha = (await fileContent(request, env, file)).sha; } catch (_) {}
  return github(request, env, repoPath(env, file), {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, content: encode(content), branch: env.GITHUB_BRANCH, ...(sha ? { sha } : {}) }),
  });
}

function mediaType(file) {
  const suffix = file.toLowerCase().split('.').pop();
  return ['mp4', 'webm'].includes(suffix) ? 'video' : 'image';
}

async function rebuildIndex(request, env) {
  const tree = await github(request, env, '/repos/' + env.GITHUB_REPO + '/git/trees/' + encodeURIComponent(env.GITHUB_BRANCH) + '?recursive=1');
  const allowed = ['works/graphic/', 'works/3d/', 'assets/portfolio-uploads/'];
  const items = tree.tree.filter((entry) => entry.type === 'blob' && allowed.some((prefix) => entry.path.startsWith(prefix)))
    .filter((entry) => /\.(jpg|jpeg|png|webp|gif|mp4|webm)$/i.test(entry.path))
    .map((entry) => ({ path: entry.path, name: entry.path.split('/').pop(), mediaType: mediaType(entry.path) }));
  await putFile(request, env, 'data/portfolio-media-index.json', JSON.stringify({ version: 1, items }, null, 2) + '\n', 'chore: update portfolio media index');
  return items;
}

async function savePortfolio(request, env, payload) {
  const items = Array.isArray(payload.items) ? payload.items : [];
  const files = new Map((Array.isArray(payload.files) ? payload.files : []).map((file) => [file.id, file]));
  for (const item of items) {
    const file = files.get(item.id);
    if (!file) continue;
    const name = String(item.id + '-' + file.name).replace(/[^a-zA-Z0-9._-]+/g, '-');
    const target = 'assets/portfolio-uploads/' + name;
    await putFile(request, env, target, file.base64, 'feat: upload portfolio media');
    item.src = '../' + target;
  }
  await putFile(request, env, 'data/graphic-works.json', JSON.stringify({ version: 1, items }, null, 2) + '\n', 'feat: update portfolio display');
  await rebuildIndex(request, env);
  return { items };
}

async function deletePortfolio(request, env, mediaPath) {
  if (!/^(works\/graphic\/|works\/3d\/|assets\/portfolio-uploads\/)/.test(mediaPath || '')) throw new Error('媒体路径无效');
  const file = await fileContent(request, env, mediaPath);
  await github(request, env, repoPath(env, mediaPath), { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'chore: remove portfolio media', sha: file.sha, branch: env.GITHUB_BRANCH }) });
  const manifestFile = await fileContent(request, env, 'data/graphic-works.json');
  const manifest = JSON.parse(decode(manifestFile.content.replace(/\n/g, '')));
  const items = (manifest.items || []).filter((item) => item.src !== '../' + mediaPath && !(item.sources || []).some((source) => source.replace(/^\.\.\//, '') === mediaPath));
  await putFile(request, env, 'data/graphic-works.json', JSON.stringify({ version: 1, items }, null, 2) + '\n', 'chore: remove portfolio media');
  await rebuildIndex(request, env);
  return { items };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const headers = cors(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { headers: { ...headers, 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
    if (url.pathname === '/auth/login') {
      const state = await signed(encode(JSON.stringify({ exp: Date.now() + 10 * 60 * 1000 })), env.SESSION_SECRET);
      const authorize = new URL('https://github.com/login/oauth/authorize');
      authorize.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
      authorize.searchParams.set('redirect_uri', workerUrl(request, '/auth/callback'));
      authorize.searchParams.set('scope', 'read:user');
      authorize.searchParams.set('state', state);
      return Response.redirect(authorize.toString(), 302);
    }
    if (url.pathname === '/auth/callback') {
      const state = await verify(url.searchParams.get('state'), env.SESSION_SECRET);
      if (!state || JSON.parse(decode(state)).exp < Date.now()) return new Response('登录已过期，请重试。', { status: 400 });
      const tokenResponse = await fetch('https://github.com/login/oauth/access_token', { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code: url.searchParams.get('code') }) });
      const token = await tokenResponse.json();
      const user = await fetch('https://api.github.com/user', { headers: { Authorization: 'Bearer ' + token.access_token, Accept: 'application/vnd.github+json' } }).then((response) => response.json());
      if (!user.login || user.login.toLowerCase() !== env.ADMIN_GITHUB_LOGIN.toLowerCase()) return new Response('此 GitHub 账号没有后台权限。', { status: 403 });
      const session = await signed(encode(JSON.stringify({ login: user.login, exp: Date.now() + 8 * 60 * 60 * 1000 })), env.SESSION_SECRET);
      return new Response(null, { status: 302, headers: { Location: env.SITE_ORIGIN + '/pages/portfolio-admin.html', 'Set-Cookie': 'portfolio_admin=' + encodeURIComponent(session) + '; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=28800' } });
    }
    if (url.pathname === '/api/session') {
      try { const session = await requireAdmin(request, env); return json({ authorized: true, login: session.login }, 200, headers); } catch (_) { return json({ authorized: false }, 401, headers); }
    }
    if (url.pathname.startsWith('/api/')) {
      try {
        await requireAdmin(request, env);
        const payload = await request.json();
        const result = url.pathname === '/api/portfolio/save' ? await savePortfolio(request, env, payload)
          : url.pathname === '/api/portfolio/delete' ? await deletePortfolio(request, env, payload.path) : null;
        if (!result) return json({ error: '不存在的接口' }, 404, headers);
        return json(result, 200, headers);
      } catch (error) { return json({ error: error.message || '操作失败' }, error.message === '未授权' ? 401 : 400, headers); }
    }
    return new Response('Not found', { status: 404 });
  },
};
