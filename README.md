# 📄 DocDiff Pro

A browser-based `.docx` comparison tool for review and proofreading. Upload an original document and a revised document, then instantly see what was added, deleted, and modified.

Built with Vue 3, Vite, mammoth, and diff-match-patch. Document parsing, text normalization, diffing, and side-by-side highlighting all run locally in your browser — your files never leave your machine.

## ✨ Features

- 📥 Side-by-side upload of the original (A) and revised (B) documents for direct comparison.
- 🔍 Three diff granularities — semantic, word, and character — covering quick review through fine-grained proofreading.
- 📊 A similarity score derived from the edit distance of the normalized text, for a quick read on the overall change magnitude.
- 🧭 Difference navigation to jump between the previous and next change.
- 🔗 Synchronized scrolling across both panes to keep context aligned in long documents.
- 🧹 Ignore whitespace, normalize full-/half-width characters, and filter layout noise such as page headers, footers, page numbers, and repeated layout text.
- 🧩 Preserves the original document structure and maps normalized diffs back to their original DOM text positions.
- 🌐 Bilingual interface (English / 中文) that auto-detects your browser language and remembers your choice.

## 🧹 Text Normalization

### Ignore whitespace

Reduces noise from layout, conversion, or structural changes. Cases currently handled include:

- Extra line breaks or whitespace from merged paragraphs or list items.
- Layout spacing after clause or list numbering, e.g. `1.3.1. Access`.
- Whitespace in mixed CJK / Latin / numeric text, e.g. `2025 年`, `A 座`, `8 号`.
- Whitespace inside numbers, e.g. phone numbers, dates, or IDs like `010 59618935`.
- Local whitespace inside emails, domains, and URLs, e.g. `review. team@example. com`.
- Field-punctuation whitespace in CJK context, e.g. `邮箱： name@example.com` and `邮箱:name@example.com`.

Ordinary spaces between English words are **not** ignored by default (e.g. `Example Corp`), so that real differences in English prose are not mistaken for formatting differences.

### Normalize full-/half-width

Treats full-width ASCII and half-width ASCII as equivalent, including full-width letters, digits, and common symbols.

### Layout Noise Filtering

DocDiff Pro can filter layout text before diffing when `Layout filter` is enabled.

- Native DOCX headers and footers are read once during parsing, used as layout hints, and removed from the displayed document body.
- Converted page text in the document body can be filtered when it matches page header/footer hints.
- Page numbers such as `Page 1 of 5`, `第 1/5 页`, or `- 1 -` can be removed from the comparison input.
- Repeated short layout text such as confidentiality notices, copyright notices, document IDs, phone numbers, or email footer lines can be filtered.
- Body text is protected from broad fragment matching: extracted footer fragments such as phone numbers or email addresses are only used against page-marked candidates.
- The `Layout noise` count in the result bar can be clicked to review the filtered items.

## ⚙️ Usage Tips

- 📝 General version comparison: enable `Ignore spaces` / `Normalize width` as needed.
- 🎯 Strict character-by-character proofreading: choose the character granularity and turn off any normalization toggles you don't need.
- 🔎 Comparing converted documents: enable `Ignore spaces` and `Layout filter` to reduce whitespace, page header/footer, and page-number noise introduced by conversion.

## 🛠️ Development

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

## 🔧 How It Works

- 📦 `.docx` parsing is handled by mammoth, and the resulting HTML is sanitized with DOMPurify.
- 🧾 DOCX headers and footers are parsed once with the document, converted into layout hints, and excluded from the final displayed body.
- 🧮 Text diffing is handled by diff-match-patch, run in a web worker with a synchronous fallback.
- 📈 Similarity is computed from the edit distance of the current normalized text: `1 - editDistance / max(originalLength, revisedLength)`.
- 🧱 Text mapping, whitespace collapsing, and normalization rules are centralized in `src/utils/documentText.ts`.
- 🧹 Layout noise detection is centralized in `src/utils/layoutNoise.ts`.
- 🎯 Diff markers are mapped back to the DOM through the original text nodes, so normalization logic never leaks into the rendering layer.
- 🌐 Interface strings live in a typed message catalog under `src/i18n/`.
- 📐 Only `.docx` files are supported, up to 25 MB per file.
