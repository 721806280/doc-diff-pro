/**
 * Finds the parts of a .docx that the converter drops without a trace.
 *
 * This exists because of one line in mammoth. `readDrawingElement` collects the
 * `pic:pic` descendants of a drawing and returns `combineResults` over them — so
 * a `<w:drawing>` holding a chart, a SmartArt graphic, a shape or a text box has
 * no blips, yields an empty result, and produces **no warning at all**. Word's
 * own figures therefore leave nothing behind: no element, no message, no count.
 * A comparison that silently ignores part of a document is worse than one that
 * says it could not read it, and the reader has no other way to find out.
 *
 * Formulas are counted here too. They are lost the same way — `m:oMath` has no
 * handler, so an edited equation produces no difference and, unlike an image, not
 * even an empty element where it used to be. The scan was already open.
 *
 * The package is read directly rather than through mammoth, which does not expose
 * the parts it unzipped. Only the body parts are read, and only their element
 * names are counted, so this stays a scan over a few hundred kilobytes of XML.
 */

import type { DocxGraphicsReport } from '@/types/document';

/** Body parts worth scanning; headers and footers are converted too. */
const BODY_PART_PATTERN = /^word\/(document|header\d*|footer\d*)\.xml$/;

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_DIRECTORY_ENTRY = 0x02014b50;
const LOCAL_FILE_HEADER = 0x04034b50;
/** The end record is last, behind at most a 64 KiB comment. */
const MAX_END_RECORD_SEARCH = 0xffff + 22;
const STORED = 0;
const DEFLATED = 8;
/** A size field of all ones defers to a Zip64 record this reader does not parse. */
const ZIP64_SENTINEL = 0xffffffff;

export function createEmptyGraphicsReport(): DocxGraphicsReport {
  return { nativeGraphics: 0, embeddedObjects: 0, formulas: 0 };
}

export function graphicsReportTotal(report: DocxGraphicsReport): number {
  return report.nativeGraphics + report.embeddedObjects + report.formulas;
}

/**
 * Counts the unconvertible figures in a package, or reports none if it cannot be
 * read.
 *
 * Failing soft is deliberate: this runs beside a conversion that has already
 * succeeded, and a package this reader cannot walk — Zip64, or something novel —
 * is not a reason to fail the comparison the reader is waiting for.
 */
export async function scanDocxGraphics(archive: ArrayBuffer): Promise<DocxGraphicsReport> {
  const report = createEmptyGraphicsReport();

  try {
    for (const entry of listEntries(archive)) {
      if (!BODY_PART_PATTERN.test(entry.name)) continue;

      const xml = await readEntry(archive, entry);
      if (xml) countGraphics(xml, report);
    }
  } catch {
    return createEmptyGraphicsReport();
  }

  return report;
}

function countGraphics(xml: string, report: DocxGraphicsReport): void {
  // Drawings do not nest, so a non-greedy span is the whole of one.
  for (const drawing of xml.matchAll(/<w:drawing[\s>][\s\S]*?<\/w:drawing>/g)) {
    // A drawing carrying a picture became an `<img>` and is compared already;
    // one without is a figure Word rendered itself.
    if (!drawing[0].includes('<pic:pic')) report.nativeGraphics++;
  }

  report.embeddedObjects += countEmbeddedObjects(xml);
  // `m:oMath` only. A display formula is an `m:oMath` inside an `m:oMathPara`
  // wrapper and an inline one is not, so counting the wrapper as well would
  // report every displayed equation twice.
  report.formulas += countTag(xml, 'm:oMath');
}

/**
 * One count per figure, not per element.
 *
 * An OLE object stores its own preview, so the usual shape is a `w:object`
 * wrapping a `v:imagedata` that points at an EMF — one figure, two elements.
 * Counting both reported a document's three embedded equations as six. Only a
 * `v:imagedata` standing outside any object is a figure in its own right.
 */
function countEmbeddedObjects(xml: string): number {
  let nestedImages = 0;
  for (const object of xml.matchAll(/<w:object[\s>][\s\S]*?<\/w:object>/g)) {
    nestedImages += countTag(object[0], 'v:imagedata');
  }

  const objects = countTag(xml, 'w:object');
  return objects + Math.max(0, countTag(xml, 'v:imagedata') - nestedImages);
}

/** Occurrences of one element, counting both `<tag>` and `<tag/>` forms. */
function countTag(xml: string, tag: string): number {
  return xml.split(new RegExp(`<${tag}[\\s/>]`)).length - 1;
}

type ZipEntry = {
  name: string;
  compressionMethod: number;
  compressedSize: number;
  localHeaderOffset: number;
};

/**
 * The central directory, which is the only place a zip's contents are listed
 * authoritatively — local headers may understate sizes when written by a streaming
 * writer.
 */
function listEntries(archive: ArrayBuffer): ZipEntry[] {
  const view = new DataView(archive);
  const endOffset = findEndRecord(view);
  if (endOffset < 0) return [];

  const entryCount = view.getUint16(endOffset + 10, true);
  let offset = view.getUint32(endOffset + 16, true);
  const entries: ZipEntry[] = [];

  for (let index = 0; index < entryCount; index++) {
    if (offset + 46 > view.byteLength) break;
    if (view.getUint32(offset, true) !== CENTRAL_DIRECTORY_ENTRY) break;

    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);

    if (compressedSize !== ZIP64_SENTINEL && localHeaderOffset !== ZIP64_SENTINEL) {
      entries.push({
        name: decodeAscii(archive, offset + 46, nameLength),
        compressionMethod: view.getUint16(offset + 10, true),
        compressedSize,
        localHeaderOffset
      });
    }

    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

function findEndRecord(view: DataView): number {
  const earliest = Math.max(0, view.byteLength - MAX_END_RECORD_SEARCH);
  for (let offset = view.byteLength - 22; offset >= earliest; offset--) {
    if (view.getUint32(offset, true) === END_OF_CENTRAL_DIRECTORY) return offset;
  }

  return -1;
}

async function readEntry(archive: ArrayBuffer, entry: ZipEntry): Promise<string | null> {
  const view = new DataView(archive);
  const header = entry.localHeaderOffset;
  if (header + 30 > view.byteLength || view.getUint32(header, true) !== LOCAL_FILE_HEADER) return null;

  const start = header + 30 + view.getUint16(header + 26, true) + view.getUint16(header + 28, true);
  const bytes = new Uint8Array(archive, start, Math.min(entry.compressedSize, view.byteLength - start));

  if (entry.compressionMethod === STORED) return new TextDecoder().decode(bytes);
  if (entry.compressionMethod !== DEFLATED) return null;

  return inflateRaw(bytes);
}

/**
 * Inflates a raw deflate stream with the platform's own decompressor.
 *
 * Fed and drained by hand rather than through `Blob.stream()` and `Response`:
 * jsdom implements neither over a stream, so routing through them would leave
 * this path testable only in a browser. Writing is kicked off without being
 * awaited first, because a writer does not settle until a reader drains it.
 */
async function inflateRaw(bytes: Uint8Array<ArrayBuffer>): Promise<string | null> {
  if (typeof DecompressionStream !== 'function') return null;

  const stream = new DecompressionStream('deflate-raw');
  const writer = stream.writable.getWriter();
  const pump = (async () => {
    await writer.write(bytes);
    await writer.close();
  })();

  const reader = stream.readable.getReader();
  const decoder = new TextDecoder();
  let text = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) text += decoder.decode(value, { stream: true });
  }

  await pump;
  return text + decoder.decode();
}

function decodeAscii(archive: ArrayBuffer, offset: number, length: number): string {
  return new TextDecoder().decode(new Uint8Array(archive, offset, length));
}
