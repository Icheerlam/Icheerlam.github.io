# Adobe Stock 图库识别工具集

围绕 **Adobe Stock 供稿**的全流程工具集：从「看到一张图」到「安全上架一批不重复的图」全链路自动化。

由两大模块组成：

- **模块 A · 图片识别引擎**：本地图片 → Adobe Stock 标准元数据（标题/关键词/分类）CSV
- **模块 B · 图库避重优化器**：抓取已上图库 → 生成不撞车的创作方向 → 审计去重

```
模块B 生成「不重复」的创作方向(提示词/关键词)
   ↓  据此出图/挑图
模块A 识别新图 → 生成 Title/Keywords/Category → 上传 Adobe Stock
   ↓  上架后
模块B 重新抓取图库 → 更新避重库 → 下一轮继续避重
```

---

## 模块 A · 图片识别引擎

把本地图片批量转成符合 Adobe Stock 上传标准的元数据。

### 快速开始

1. 配置 API 密钥（编辑 `config.json`，填 `alibaba_api_key`）
2. 双击 `运行.bat`，或命令行：
   - 图片识别：`py alibaba_image_recognizer.py -w 5`（`-w` 并发线程数）
   - 生成趋势提示词：`py alibaba_image_recognizer.py -g 20`
3. 识别结果保存在 `识别结果` 文件夹，CSV 可用 Excel 打开

### Web 界面

`py web_ui.py` → 浏览器打开 `http://localhost:5000`，两个 Tab：
- **提示词生成**：基于 Adobe Stock 趋势生成可销售的 AI 作图提示词
- **图片识别**：上传文件夹，实时进度 + 日志 + 结果表格，一键下载 CSV

### 文件说明

| 文件 | 作用 |
|------|------|
| `alibaba_image_recognizer.py` | 核心引擎（`AlibabaImageRecognizer` 识别 + `TrendAnalyzer` 趋势） |
| `web_ui.py` | Flask Web 界面（Tailwind + Font Awesome） |
| `config.json` | API 密钥 / 输入输出目录 / 并发数 / 21 类分类映射 |
| `运行.bat` | 一键启动 Web 界面 |
| `example.csv` | 输出格式示例 |
| `阿里云使用指南.md` | API 密钥获取详细步骤 |

### 核心能力

- **图片识别**：调阿里云 **qwen-vl-max** 视觉模型，自动压缩图片（≤800px / JPEG q75）→ 输出 `Title / Keywords(≤49个) / Category(1-21)`
- **并发**：`ThreadPoolExecutor` 多线程，默认 5
- **趋势提示词**：三层降级抓 Adobe Stock 趋势（趋势页 → 热门页 → 内置数据），再用 **qwen-max** 生成提示词
- **输出格式**：`Filename, Title, Keywords, Category, Publish`

---

## 模块 B · 图库避重优化器（adobe-stock-portfolio-optimizer）

一个 AI Agent Skill，解决「新图与已上图重复」的痛点。Adobe Contributor 没有导出按钮，所以这套工具自己抓取并建本地避重库。

### 核心铁律

先建图库数据库 → 验证 → 对照数据库生成候选 → 审计去重 → 修订高风险行 → 直到零风险 → 复制到剪贴板。

### 脚本

| 脚本 | 作用 |
|------|------|
| `scripts/portfolio-cdp-scraper.js` | 用 Chrome 远程调试（CDP 端口 9222）抓取 Contributor 已上传图库，提取 ID/尺寸/标题/分类/关键词/下载量等，存为 `portfolio-latest.csv/json`。**不碰账号密码**（用户手动登录） |
| `scripts/check-keyword-overlap.js` | 全量关键词重叠检测（含候选评分核心 `scoreCandidate`） |
| `scripts/audit-keyword-batch.js` | 批量审计：缺约束词 / 图库高-中风险 / 与历史候选相似 / 批内自相似，自动忽略 `no people/no text` 等合规词 |
| `SKILL.md` | 完整工作流手册：风险等级规则、Obsidian 同步、修订循环、剪贴板校验 |

### 风险判定规则

- **高风险**：前 10 关键词重叠 ≥5，或总重叠 ≥50%，或仅是颜色/裁剪/角度/季节变体
- **中风险**：前 10 重叠 3-4，或落在拥挤主题
- **达标线**：缺词=0、高风险=0、中风险=0、历史相似=0、批内相似=0

### 工作流

1. 定位 `portfolio-latest.csv` 并校验行数
2. 若缺失/过期，用 CDP 抓取器刷新（用户手动登录，不自动凭据）
3. 扫描高频分类/关键词（视为拥挤区）
4. 生成编号候选行
5. 审计该批次（对照图库 / 历史候选 / 批内 / 约束如 `no people`/`no text`）
6. 修订所有高风险行，重跑审计直到达标
7. 复制最终批次到剪贴板（读回校验行数）

---

## 技术栈

- **AI**：阿里云通义千问 qwen-vl-max（视觉）+ qwen-max（文本）
- **后端**：Python（Flask + requests + Pillow + 线程池）
- **前端**：Tailwind CDN + Font Awesome
- **避重工具**：Node.js + Chrome CDP（无凭据抓取）+ PowerShell 审计
- **知识库**：与 Obsidian vault 同步（`避重图库数据库.md` / `60组避重关键词.md`）

## 获取阿里云 API 密钥

1. 访问 https://dashscope.aliyuncs.com/
2. 注册/登录（需实名认证）
3. 开通「通义千问VL」服务
4. 创建 API 密钥（格式 `sk-xxxxxxxxxxxxx`）

详细步骤见 [阿里云使用指南.md](阿里云使用指南.md)。新用户有免费额度。

## 注意事项

- 图片过大会自动压缩
- 建议先用少量图片测试
- 抓取器必须用 `--remote-debugging-port=9222` 启动专用 Chrome，不可抓取凭据/Cookie/登录字段
