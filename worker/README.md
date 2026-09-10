# 作品后台安全发布

这个 Worker 负责两件事：只允许 GitHub 用户 `Icheerlam` 登录后台，并将后台操作提交回 `Icheerlam/Icheerlam.github.io`。

## 首次配置

1. 在 Cloudflare 创建 Worker，部署此目录。
2. 在 GitHub 的 Developer settings 创建 OAuth App；回调地址填写 `https://你的-worker.workers.dev/auth/callback`。
3. 在 Worker 的 Secrets 中设置：
   - `GITHUB_CLIENT_ID`
   - `GITHUB_CLIENT_SECRET`
   - `GITHUB_WRITE_TOKEN`：仅限本仓库、仅 `Contents: Read and write` 的 fine-grained token。
   - `SESSION_SECRET`：一段随机长字符串。
4. 将 `wrangler.toml` 的 `SITE_ORIGIN` 改为 GitHub Pages 正式地址后重新部署。
5. 将 `assets/js/portfolio-admin-config.js` 中的 `apiOrigin` 改为 Worker 正式地址。

不要把任何 Token、Client Secret 或 `SESSION_SECRET` 写进网站文件；这些只能保留在 Cloudflare Secrets。
