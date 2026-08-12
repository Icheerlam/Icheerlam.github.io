# Performance Creative 网站增量优化设计说明

## 目标

根据《叶承霖 Performance Creative 中英文简历》，将现有个人网站优化为面向海外及远程团队招聘者的 Performance Creative Designer 作品集。招聘者应能在进入首页后快速理解职业定位、核心商业结果、代表案例与工作方法。

本次只做增量优化：保留现有终端视觉、Bento 框架、背景、动画、音频、双语系统、旧页面、旧链接及全部作品资源。不会建立替代原站的新版本，也不会删除或隐藏原有作品；只调整首页信息层级、文案、案例入口和简历内容。

## 已确认方向

- 目标读者：海外及远程团队招聘者
- 目标岗位：Performance Creative Designer
- 首页方案：A1 Editorial Case Grid
- 内容策略：从“工具分类优先”调整为“业务案例优先”
- 原框架处理：全部保留，工具型页面归入首页的 Lab / Archive 层级
- 默认语言：英文，保留完整中文切换
- 音频：主页默认处于开启状态；若浏览器阻止有声自动播放，则在首次用户交互后播放

## 职业定位与首页首屏

首页主身份统一为：

- `Performance Creative Designer`
- `Paid Social / Growth Video / AI-assisted Production`

价值主张强调将创意制作与投放反馈连接起来：根据停留、点击、转化和素材生命周期信号，持续优化 Hook、BGM、CTA、节奏和版本结构。

英文文案应简洁、自然，并避免把团队或 campaign 的全部结果错误归因给个人。核心指标使用以下口径：

- `RMB 1.53M media spend supported by lead creatives`
- `US$245K+ associated overseas campaign spend across 7 accounts`
- `167K+ app installs and 5,700+ paid conversions`
- `20% annual media-efficiency improvement`

中文采用对应的审慎表述，例如“主导素材支持年度 153 万元投放消耗”，不写成“个人管理 153 万元预算”。

## 首页信息结构

保留现有首页 DOM 框架和主要模块，通过重排和增量补充形成以下阅读顺序：

1. Hero：职业身份、价值主张、Remote / Greater Bay Area 信息、查看案例与简历入口
2. Impact Snapshot：四项经统一的数据结果
3. Featured Cases：A1 Editorial Case Grid，首个案例具有更大视觉权重
4. Process：Research → Hypothesis → Variations → Testing → Learning
5. About / Experience：两年全职经验、游戏 UA 与品牌设计背景摘要
6. Lab / Archive：保留原有 Video、Data、Graphic / 3D、Vibecoding 等入口
7. Resume / Contact CTA

首页现有 Data、Graphic / 3D、Video、Vibecoding 等入口不删除；改为 Lab / Archive 的次级内容层。原 URL 保持不变。

## Featured Cases

首页优先展示四个招聘向案例：

### 1. Domestic Performance Creative

- Context：消费类 App 国内效果广告
- Role：视频创意制作、版本迭代与数据复盘
- Evidence：Top1 素材支持 22 万元以上消耗，付费贡献占比 26.9%
- Variations：Hook、BGM、画面骨架、结尾 CTA、抽帧去重
- Results：后续变体支持 9.5 万元与 8.5 万元消耗；CTA 优化带来单点 ROI +15%；年度效率 +20%

### 2. Frameit Overseas Growth

- Context：Frameit 海外 App 付费社交广告与内容增长
- Role：素材制作、复盘、迭代及跨账户素材评估支持
- Scope：7 个广告账户
- Results：相关 campaign 记录 US$245K+ 消耗、167K+ 装机、5,700+ 付费转化
- Social proof：Instagram 由 32K 增长至 51K 粉丝

### 3. Game UA & Localization

- Context：《率土之滨》《射雕》等国内与海外游戏 UA
- Role：录制、剪辑、结构调整和本地化素材制作
- Audience：韩国与东南亚市场用户
- Results：部分素材转化率达到 1.8%，核心素材投放生命周期较项目均值延长 20%

### 4. AI Creative Workflow

- Problem：创意版本比较依赖主观判断，复盘信息分散
- Framework：首帧吸引力、信息密度、场景 / 风格、互动信号、平台适配等加权维度
- Tools：LibTV、可灵、即梦、Claude、Codex 与 vibe coding
- Output：AI 辅助创意比较工具和多步骤生产工作流
- Boundary：定位为辅助分析与生产提效工具，不描述为经过验证的 CTR 预测模型

## 案例叙事模板

核心案例统一使用以下结构，现有页面内容不足的部分只使用可证明的信息，不虚构测试过程：

1. Context
2. Role
3. Audience
4. Hypothesis
5. Variations
6. Test / Iteration
7. Results
8. Learnings

本次优先复用 `pages/data.html`、`pages/video.html` 与 `pages/vibecoding.html` 的现有内容和媒体，通过更明确的首页文案与锚点承接案例。不会为了统一结构而大规模拆除旧页面。

## Resume 页面

`pages/resume.html` 保留现有可编辑简历框架、样式与交互，只替换和补全中英文内容：

- 职业标题统一为 Performance Creative Designer
- 英文默认显示
- Professional Summary / 个人简介使用新简历表述
- Selected Impact / 关键成果统一数据口径
- 工作经历按业务目标、创意动作、迭代方法与结果组织
- 增加 AI Creative Workflow 项目表述
- 技能、教育和语言信息与 Word 简历一致
- 不把 Cover Letter 塞入简历主体页面

## 导航与旧框架兼容

首页主导航语义调整为：

- WORK
- PROCESS
- ABOUT
- RESUME
- LAB

如果现有导航节点不适合直接重命名，则保留原节点并补充对应锚点。所有旧页面和本地链接必须继续可访问。Private Section、计算器、音频混音、主题切换、动画、语言切换和其他现有交互均不在删除范围内。

## 数据口径

全站统一采用：

- 年度国内素材支持消耗：RMB 1.53M / 153 万元
- 海外相关 campaign 消耗：US$245K+ / 24.5 万美元+
- 新增装机：167K+ / 16.7 万+
- 付费转化：首页及简历用 5,700+；data 详情可保留精确值 5,756
- Instagram：32K → 51K / 3.2 万 → 5.1 万
- Top1：RMB 220K+，对应 campaign set 付费贡献占比 26.9%
- 后续变体：RMB 95K、RMB 85K
- CTA 优化：单点 ROI +15%
- 年度投放效率：+20%

英文优先使用 `supported`、`associated campaign results` 等措辞表达贡献边界。

## 双语、响应式与可访问性

- 所有新增可见内容必须同时提供中英文
- 默认英文，语言选择继续使用现有本地存储机制
- 中英文切换后不出现残留另一语言的正文
- A1 案例网格在移动端改为单列，阅读顺序保持 1 → 4
- 长英文 KPI 使用独立响应式字号，避免溢出或过度换行
- 视频保持用户控制播放；背景音乐遵循浏览器自动播放限制并提供首次交互重试
- 保持键盘可访问的按钮、链接和可理解的替代文字
- 尊重现有 `prefers-reduced-motion` 处理

## 验证标准

- 首页默认显示英文和 Performance Creative Designer 定位
- 首页可见四个 Featured Cases，首个案例视觉权重最高
- 首页仍可访问全部原工具型页面和旧作品
- Resume 中英文内容与 Word 简历一致且完整可见
- 1.53M、245K+、167K+、5,700+、32K → 51K 等口径全站一致
- 英文模式没有残留中文正文
- 所有现有自动化测试通过，并增加职业定位、案例入口、数据口径和音频默认状态回归检查
- 桌面端和移动端无明显横向溢出、遮挡或不可读文字
- 不删除现有框架、页面、功能、媒体和公开链接

## 范围外

- 新剪辑 showreel
- 新增未经确认的商业数据或远程协作经历
- 创建新的简历 PDF / DOCX
- 删除、迁移或改名现有页面与媒体文件
- 部署或推送，除非用户明确要求
