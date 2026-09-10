// 发布时填入 Cloudflare Worker 地址，例如 https://portfolio-admin.example.workers.dev
// 此文件只放公开地址，绝不能放 GitHub Token、Client Secret 或密码。
(function (window) {
  'use strict';
  const apiOrigin = 'https://dark-glitter-3f8b.clrenceye1.workers.dev';
  const sessionKey = 'icheerlam-portfolio-admin-session';
  const match = String(window.location.hash || '').match(/(?:^#|&)portfolio_session=([^&]+)/);
  if (match) {
    try { window.sessionStorage.setItem(sessionKey, decodeURIComponent(match[1])); } catch (_) {}
    if (window.history && window.history.replaceState) window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }
  window.PORTFOLIO_ADMIN_CONFIG = window.PORTFOLIO_ADMIN_CONFIG || { apiOrigin: apiOrigin };
  window.PortfolioAdminAuth = {
    headers: function () {
      try {
        const session = window.sessionStorage.getItem(sessionKey);
        return session ? { Authorization: 'Bearer ' + session } : {};
      } catch (_) { return {}; }
    },
  };
}(window));
