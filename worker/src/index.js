const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
});

const GITHUB_API = 'https://api.github.com';
const GITHUB_ACCEPT = 'application/vnd.github+json';
const USER_AGENT = 'Icheerlam-Portfolio-Admin';
const MANAGED_PREFIXES = Object.freeze(['works/graphic/', 'works/3d/', 'assets/portfolio-uploads/']);
const MEDIA_PATTERN = /\.(jpg|jpeg|png|webp|gif|mp4|webm)$/i;

const base64urlUtf8 = (value) => btoa(unescape(encodeURIComponent(value))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
const githubBase64 = (value) => btoa(unescape(encodeURIComponent(value)));
const decodeBase64urlUtf8 = (value) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  return decodeURIComponent(escape(atob(normalized + '='.repeat((4 - normalized.length % 4) % 4))));
};
const bytes = (value) => new TextEncoder().encode(value);
const base64urlBytes = (value) => btoa(String.fromCharCode(...value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

async function sign(value, secret) {
  const key = await crypto.subtle.importKey('raw', bytes(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, bytes(value));
  return base64urlBytes(new Uint8Array(signature));
}

async function signed(value, secret) { return value + '.' + await sign(value, secret); }

async function verify(value, secret) {
  const dot = String(value || '').lastIndexOf('.');
  if (dot < 1) return null;
  const body = value.slice(0, dot);
  const expected = await sign(body, secret);
  if (expected !== value.slice(dot + 1)) return null;
  try { return JSON.parse(decodeBase64urlUtf8(body)); } catch (_) { return null; }
}

function cookie(request, name) {
  const match = (request.headers.get('Cookie') || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return match && decodeURIComponent(match[1]);
}

function cors(request, env) {
  const origin = request.headers.get('Origin');
  return origin === env.SITE_ORIGIN ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Access-Control-Allow-Credentials': 'true' } : {};
}

function sessionValue(request) {
  const bearer = (request.headers.get('Authorization') || '').match(/^Bearer\s+(.+)$/i);
  return bearer ? bearer[1] : cookie(request, 'portfolio_admin');
}

async function requireAdmin(request, env) {
  const session = await verify(sessionValue(request), env.SESSION_SECRET);
  if (!session || session.exp < Date.now() || session.login.toLowerCase() !== env.ADMIN_GITHUB_LOGIN.toLowerCase()) throw new Error('未授权');
  return session;
}

function workerUrl(request, path) { return new URL(path, request.url).toString(); }

async function github(request, env, path, options = {}) {
  const response = await fetch(GITHUB_API + path, {
    ...options,
    headers: {
      Accept: GITHUB_ACCEPT,
      Authorization: 'Bearer ' + env.GITHUB_WRITE_TOKEN,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': USER_AGENT,
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || 'GitHub 写入失败');
  return body;
}

const repoPath = (env, file) => '/repos/' + env.GITHUB_REPO + '/contents/' + file.split('/').map(encodeURIComponent).join('/');
const fileContent = async (request, env, file) => github(request, env, repoPath(env, file) + '?ref=' + encodeURIComponent(env.GITHUB_BRANCH));

async function putFile(request, env, file, content, message, contentIsBase64 = false) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let sha;
    try { sha = (await fileContent(request, env, file)).sha; } catch (_) {}
    try {
      return await github(request, env, repoPath(env, file), {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, content: contentIsBase64 ? content : githubBase64(content), branch: env.GITHUB_BRANCH, ...(sha ? { sha } : {}) }),
      });
    } catch (error) {
      if (attempt === 2 || !/does not match/i.test(String(error && error.message))) throw error;
    }
  }
}

function mediaType(file) {
  const suffix = file.toLowerCase().split('.').pop();
  return ['mp4', 'webm'].includes(suffix) ? 'video' : 'image';
}

async function rebuildIndex(request, env) {
  const tree = await github(request, env, '/repos/' + env.GITHUB_REPO + '/git/trees/' + encodeURIComponent(env.GITHUB_BRANCH) + '?recursive=1');
  const items = tree.tree.filter((entry) => entry.type === 'blob' && MANAGED_PREFIXES.some((prefix) => entry.path.startsWith(prefix)))
    .filter((entry) => MEDIA_PATTERN.test(entry.path))
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
    await putFile(request, env, target, file.base64, 'feat: upload portfolio media', true);
    item.src = '../' + target;
  }
  await putFile(request, env, 'data/graphic-works.json', JSON.stringify({ version: 1, items }, null, 2) + '\n', 'feat: update portfolio display');
  await rebuildIndex(request, env);
  return { items };
}

async function deletePortfolio(request, env, mediaPath) {
  if (!MANAGED_PREFIXES.some((prefix) => String(mediaPath || '').startsWith(prefix))) throw new Error('媒体路径无效');
  const file = await fileContent(request, env, mediaPath);
  await github(request, env, repoPath(env, mediaPath), { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'chore: remove portfolio media', sha: file.sha, branch: env.GITHUB_BRANCH }) });
  const manifestFile = await fileContent(request, env, 'data/graphic-works.json');
  const manifest = JSON.parse(decodeBase64urlUtf8(manifestFile.content.replace(/\n/g, '')));
  const items = (manifest.items || []).filter((item) => item.src !== '../' + mediaPath && !(item.sources || []).some((source) => source.replace(/^\.\.\//, '') === mediaPath));
  await putFile(request, env, 'data/graphic-works.json', JSON.stringify({ version: 1, items }, null, 2) + '\n', 'chore: remove portfolio media');
  await rebuildIndex(request, env);
  return { items };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const headers = cors(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { headers: { ...headers, 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } });
    if (url.pathname === '/auth/login') {
      const state = await signed(base64urlUtf8(JSON.stringify({ exp: Date.now() + 10 * 60 * 1000 })), env.SESSION_SECRET);
      const authorize = new URL('https://github.com/login/oauth/authorize');
      authorize.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
      authorize.searchParams.set('redirect_uri', workerUrl(request, '/auth/callback'));
      authorize.searchParams.set('scope', 'read:user');
      authorize.searchParams.set('state', state);
      return Response.redirect(authorize.toString(), 302);
    }
    if (url.pathname === '/auth/callback') {
      try {
        const state = await verify(url.searchParams.get('state'), env.SESSION_SECRET);
        if (!state || state.exp < Date.now()) return new Response('登录已过期，请重试。', { status: 400 });
        const tokenBody = new URLSearchParams({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code: url.searchParams.get('code') || '' });
        const tokenResponse = await fetch('https://github.com/login/oauth/access_token', { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: tokenBody.toString() });
        const tokenText = await tokenResponse.text();
        let token;
        try { token = JSON.parse(tokenText); } catch (_) { return new Response('GitHub 授权服务返回异常（HTTP ' + tokenResponse.status + '）：' + tokenText.slice(0, 120), { status: 502 }); }
        if (!token.access_token) return new Response('GitHub 授权失败：' + (token.error_description || token.error || '未返回访问凭据'), { status: 400 });
        const userResponse = await fetch(GITHUB_API + '/user', { headers: { Authorization: 'Bearer ' + token.access_token, Accept: GITHUB_ACCEPT, 'User-Agent': USER_AGENT } });
        const userText = await userResponse.text();
        let user;
        try { user = JSON.parse(userText); } catch (_) { return new Response('无法读取 GitHub 账号（HTTP ' + userResponse.status + '）：' + userText.slice(0, 120), { status: 502 }); }
        if (!userResponse.ok) return new Response('无法读取 GitHub 账号：' + (user.message || userResponse.status), { status: 502 });
        if (!user.login || user.login.toLowerCase() !== env.ADMIN_GITHUB_LOGIN.toLowerCase()) return new Response('此 GitHub 账号没有后台权限。', { status: 403 });
        const session = await signed(base64urlUtf8(JSON.stringify({ login: user.login, exp: Date.now() + 8 * 60 * 60 * 1000 })), env.SESSION_SECRET);
        return new Response(null, { status: 302, headers: { Location: env.SITE_ORIGIN + '/pages/portfolio-admin.html#portfolio_session=' + encodeURIComponent(session), 'Set-Cookie': 'portfolio_admin=' + encodeURIComponent(session) + '; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=28800' } });
      } catch (error) {
        return new Response('登录服务错误：' + (error && error.message ? error.message : '未知错误'), { status: 500 });
      }
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
