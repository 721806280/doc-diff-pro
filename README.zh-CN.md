<div align="center">
   <p align="center">
      <a href="https://721806280.github.io/doc-diff-pro/">
         <img src="favicon.svg" alt="DocDiff Pro logo" width="96" height="96">
      </a>
   </p>
   <p align="center">
      <img src="https://img.shields.io/badge/Vue-3.5-42b883?logo=vue.js&amp;logoColor=white" alt="Vue">
      <img src="https://img.shields.io/badge/Vite-8.0-646CFF?logo=vite&amp;logoColor=white" alt="Vite">
      <img src="https://img.shields.io/badge/TypeScript-6.0-3178C6?logo=typescript&amp;logoColor=white" alt="TypeScript">
      <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License">
   </p>
   <div align="center">
      <a href="https://721806280.github.io/doc-diff-pro/">
         <img src="https://readme-typing-svg.demolab.com?font=Fira+Code&amp;weight=600&amp;size=28&amp;pause=1000&amp;repeat=false&amp;random=false&amp;center=true&amp;vCenter=true&amp;width=620&amp;height=56&amp;lines=DocDiff+Pro+-+DOCX+%E6%96%87%E6%A1%A3%E6%AF%94%E5%AF%B9%E5%B7%A5%E5%85%B7" alt="DocDiff Pro - DOCX 文档比对工具">
      </a>
   </div>
   <p align="center">
      <a href="https://721806280.github.io/doc-diff-pro/">在线体验</a>
      ·
      <a href="./README.md">English README</a>
      ·
      <a href="./LICENSE">MIT License</a>
   </p>
</div>

## 🌐 项目简介

`DocDiff Pro` 是一款浏览器优先的 `.docx` 文档比对工具，适用于文档审阅、校对和版本核对。你可以上传基准文档与修订文档，并在双栏视图中查看新增、删除和修改位置。

文档解析、文本归一化、差异计算和高亮均在浏览器内完成。应用不依赖后端比对服务，也不会主动将你的文档上传到服务器。

## ✨ 主要能力

- 📥 双栏上传基准文档（A）与修订文档（B），支持拖拽、替换、交换文档和内置示例。
- 🔍 提供语义级、词组级、字符级三种审阅粒度，用于调整差异清理和分组方式。
- 📊 展示相似度与新增、删除、修改数量，并提供差异导航和差异地图。
- 🙈 支持临时忽略差异、查看或恢复已忽略项，并可批量处理相似差异。
- 🧹 支持忽略空白、统一全半角和版面过滤，减少页眉页脚、页码及重复版面文字干扰。
- 📋 提供表格结构提示，辅助判断新增行、缺失行、相邻行拆分或单元格数不一致。
- 🔗 支持同步滚动；窄屏设备可在基准文档和修订文档之间切换。
- 🖼️ 展示可提取的内嵌图片，并提示 DOCX 转换警告。
- 📄 可将文件名、比对设置、摘要和差异预览导出为本地 HTML 审阅报告。
- 🎨 提供中英文界面、主题色和浅色/夜间模式，并在本地保存界面偏好。
- 🔌 支持运行时部署配置和浏览器 `File` 对象接入，便于嵌入第三方系统。

## ⚡ 快速使用

1. 打开[在线体验](https://721806280.github.io/doc-diff-pro/)，或在本地运行项目。
2. 上传或拖入基准文档与修订文档；也可以点击“使用示例文档”。两侧文档就绪后会自动开始比对。
3. 按需调整比对粒度和归一化规则。默认启用字符级、忽略空白、统一全半角、差异地图和同步滚动；版面过滤默认关闭。
4. 使用结果栏、差异地图或“上一处/下一处”按钮逐项审阅。键盘可使用 `Alt+↑` 和 `Alt+↓` 导航。
5. 开启“差异忽略”后，可以点击差异执行忽略或恢复，也可以按 `I` 切换当前差异状态。忽略状态仅属于当前比对，重新比对时会清空。
6. 如需留档，可在比对设置中开启“导出报告”，然后从结果栏下载 HTML 审阅报告。

## 🔍 比对粒度与差异计数

三种粒度都基于 `diff-match-patch` 的字符序列比对，不使用 NLP 语义模型，也不执行严格的自然语言分词：

- **语义级**：使用语义清理规则减少零碎片段，适合快速审阅。
- **词组级**：更积极地合并相近变化，适合内容核对；它不是严格的按词分词模式。
- **字符级**：尽量保持细粒度变化，适合逐字符校对。

高亮片段数量不一定等于结果栏中的差异数量。文本差异生成后还会按文档结构整理为审阅单元：

- 相邻段落、列表项、标题等正文块通常分别计数。
- 表格以行为主要审阅边界；同一行内多个单元格的变化通常计为一个差异。
- 同一组中同时存在删除和新增时计为“修改”，只存在一侧时计为“删除”或“新增”。

相似度根据当前归一化文本的编辑距离计算：

```text
1 - 编辑距离 / max(基准文本长度, 修订文本长度)
```

## 🧹 文本归一化

### ↔️ 忽略空白

用于减少排版、转换或结构变化造成的空白干扰，当前会处理：

- 段落或列表项合并造成的多余换行或空白。
- 条款、列表编号后的版式空白，例如 `1.3.1. 访问`。
- 中文、英文、数字混排中的空白，例如 `2025 年`、`A 座`、`8 号`。
- 电话、日期、编号中的数字空白，例如 `010 59618935`。
- 邮箱、域名和 URL 中的局部空白，例如 `review. team@example. com`。
- 中文上下文中的字段标点空白，例如 `邮箱： name@example.com`。

普通英文词间空格不会默认忽略，例如 `Example Corp`，以免掩盖英文正文中的真实差异。

### 📏 统一全半角

用于统一全角 ASCII 与半角 ASCII 的差异，包括全角字母、数字和常见符号。

### 🧾 版面过滤

DocDiff Pro 会在正式比对前把版面内容和正文内容分离：

- 原生 DOCX 页眉页脚会在解析时读取，用作版面线索、列入版面明细，并从展示正文中移除。
- 开启“版面过滤”后，正文中命中页眉页脚线索的转换内容也会从比对输入中排除。
- 可识别 `第1页/共5页`、`1/5`、`Page 1 of 5`、`P. iv of x`、`页码：1` 等页码文本。
- 可过滤重复出现的短版面文字，例如保密提示、版权声明、文件编号、电话或邮箱页脚。
- 为避免误删正文，电话、邮箱、联系人等片段线索只用于带页码特征的候选文本。
- 结果栏中的“版面干扰”数量可点击查看明细。

## 🔒 隐私说明

- 文档通过浏览器 File API 读取，并在本地解析和比对；在线体验站点是静态 GitHub Pages 页面。
- 应用仅将界面语言、主题和比对设置写入 `localStorage`，不会持久化上传的文档、差异内容或忽略状态。
- 关闭或刷新仍有文档的页面前，浏览器会提示确认，以免误丢当前会话。
- 用户主动导出的 HTML 报告会包含文件名、设置、摘要和差异文本预览，并由浏览器保存到本地下载目录；报告不会由应用上传。
- 第三方接入方如何获取、传输或保存传入的文件不属于本应用控制范围。

## 📌 支持范围与限制

- 仅支持 `.docx` 文件；不支持 `.doc`、`.pdf`、扫描件或 OCR 流程。
- 单个文件默认不能超过 25 MB，可通过运行时配置调整。该上限只用于上传校验，不代表所有复杂文档都能在相同时间内完成比对。
- 可展示内嵌图片，但不会比较图片内容，也不会执行图片 OCR。
- DOCX 到 HTML 的转换效果取决于 mammoth。应用会尽量保留可转换的段落、列表、表格和图片，但复杂 Word 版式不一定与 Microsoft Word 一致。
- 需要支持 File API、Web Worker 和 ES module 的现代浏览器；不支持 Internet Explorer。
- Worker 比对超时或浏览器资源不足时，比对可能失败，界面会保留错误提示和重试入口。

## 🔌 第三方系统接入

部署方可在应用入口脚本执行前注入运行时配置。部署配置与用户保存在浏览器中的比对设置相互独立。

```html
<script>
window.__DOC_DIFF_CONFIG__ = {
  documentInput: 'external',
  showHeader: false,
  showSampleDocuments: false,
  showGithubLink: false,
  locale: 'zh-CN',
  maxDocxSizeMb: 40
};
</script>
```

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `documentInput` | `local` | `local` 显示本地文件入口；`external` 关闭本地上传并启用 `window.DocDiffPro` API。 |
| `showHeader` | `true` | 是否显示顶部工具栏。 |
| `showSampleDocuments` | `true` | 是否显示内置示例文档入口。 |
| `showGithubLink` | `true` | 是否在顶部工具栏显示作者仓库入口。 |
| `locale` | `auto` | 支持 `auto`、`zh-CN` 和 `en`。`auto` 优先使用已保存语言，再检测浏览器语言。 |
| `maxDocxSizeMb` | `25` | 单个文件大小上限，必须是大于 0 的有限数字。 |

`documentInput: 'external'` 不支持 URL 输入。接入方应先完成鉴权、来源验证和文件获取，再在 DocDiff Pro 挂载完成后传入浏览器 `File` 对象：

```js
// Run after window.DocDiffPro becomes available.
await window.DocDiffPro.loadDocuments({
  baseline: baselineFile,
  revised: revisedFile
});
```

`baseline` 和 `revised` 可只传入其中一侧。该 API 仅在 `external` 模式下安装，适用于同页面或同源 iframe。跨域 iframe 需要接入方增加带明确来源校验的 `postMessage` 适配层；应用不会开放无来源校验的消息入口。

GitHub 入口固定指向作者仓库，不支持运行时替换，只能通过 `showGithubLink` 控制显示。设置 `showHeader: false` 会隐藏整个顶部工具栏，包括比对设置和界面偏好入口。

默认构建路径为 `/doc-diff-pro/`。构建到其他子路径时可设置以 `/` 开头和结尾的 `VITE_BASE_PATH`：

```bash
VITE_BASE_PATH=/document-tools/ pnpm build
```

## 🛠️ 本地开发

Vite 8 需要 Node.js `^20.19.0 || >=22.12.0`，建议使用 Node.js 22.12 或更高的 LTS 版本，并使用 pnpm 安装依赖。

```bash
pnpm install
pnpm dev
```

常用检查：

```bash
pnpm test
pnpm typecheck
pnpm build
```

完成构建后可本地预览：

```bash
pnpm preview
```

## 🔧 技术说明

- 📦 DOCX 转换使用 npm 别名 `mammoth@npm:@xm721806280/mammoth`，当前基于 `1.12.0-rc3`；生成的 HTML 会通过 DOMPurify 清洗。
- 🧾 页眉页脚随文档解析，转换为版面线索，并从最终展示正文中排除。
- 🧮 文本差异由 diff-match-patch 在 Web Worker 中计算；长时间未完成的请求会超时。
- 🧯 不支持 Worker 时可回退到主线程，但会先检查文本长度，避免大文档长时间阻塞界面。
- 🧱 文本映射、空白折叠和归一化规则集中在 `src/utils/documentText.ts`。
- 🧭 差异结构分组集中在 `src/utils/diffGroupStructure.ts`。
- 🧹 版面干扰识别集中在 `src/utils/layoutNoise.ts`。
- 📋 表格结构诊断集中在 `src/utils/tableStructureHint.ts`。
- 🙈 差异忽略和相似差异评分集中在 `src/utils/diffReview.ts`。
- 📄 本地 HTML 审阅报告由 `src/services/reviewReport.ts` 生成。
- 🎨 主题 token 集中在 `src/utils/themeColor.ts`，界面文案集中在 `src/i18n/`。

## 📜 开源许可

本项目基于 [MIT License](./LICENSE) 开源。
