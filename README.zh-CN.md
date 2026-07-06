<div align="center">
   <p align="center">
      <a href="https://721806280.github.io/doc-diff-pro/">
         <img src="public/favicon.svg" alt="DocDiff Pro logo" width="96" height="96">
      </a>
   </p>
   <p align="center">
      <img src="https://img.shields.io/badge/Vue-3.5-42b883?logo=vue.js&amp;logoColor=white" alt="Vue">
      <img src="https://img.shields.io/badge/Vite-8.0-646CFF?logo=vite&amp;logoColor=white" alt="Vite">
      <img src="https://img.shields.io/badge/TypeScript-6.0-3178C6?logo=typescript&amp;logoColor=white" alt="TypeScript">
      <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License">
      <img src="https://img.shields.io/badge/Author-xm.z-success" alt="Author">
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

项目基于 `Vue 3`、`Vite`、`mammoth` 和 `diff-match-patch` 构建。文档解析、文本归一化、差异计算和高亮均在浏览器内完成，应用不会将你的文档上传到服务器。

## ✨ 主要能力

- 📥 双栏上传基准文档（A）与修订文档（B），支持拖拽上传和替换文档。
- 🔍 支持语义级、词组级、字符级三种比对粒度，兼顾快速审阅与精细校对。
- 📊 展示基于当前归一化比对文本计算的相似度和变更数量。
- 🧭 支持差异导航，可在上一处、下一处差异之间快速跳转。
- 🔗 支持双视图同步滚动，长文档对照时更容易保持上下文。
- 🧹 支持忽略空白、统一全半角、版面过滤，减少空白、页眉页脚、页码和重复版面文字带来的干扰。
- 📋 支持表格结构提示，可辅助识别新增行、缺失行、相邻行拆分或单元格数不一致等情况。
- 🧩 保留原文档结构展示，并将归一化后的差异映射回原始 DOM 文本位置。
- 🖼️ 展示 mammoth 可提取的内嵌图片，并提示 DOCX 转换警告。
- 🌐 提供中英文双语界面，自动识别浏览器语言并记住你的选择。

## ⚡ 快速使用

1. 打开在线体验地址，或在本地运行项目。
2. 在左侧上传或拖入基准文档，在右侧上传或拖入修订文档。
3. 选择比对粒度和归一化设置。
4. 查看结果摘要，并通过差异导航逐处审阅变化。
5. 出现版面过滤明细或表格提示时可进一步查看，也可以替换任意一侧文档继续比对。

## 🧹 文本归一化

### 忽略空白

用于忽略常见版式差异，减少排版、转换或文档结构变化带来的干扰。当前会处理的情况包括：

- 段落或列表项合并造成的多余换行或空白。
- 条款、列表编号后的版式空白，例如 `1.3.1. 访问`。
- 中文、英文、数字混排中的空白，例如 `2025 年`、`A 座`、`8 号`。
- 数字内部空白，例如电话、日期、编号中的 `010 59618935`。
- 邮箱、域名、URL 中的局部空白，例如 `review. team@example. com`。
- 中文上下文里的字段标点空白，例如 `邮箱： name@example.com` 和 `邮箱:name@example.com`。

普通英文词间空格不会默认忽略，例如 `Example Corp`，以避免将英文正文中的真实差异误判为格式差异。

### 统一全半角

用于统一全角 ASCII 与半角 ASCII 的差异，包括全角字母、数字和常见符号。

### 版面过滤

开启 `版面过滤` 后，DocDiff Pro 会在正式比对前排除高置信的版面干扰。

- 原生 DOCX 页眉页脚会在一次解析中读取，用作版面线索，并从最终展示正文中移除。
- 转换后进入正文的页眉页脚，如果命中页眉页脚线索，可从比对输入中排除。
- 支持过滤 `第 1/5 页`、`Page 1 of 5`、`- 1 -` 等页码文本。
- 支持过滤重复出现的短版面文字，例如保密提示、版权声明、文件编号、电话或邮箱页脚。
- 为避免误删正文，电话、邮箱、联系人等片段线索只用于带页码特征的候选文本。
- 结果栏中的 `版面干扰` 数量可点击查看已过滤明细。

## 🔒 隐私说明

- 文档文件通过浏览器 File API 读取，并在本地解析和比对。
- 比对流程不依赖后端服务；在线体验站点是静态 GitHub Pages 页面。
- 应用只会将界面偏好和比对设置写入 `localStorage`；上传的文档内容不会被应用持久化保存。

## 📌 支持范围与限制

- 仅支持上传 `.docx` 文件。
- 单个上传文件不能超过 25 MB。
- 不支持 `.doc`、`.pdf`、扫描件和 OCR 流程。
- 可以展示内嵌图片，但不会对图片内容进行 OCR 比对。
- DOCX 到 HTML 的转换效果取决于 mammoth，复杂 Word 版式可能无法与 Microsoft Word 完全一致。

## ⚙️ 使用建议

- 🧭 默认设置偏向减少审阅噪音：语义级比对、忽略空白、统一全半角、版面过滤和同步滚动均已开启。
- 📝 普通文档版本比对：按需开启 `忽略空白`、`统一全半角`。
- 🎯 严格逐字符校对：选择字符级颗粒度，并关闭不需要的归一化开关。
- 🔎 转换后文档比对：建议开启 `忽略空白` 和 `版面过滤`，减少空白、页眉页脚和页码干扰。

## 🛠️ 开发命令

建议使用 Node.js 20.19 或更高版本。

```bash
npm install
npm run dev
```

常用检查：

```bash
npm test
npm run typecheck
npm run build
```

预览生产构建：

```bash
npm run build
npm run preview
```

## 🔧 技术说明

- 📦 `.docx` 解析由 mammoth 完成，生成的 HTML 通过 DOMPurify 清洗。
- 🧾 DOCX 页眉页脚会随文档一次解析，转换为版面线索，并从最终展示正文中排除。
- 🧮 文本比对由 diff-match-patch 完成，运行在 Web Worker 中并提供同步回退。
- 📈 相似度按当前归一化文本的编辑距离计算：`1 - 编辑距离 / max(基准文本长度, 修订文本长度)`。
- 🧱 文本映射、空白折叠和归一化规则集中在 `src/utils/documentText.ts`。
- 🧹 版面干扰识别集中在 `src/utils/layoutNoise.ts`。
- 📋 表格结构诊断集中在 `src/utils/tableStructureHint.ts`。
- 🎯 差异标记通过原始文本节点映射回 DOM，避免归一化逻辑散落到渲染层。
- 🌐 界面文案集中在 `src/i18n/` 的类型化消息表中。
- 📐 仅支持 `.docx` 文件，单个文件不超过 25 MB。

## 📜 开源许可

本项目基于 [MIT License](./LICENSE) 开源。
