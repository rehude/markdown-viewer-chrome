# Markdown Viewer (Chrome 扩展)

一个自用的 Chrome 扩展：浏览器里打开 `.md` / `.markdown` 文件，自动渲染成富文本。
支持 GFM、代码高亮、Mermaid 图表、KaTeX 数学公式、自动目录、深色模式。

## 安装

1. 打开 Chrome，地址栏访问 `chrome://extensions/`
2. 右上角打开 **"开发者模式"**
3. 点击左上角 **"加载已解压的扩展程序"**，选择本项目根目录（`D:\Project\chromeetx`）
4. **关键一步**：在扩展列表里找到 "Markdown Viewer"，点 **"详情"**，把 **"允许访问文件网址"** 打开。
   否则本地 `file://xxx.md` 不会被渲染。

## 使用

- **本地文件**：直接把 `.md` 文件拖进 Chrome 窗口，或双击文件用 Chrome 打开
- **网上的 .md**：访问任意 `*.md` / `*.markdown` 链接（如 GitHub raw、Gitee raw）自动渲染
- 打开本目录下 `sample.md` 验证安装是否成功

## 快捷键

| 按键 | 功能 |
|------|------|
| `T` | 切换左侧目录 |
| `D` | 循环切换主题：默认浅色 → 默认深色 → Morandi Garden |
| `E` | 进入 / 退出编辑模式 |
| `R` | 查看原始 Markdown 文本 |
| `Ctrl+S` | 编辑模式下保存（弹出"另存为"对话框） |
| `Ctrl+P` | 打印 / 导出 PDF |

## 主题

工具栏右侧主题下拉框提供三套主题，所选状态会持久化：

- **默认浅色** / **默认深色**：基于 github-markdown-css，自带跟随系统深浅色。
- **Morandi Garden**：内置 Typora 莫兰迪花园主题，捎带阿里巴巴普惠体 + JetBrains Mono 字体（字体文件在 `themes/morandigarden/fonts/`）。Morandi 暂时只有单色版（明亮调），切换到它时深色按钮无效。

> 想加新主题？把 css 和字体放到 `themes/<新名字>/`，然后在 `content.js` 的 `PACKS` 常量和工具栏 `<select>` 选项里登记一下即可。如果新主题用 Typora 选择器（`#write` / `.md-fences` 等），现有兼容层会自动起作用。

## 编辑模式

- 按 `E` 或工具栏 **✎ 编辑** 进入。布局变为左侧 textarea，右侧实时预览（200ms 防抖）。
- 编辑器内 Tab 键插入两个空格，保留浏览器原生 Ctrl+Z 撤销栈。
- 实时预览中 **Mermaid 图表不会重新渲染**（避免频繁加载 ~3MB 的库带来的卡顿）。退出编辑模式后会自动重渲染。
- 编辑器内不响应字母快捷键（`T`/`D`/`E`/`R`），避免误触。

## 保存（Ctrl+S）

⚠️ **关于"覆盖原文件"**：Chrome 扩展受浏览器安全策略限制，**不能静默写入磁盘上的本地文件**。所以"保存"实际行为是：

1. `Ctrl+S` 或 **💾 保存** 触发"另存为"对话框，文件名已预填为打开时的原文件名（例如 `sample.md`）。
2. **首次保存**：用户需要手动导航到原文件所在目录 → 点保存 → Chrome 弹"文件已存在，是否替换" → 一次回车即覆盖。
3. **之后保存**：Chrome 自动记住上次目录，按 Ctrl+S → 弹框 → 替换确认（两次回车）。

这不是无感保存，是"半自动覆盖"。这是 `file://` 协议下扩展能做到的最接近的方案。
若打开的是远程 .md（如 GitHub raw），保存时会让你选择本地存放位置——它本身就没有"原始磁盘位置"概念。

## 功能清单

- [x] 自动渲染 `.md` / `.markdown`
- [x] CommonMark + GFM（表格、任务列表、删除线）
- [x] 代码高亮（highlight.js）
- [x] Mermaid 图表（流程图、时序图等）
- [x] KaTeX 数学公式（`$...$` / `$$...$$`）
- [x] 自动生成目录侧边栏
- [x] 三套主题切换（默认浅色 / 默认深色 / Morandi Garden）
- [x] 代码块一键复制
- [x] 图片点击放大
- [x] 打印 / 导出 PDF 优化
- [x] 标题锚点跳转
- [x] 编辑模式（左编辑右预览，实时同步，Ctrl+S 保存）

## 目录结构

```
markdownView/
├── manifest.json        # Manifest V3 配置（含 downloads 权限）
├── content.js           # 渲染 / 编辑 / 主题切换逻辑
├── viewer.css           # 布局、编辑器、主题包配色
├── sample.md            # 测试文件
├── icons/               # 扩展图标
├── themes/              # 主题包
│   └── morandigarden/
│       ├── morandigarden.css
│       └── fonts/       # 普惠体 + JetBrains Mono
└── lib/                 # 第三方库（本地化）
    ├── markdown-it.min.js
    ├── markdown-it-task-lists.min.js
    ├── highlight.min.js
    ├── highlight-github.css
    ├── highlight-github-dark.css
    ├── katex.min.js
    ├── katex.min.css
    ├── auto-render.min.js
    ├── mermaid.min.js
    ├── github-markdown.css
    └── fonts/           # KaTeX 字体
```

## 已知限制

- `file://` 协议必须手动开启"允许访问文件网址"权限
- Chrome 对 `.md` 的处理依赖文件扩展名；没有扩展名的 markdown 文件无法触发
- Mermaid 库较大（~3MB），首次渲染含图表的文档时按需异步加载
- 切换深浅主题时 Mermaid 图表保持首次渲染时的主题（刷新页面即可应用新主题）

## 调试

加载扩展后，打开任意 `.md`：

- 按 `F12` 看 Console / Network
- 改完 `content.js` 或 `viewer.css` 后，回到 `chrome://extensions/` 点扩展右下角的 **🔄 刷新按钮**，再刷新 .md 页面即可生效

## 打包发布

需要 Windows + 已安装 Chrome。仓库根目录提供 `pack-crx.ps1`，一键生成 `.crx` 和 `.zip`：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\pack-crx.ps1
```

产物会输出到上层目录的 `dist/`：

| 文件 | 用途 |
|------|------|
| `markdown-viewer-chrome-v1.0.0.crx` | 离线分发（接收方拖到 `chrome://extensions/`，需开启开发者模式） |
| `markdown-viewer-chrome.pem` | 🔑 **私钥，务必备份**。下次发新版必须用同一份才能保持扩展 ID 不变 |

> ⚠️ `.pem` 已被 `.gitignore` 排除，并且默认输出在仓库目录之外（`../dist/`），不会进 git。请单独备份到密码管理器或 U 盘。

如果要上架 [Chrome Web Store](https://chrome.google.com/webstore/devconsole)，用同目录里的 `.zip` 上传即可（无需 `.pem`，商店会用 Google 自己的密钥签名）。

接收方安装 `.crx` 的步骤：
1. 打开 `chrome://extensions/`，右上角打开 **开发者模式**
2. **拖动** `.crx` 文件到该页面（不能双击）
3. 点 **添加扩展程序** 确认；启动时若提示"已禁用开发者模式扩展"，点保留即可
4. 想看本地 `file://` 文件，还要进扩展详情打开 **允许访问文件网址**
