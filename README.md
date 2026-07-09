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

Built with `Vue 3`, `Vite`, `mammoth`, and `diff-match-patch`. Document parsing, text normalization, diffing, and highlighting run in the browser, so the app does not upload your documents to a server.

## ✨ Features

- 📥 Side-by-side upload of the baseline (A) and revised (B) documents, with drag-and-drop and document replacement.
- 🔍 Three diff granularities: semantic, word, and character, covering quick review through fine-grained proofreading.
- 📊 Similarity score and change counts derived from the current normalized comparison text.
- 🧭 Difference navigation for jumping between previous and next changes.
- 🙈 Temporary ignore actions for the current difference, with an ignored-differences list and one-click restore.
- 🧠 Similar-difference suggestions for optional batch ignore when repeated review noise appears.
- 🔗 Synchronized scrolling across both panes to keep long documents aligned.
- 🧹 Ignore whitespace, normalize full-/half-width characters, and filter layout noise such as page headers, footers, page numbers, and repeated layout text.
- 📋 Table structure hints for common review cases such as inserted rows, missing rows, adjacent row splits, or mismatched cell counts.
- 🧩 Preserves the original document structure and maps normalized diffs back to their original DOM text positions.
- 🖼️ Displays embedded document images and surfaces DOCX conversion warnings when mammoth reports them.
- 🎨 Theme color presets and light/dark appearance mode, saved with the rest of the compare settings.
- ⌨️ Keyboard-friendly dialogs with focus containment for details panels and review overlays.
- 🌐 Bilingual interface (English / 中文) that auto-detects your browser language and remembers your choice.

## ⚡ Quick Start

1. Open the live demo or run the app locally.
2. Upload or drop the baseline document on the left and the revised document on the right.
3. Choose the diff granularity and normalization settings.
4. Review the summary, then use the navigator to move through each change.
5. Temporarily ignore known noise when needed; restore ignored items from the result bar.
6. Open layout details, similar-difference suggestions, or table hints when they appear, and replace either document to compare another version.

## 🧹 Text Normalization

### Ignore whitespace

Reduces noise from layout, conversion, or structural changes. Current handling includes:

- Extra line breaks or whitespace from merged paragraphs or list items.
- Layout spacing after clause or list numbering, e.g. `1.3.1. Access`.
- Whitespace in mixed CJK / Latin / numeric text, e.g. `2025 年`, `A 座`, `8 号`.
- Whitespace inside numbers, e.g. phone numbers, dates, or IDs like `010 59618935`.
- Local whitespace inside emails, domains, and URLs, e.g. `review. team@example. com`.
- Field-punctuation whitespace in CJK context, e.g. `邮箱： name@example.com` and `邮箱:name@example.com`.

Ordinary spaces between English words are **not** ignored by default (e.g. `Example Corp`), so that real differences in English prose are not mistaken for formatting differences.

### Normalize Full-/Half-Width

Treats full-width ASCII and half-width ASCII as equivalent, including full-width letters, digits, and common symbols.

### Layout Noise Filtering

DocDiff Pro separates layout text from body content before diffing.

- Native DOCX headers and footers are always read during parsing, used as layout hints, kept in layout details, and removed from the displayed document body.
- When `Layout filter` is enabled, converted page text in the document body can also be filtered when it matches page header/footer hints.
- Page numbers such as `Page 1 of 5`, `P. iv of x`, `第 1 页，共 5 页`, `第1页/共5页`, `共5页 第1页`, `1/5`, `页码：1`, or `— 1/5 —` can be removed from the comparison input.
- Repeated short layout text such as confidentiality notices, copyright notices, document IDs, phone numbers, or email footer lines can be filtered.
- Body text is protected from broad fragment matching: extracted footer fragments such as phone numbers or email addresses are only used against page-marked candidates.
- The `Layout` count in the result bar can be clicked to review layout details.

## 🔒 Privacy

- Document files are read through the browser File API, then parsed and compared locally.
- No backend service is required; the hosted demo is a static GitHub Pages site.
- The app stores only interface preferences and compare settings in `localStorage`; uploaded document contents are not persisted by the app.

## 📌 Supported Inputs and Limits

- Only `.docx` files are accepted.
- Each uploaded file must be 25 MB or smaller.
- `.doc`, `.pdf`, scanned documents, and OCR workflows are not supported.
- Embedded images can be displayed, but image contents are not OCR-compared.
- DOCX-to-HTML fidelity depends on mammoth, so highly complex Word layouts may not render exactly like Microsoft Word.

## ⚙️ Usage Tips

- 🧭 Defaults favor precise review: character diffing, whitespace ignore, full-/half-width normalization, and sync scrolling are enabled; `Layout filter` is off by default.
- 📝 General version comparison: enable `Ignore spaces` / `Normalize width` as needed.
- 🎯 Strict character-by-character proofreading: choose the character granularity and turn off any normalization toggles you don't need.
- 🔎 Comparing converted documents: enable `Ignore spaces` and `Layout filter` to reduce whitespace, page header/footer, and page-number noise introduced by conversion.
- 🙈 Repeated harmless changes: enable `Temporary ignore` and `Similar suggestions`, then review and batch-ignore matching differences.
- 🌙 Long review sessions: switch to night mode or adjust the theme color from the toolbar; the preference is saved locally.

## 🛠️ Development

Node.js 20.19+ is recommended.

```bash
npm install
npm run dev
```

Common checks:

```bash
npm test
npm run typecheck
npm run build
```

Preview the production build:

```bash
npm run build
npm run preview
```

## 🔧 How It Works

- 📦 `.docx` parsing is handled by mammoth, and the resulting HTML is sanitized with DOMPurify.
- 🧾 DOCX headers and footers are parsed once with the document, converted into layout hints, and excluded from the final displayed body.
- 🧮 Text diffing is handled by diff-match-patch in a web worker; long-running worker requests time out instead of falling back to the main thread.
- 🧯 Synchronous diff fallback is guarded by a text-size limit so unsupported worker environments do not freeze on large documents.
- 📈 Similarity is computed from the edit distance of the current normalized text: `1 - editDistance / max(originalLength, revisedLength)`.
- 🧱 Text mapping, whitespace collapsing, and normalization rules are centralized in `src/utils/documentText.ts`.
- 🧹 Layout noise detection is centralized in `src/utils/layoutNoise.ts`.
- 📋 Table structure diagnosis is centralized in `src/utils/tableStructureHint.ts`.
- 🙈 Review ignore state and similar-difference scoring live in `src/utils/diffReview.ts`.
- 🎨 Theme tokens live in `src/utils/themeColor.ts`; teleported overlays receive the same CSS variables through the document root.
- 🎯 Diff markers are mapped back to the DOM through the original text nodes, so normalization logic never leaks into the rendering layer.
- 🌐 Interface strings live in a typed message catalog under `src/i18n/`.
- 📐 Only `.docx` files are supported, up to 25 MB per file.

## 📜 License

Released under the [MIT License](./LICENSE).
