<div align="center">

### 卡片链接

一个将 URL 渲染为精美的卡片的 Obsidian 插件

[English](README.md) / 中文

![Preview](preview.png)

</div>

## 💻 功能

- **粘贴即渲染** — 粘贴 URL 自动转为卡片链接
- **回退链机制** — 依次尝试：专用解析器 → HTML meta 标签 → 第三方 API（Microlink）
- **专用解析器** — 针对特定网站的增强元数据提取：
  - 🎬 **B 站** — 视频信息（播放量、时长、作者名）、作者头像、封面图
  - 🎬 **YouTube** — 视频信息（播放量、作者名）、作者头像、封面图  
  - 🐙 **GitHub** — 仓库信息（星标数、作者名、仓库名）、OpenGraph 封面
  - 🐦 **X/Twitter** — 推文内容、浏览量、作者头像、封面图（通过 [Nitter](https://github.com/zedeus/nitter) 代理）
- **数据缓存** — 避免重复请求相同 URL
- **动态布局** — 根据图片宽度自动调整布局
- **深色模式** — 卡片跟随 Obsidian 的明暗模式
- **双语界面** — 中英文界面

## 🚀 安装

### 方法一：使用 BRAT 安装

1. 安装 [BRAT](https://github.com/TfTHacker/obsidian42-brat)
2. 打开 BRAT 设置 → **Add Beta plugin**
3. 粘贴仓库地址：`https://github.com/Hsyoungtick/obsidian-link-card`
4. 启用插件

### 方法二：手动安装

1. 从 [Releases](https://github.com/Hsyoungtick/obsidian-link-card/releases) 下载 `main.js`、`styles.css`、`manifest.json`
2. 在 `.obsidian/plugins/` 下创建 `link-card` 文件夹
3. 将下载的文件移动到 `.obsidian/plugins/link-card/`
4. 重启 Obsidian，在设置中启用插件

## 📖 使用方法

### 粘贴 URL

- 复制 URL 并粘贴，它会自动转换为卡片链接

### 右键菜单

- 选中 URL，右键点击 → **渲染为卡片**

## ⚙️ 配置说明

| 设置项            | 说明                         | 默认值                                             |
| -------------- | -------------------------- | ----------------------------------------------- |
| 粘贴 URL 为卡片     | 粘贴 URL 时自动获取元数据            | `true`                                          |
| 右键菜单命令         | 在右键菜单中添加命令                 | `true`                                          |
| 跟随日夜模式         | 卡片跟随 Obsidian 深色/浅色模式      | `true`                                          |
| 启用缓存           | 缓存已获取的元数据                  | `false`                                         |
| 缓存过期时间         | 缓存保留时长（小时）                 | `24`                                            |
| 备用元数据 API      | 直接请求失败时使用 Microlink        | `true`                                          |
| B 站 API 地址     | B 站视频 API 接口               | `https://api.bilibili.com/x/web-interface/view` |
| X/Twitter 代理地址 | 用于 X/Twitter 的 Nitter 实例地址 | `http://127.0.0.1:8080`                         |

### `cardlink` 语法

代码块 `cardlink` 使用 YAML 语法：

```cardlink
url: https://www.bilibili.com/video/BV1GJ411x7h7
title: "视频标题"
host: bilibili.com
image: https://example.com/cover.jpg
author: UP主名
views: 123.4万
duration: 10:30
date: 2024-01-15
```

### 属性说明

| 名称            | 必填 | 说明                          |
| ------------- | -- | --------------------------- |
| `url`         | ✅  | 点击卡片时打开的链接                  |
| `title`       | ✅  | 链接标题                        |
| `description` | ❌  | 描述文本                        |
| `host`        | ❌  | 卡片中显示的域名                    |
| `image`       | ❌  | 缩略图（支持内部链接 `[[image.png]]`） |
| `favicon`     | ❌  | 网站图标（作为头像回退）                |
| `avatar`      | ❌  | 作者头像图片                      |
| `author`      | ❌  | 作者名称                        |
| `date`        | ❌  | 发布日期                        |
| `views`       | ❌  | 播放量                         |
| `duration`    | ❌  | 视频时长                        |
| `stars`       | ❌  | 星标数（GitHub）                 |
| `repo`        | ❌  | 仓库名（GitHub）                 |

### X/Twitter 配置

要启用 X/Twitter 卡片链接，需要部署 [Nitter](https://github.com/zedeus/nitter) 实例：

1. 部署 Nitter（推荐使用 Docker）
2. 在插件设置中填入 Nitter 地址（如 `http://127.0.0.1:8080`）

## 🎨 自定义样式

卡片样式定义在 `styles.css` 中。你可以通过 [CSS 片段](https://help.obsidian.md/How+to/Add+custom+styles#Use+Themes+and+or+CSS+snippets) 覆盖样式。

## 🏗️ 开发

```bash
# 安装依赖
pnpm install

# 开发模式（监听文件变化）
pnpm dev

# 生产构建
pnpm build
```

开发时如需自动复制到 Vault，创建 `.devconfig.json`：

```json
{
  "vaultPluginPaths": [
    "/你的Vault路径/.obsidian/plugins/link-card"
  ]
}
```

## 📌 未来计划

- [ ] 支持更多网站的元数据提取

## ✨ 灵感来源

- [obsidian-auto-card-link](https://github.com/nekoshita/obsidian-auto-card-link): 自动从 URL 获取元数据并将其转换为卡片式链接
- [obsidian-nifty-links](https://github.com/x-Ai/obsidian-nifty-links): 生成优雅的、Notion 风格的富链接卡片
- [hexo-tag-bilibili-card](https://github.com/wherewhere/hexo-tag-bilibili-card): 一个 Hexo 插件，在你的文章中插入哔哩哔哩卡片

## 🤖 免责声明

本项目由 AI 辅助生成，介意者请慎用。

## 📝 许可证

[MIT](LICENSE)
