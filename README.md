<div align="center">
   <p align="center">
      <a href="https://721806280.github.io/doc-diff-pro/">
         <img src="favicon.svg" alt="DocDiff Pro logo" width="96" height="96">
      </a>
   </p>
   <p align="center">
      <img src="https://img.shields.io/badge/React-19-61dafb?logo=react&amp;logoColor=white" alt="React">
      <img src="https://img.shields.io/badge/Vite-8.0-646CFF?logo=vite&amp;logoColor=white" alt="Vite">
      <img src="https://img.shields.io/badge/TypeScript-6.0-3178C6?logo=typescript&amp;logoColor=white" alt="TypeScript">
      <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License">
   </p>
   <div align="center">
      <a href="https://721806280.github.io/doc-diff-pro/">
         <img src="https://readme-typing-svg.demolab.com?font=Fira+Code&amp;weight=600&amp;size=28&amp;pause=1000&amp;repeat=false&amp;random=false&amp;center=true&amp;vCenter=true&amp;width=620&amp;height=56&amp;lines=DocDiff+Pro+-+Browser+DOCX+Compare" alt="DocDiff Pro - Browser DOCX Compare">
      </a>
   </div>
   <p align="center">
      <a href="https://721806280.github.io/doc-diff-pro/">Live Demo</a>
      ·
      <a href="./README.zh-CN.md">中文说明</a>
      ·
      <a href="./LICENSE">MIT License</a>
   </p>
</div>

## 🌐 Overview

`DocDiff Pro` is a browser-first `.docx` comparison tool for document review, proofreading, and version checks. Upload a baseline document and a revised document to see added, deleted, and modified content side by side.

Document parsing, text normalization, diffing, and highlighting run in the browser. The app does not require a backend comparison service and does not proactively upload your documents to a server.

## ✨ Features

- 📥 Side-by-side baseline (A) and revised (B) inputs with drag-and-drop, replacement, document swapping, and bundled samples.
- 🔍 Semantic, word, and character review levels that adjust diff cleanup and grouping behavior.
- 📊 Similarity plus inserted, deleted, and modified counts, with difference navigation and a difference map.
- 🙈 Temporary difference ignore actions, an ignored-difference list, restore controls, and batch handling for similar differences.
- 🧹 Whitespace handling, full-/half-width normalization, and layout filtering for headers, footers, page numbers, and repeated layout text.
- 📋 Table structure hints for inserted or missing rows, adjacent row splits, and mismatched cell counts.
- 🔗 Synchronized scrolling and a narrow-screen switch between the baseline and revised panes.
- 🖼️ Embedded image display and DOCX conversion warnings.
- 📄 Local HTML review report export with filenames, settings, summary data, and difference previews.
- 🎨 English and Chinese UI, theme presets, and light/dark appearance with locally saved preferences.
- 🔌 Runtime deployment configuration and browser `File` input for embedding in third-party systems.

## ⚡ Quick Start

1. Open the [live demo](https://721806280.github.io/doc-diff-pro/) or run the app locally.
2. Upload or drop a baseline and revised document, or select the bundled sample. Comparison starts automatically when both documents are ready.
3. Adjust the review level and normalization rules as needed. Character mode, whitespace ignore, width normalization, the difference map, and synchronized scrolling are enabled by default; layout filtering is off.
4. Review changes through the result bar, difference map, or previous/next buttons. Use `Alt+↑` and `Alt+↓` for keyboard navigation.
5. After enabling `Difference ignore`, click a difference to ignore or restore it, or press `I` to toggle the current difference. Ignore state belongs to the current comparison and is cleared when the comparison is recalculated.
6. To keep a record, enable `Report export` in compare settings and download the HTML report from the result bar.

## 🔍 Review Levels and Difference Counting

All three levels compare character sequences through `diff-match-patch`. They do not use an NLP semantic model or strict natural-language tokenization:

- **Semantic** applies semantic cleanup to reduce fragmented changes and is intended for quick review.
- **Word** groups nearby changes more aggressively for content checks; it is not a strict word-token mode.
- **Character** preserves finer changes for detailed proofreading.

The number of highlighted fragments may differ from the difference count in the result bar. After text diffing, changes are organized into structural review units:

- Adjacent paragraphs, list items, headings, and other body blocks are generally counted separately.
- Table rows are the main table review boundary; changes across multiple cells in the same row are generally counted as one difference.
- A group containing both deletion and insertion is `Modified`; a group present on only one side is `Deleted` or `Inserted`.

Similarity is computed from the edit distance of the currently normalized text:

```text
1 - edit distance / max(baseline text length, revised text length)
```

## 🧹 Text Normalization

### ↔️ Ignore Whitespace

Reduces whitespace noise introduced by layout, conversion, or structural changes. Current handling includes:

- Extra line breaks or whitespace from merged paragraphs or list items.
- Layout spacing after clause or list numbering, such as `1.3.1. Access`.
- Whitespace in mixed CJK, Latin, and numeric text, such as `2025 年`, `A 座`, or `8 号`.
- Numeric whitespace in phone numbers, dates, or IDs, such as `010 59618935`.
- Local whitespace inside emails, domains, and URLs, such as `review. team@example. com`.
- Field-punctuation whitespace in CJK context, such as `邮箱： name@example.com`.

Ordinary spaces between English words are not ignored by default, such as in `Example Corp`, so real differences in English prose are not hidden.

### 📏 Normalize Full-/Half-Width

Treats full-width ASCII and half-width ASCII as equivalent, including letters, digits, and common symbols.

### 🧾 Layout Filtering

DocDiff Pro separates layout text from body content before diffing:

- Native DOCX headers and footers are read during parsing, used as layout hints, listed in layout details, and removed from the displayed document body.
- With `Layout filter` enabled, converted body content matching header or footer hints is also excluded from comparison input.
- Page text such as `Page 1 of 5`, `P. iv of x`, `第1页/共5页`, `1/5`, or `页码：1` can be recognized.
- Repeated short layout text such as confidentiality notices, copyright notices, document IDs, phone numbers, or email footer lines can be filtered.
- To protect body content, contact fragments such as phone numbers, email addresses, and contact names are only matched against page-marked candidates.
- Click the `Layout` count in the result bar to review details.

## 🔒 Privacy

- Documents are read through the browser File API, then parsed and compared locally; the hosted demo is a static GitHub Pages site.
- The app writes only UI language, theme, and comparison settings to `localStorage`. Uploaded documents, difference content, and ignore state are not persisted.
- The browser asks for confirmation before closing or refreshing a page with an active document session.
- A user-initiated HTML report contains filenames, settings, summary data, and difference text previews. The browser saves it to the local downloads directory, and the app does not upload it.
- How a third-party integration obtains, transfers, or stores supplied files is outside the app's control.

## 📌 Supported Inputs and Limits

- Only `.docx` files are supported. `.doc`, `.pdf`, scanned documents, and OCR workflows are not supported.
- Each file is limited to 25 MB by default, configurable at runtime. This is an upload validation limit, not a guarantee that every complex document will complete in the same amount of time.
- Embedded images can be displayed, but image contents are not compared or OCR-processed.
- DOCX-to-HTML fidelity depends on mammoth. The app preserves convertible paragraphs, lists, tables, and images where possible, but complex Word layouts may not match Microsoft Word.
- A modern browser with File API, Web Worker, and ES module support is required. Internet Explorer is not supported.
- A worker timeout or insufficient browser resources can cause comparison to fail; the UI keeps the error and provides a retry action.

## 🔌 Third-Party Integration

Deployments can inject runtime configuration before the application entry module runs. Deployment configuration remains separate from comparison settings saved in the browser.

```html
<script>
window.__DOC_DIFF_CONFIG__ = {
  documentInput: 'external',
  showHeader: false,
  showSampleDocuments: false,
  showGithubLink: false,
  locale: 'en',
  maxDocxSizeMb: 40
};
</script>
```

| Option | Default | Description |
| --- | --- | --- |
| `documentInput` | `local` | `local` shows browser file inputs; `external` disables local upload and enables the `window.DocDiffPro` API. |
| `showHeader` | `true` | Controls the top toolbar. |
| `showSampleDocuments` | `true` | Controls the bundled sample action. |
| `showGithubLink` | `true` | Controls the author repository link in the toolbar. |
| `locale` | `auto` | Accepts `auto`, `zh-CN`, or `en`. `auto` prefers a saved locale before browser detection. |
| `maxDocxSizeMb` | `25` | Per-file size limit; it must be a finite number greater than zero. |

`documentInput: 'external'` does not accept URLs. The integrating system must handle authentication, source validation, and file retrieval, then pass browser `File` objects after DocDiff Pro has mounted:

```js
// Run after window.DocDiffPro becomes available.
await window.DocDiffPro.loadDocuments({
  baseline: baselineFile,
  revised: revisedFile
});
```

Either `baseline` or `revised` may be supplied independently. The API is installed only in `external` mode and works on the same page or in a same-origin iframe. Cross-origin iframes require an integration-owned `postMessage` adapter with explicit origin validation; the app does not expose an unrestricted message listener.

The GitHub entry always points to the author's repository and cannot be replaced at runtime; only its visibility is configurable. Setting `showHeader: false` hides the entire toolbar, including comparison settings and UI preference controls.

The default build path is `/doc-diff-pro/`. Set `VITE_BASE_PATH` with leading and trailing slashes when building for another subpath:

```bash
VITE_BASE_PATH=/document-tools/ pnpm build
```

## 🛠️ Local Development

Vite 8 requires Node.js `^20.19.0 || >=22.12.0`. Node.js 22.12 or a newer LTS release is recommended, with pnpm for dependency installation.

```bash
pnpm install
pnpm dev
```

Common checks:

```bash
pnpm test
pnpm typecheck
pnpm build
```

Preview the completed build locally:

```bash
pnpm preview
```

## 🔧 How It Works

- 📦 DOCX conversion uses the npm alias `mammoth@npm:@xm721806280/mammoth`, currently based on `1.12.0-rc3`; generated HTML is sanitized with DOMPurify.
- 🧾 Headers and footers are parsed with the document, converted into layout hints, and excluded from the displayed body.
- 🧮 Text differences are computed by diff-match-patch in a Web Worker; long-running requests time out.
- 🧯 Environments without Worker support can fall back to the main thread after a text-size safety check.
- 🧱 Text mapping, whitespace collapsing, and normalization rules live in `src/utils/documentText.ts`.
- 🧭 Structural difference grouping lives in `src/utils/diffGroupStructure.ts`.
- 🧹 Layout noise detection lives in `src/utils/layoutNoise.ts`.
- 📋 Table structure diagnosis lives in `src/utils/tableStructureHint.ts`.
- 🙈 Difference ignore behavior and similar-difference scoring live in `src/utils/diffReview.ts`.
- 📄 Local HTML review reports are generated by `src/services/reviewReport.ts`.
- 🎨 Theme tokens live in `src/utils/themeColor.ts`, and interface strings live in `src/i18n/`.

## 📜 License

Released under the [MIT License](./LICENSE).
