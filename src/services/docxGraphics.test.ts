import { describe, expect, it } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import { createEmptyGraphicsReport, graphicsReportTotal, scanDocxGraphics } from './docxGraphics';

/**
 * Builds a zip by hand so the parser is exercised against bytes rather than a
 * library's idea of them, and so both the stored and deflated paths are covered.
 */
function zip(files: Record<string, string>, options: { deflate?: boolean } = {}): ArrayBuffer {
  const encoder = new TextEncoder();
  const local: number[] = [];
  const central: number[] = [];
  let offset = 0;

  const uint16 = (value: number) => [value & 0xff, (value >>> 8) & 0xff];
  const uint32 = (value: number) => [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];

  for (const [name, content] of Object.entries(files)) {
    const raw = encoder.encode(content);
    const stored = options.deflate ? new Uint8Array(deflateRawSync(raw)) : raw;
    const method = options.deflate ? 8 : 0;
    const nameBytes = Array.from(encoder.encode(name));

    const header = [
      ...uint32(0x04034b50),
      ...uint16(20),
      ...uint16(0),
      ...uint16(method),
      ...uint16(0),
      ...uint16(0),
      ...uint32(0),
      ...uint32(stored.length),
      ...uint32(raw.length),
      ...uint16(nameBytes.length),
      ...uint16(0),
      ...nameBytes,
      ...stored
    ];

    central.push(
      ...uint32(0x02014b50),
      ...uint16(20),
      ...uint16(20),
      ...uint16(0),
      ...uint16(method),
      ...uint16(0),
      ...uint16(0),
      ...uint32(0),
      ...uint32(stored.length),
      ...uint32(raw.length),
      ...uint16(nameBytes.length),
      ...uint16(0),
      ...uint16(0),
      ...uint16(0),
      ...uint16(0),
      ...uint32(0),
      ...uint32(offset),
      ...nameBytes
    );

    local.push(...header);
    offset += header.length;
  }

  const end = [
    ...uint32(0x06054b50),
    ...uint16(0),
    ...uint16(0),
    ...uint16(Object.keys(files).length),
    ...uint16(Object.keys(files).length),
    ...uint32(central.length),
    ...uint32(offset),
    ...uint16(0)
  ];

  return new Uint8Array([...local, ...central, ...end]).buffer;
}

const CHART_DRAWING =
  '<w:drawing><wp:inline><a:graphic><a:graphicData uri="...chart"><c:chart r:id="rId9"/>' +
  '</a:graphicData></a:graphic></wp:inline></w:drawing>';
const PICTURE_DRAWING =
  '<w:drawing><wp:inline><a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="rId8"/>' +
  '</pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>';

function documentWith(body: string): Record<string, string> {
  return {
    '[Content_Types].xml': '<Types/>',
    'word/document.xml': `<w:document><w:body>${body}</w:body></w:document>`
  };
}

describe('scanDocxGraphics', () => {
  it('counts a drawing Word rendered itself, which the converter drops in silence', async () => {
    // The case that motivates the whole module: mammoth collects the `pic:pic`
    // descendants of a drawing, so a chart yields neither an element nor a
    // warning, and would otherwise be invisible.
    const report = await scanDocxGraphics(zip(documentWith(CHART_DRAWING)));

    expect(report.nativeGraphics).toBe(1);
    expect(graphicsReportTotal(report)).toBe(1);
  });

  it('leaves ordinary pictures alone, since those are already compared', async () => {
    const report = await scanDocxGraphics(zip(documentWith(PICTURE_DRAWING)));

    expect(report).toEqual(createEmptyGraphicsReport());
  });

  it('separates pictures from native graphics in one document', async () => {
    const report = await scanDocxGraphics(zip(documentWith(PICTURE_DRAWING + CHART_DRAWING + PICTURE_DRAWING)));

    expect(report.nativeGraphics).toBe(1);
  });

  it('counts embedded objects and VML images, which arrive as EMF', async () => {
    const report = await scanDocxGraphics(
      zip(documentWith('<w:object><v:shape><v:imagedata r:id="rId4"/></v:shape></w:object>'))
    );

    expect(report.embeddedObjects).toBe(2);
  });

  it('counts formulas, which vanish without even an empty element', async () => {
    // A displayed formula is an `m:oMath` inside an `m:oMathPara`, and an inline
    // one is not, so both shapes have to count as exactly one formula.
    const report = await scanDocxGraphics(
      zip(
        documentWith(
          '<m:oMathPara><m:oMath><m:r><m:t>x</m:t></m:r></m:oMath></m:oMathPara>' +
            '<w:p><m:oMath><m:r><m:t>y</m:t></m:r></m:oMath></w:p>'
        )
      )
    );

    expect(report.formulas).toBe(2);
  });

  it('scans headers and footers, which are converted alongside the body', async () => {
    const report = await scanDocxGraphics(
      zip({
        'word/document.xml': '<w:document><w:body/></w:document>',
        'word/header1.xml': `<w:hdr>${CHART_DRAWING}</w:hdr>`,
        'word/footer2.xml': `<w:ftr>${CHART_DRAWING}</w:ftr>`
      })
    );

    expect(report.nativeGraphics).toBe(2);
  });

  it('ignores parts that are not body content', async () => {
    const report = await scanDocxGraphics(
      zip({ 'word/document.xml': '<w:document/>', 'word/styles.xml': CHART_DRAWING })
    );

    expect(report.nativeGraphics).toBe(0);
  });

  it('reads deflated parts as well as stored ones', async () => {
    const report = await scanDocxGraphics(zip(documentWith(CHART_DRAWING + CHART_DRAWING), { deflate: true }));

    expect(report.nativeGraphics).toBe(2);
  });

  it('skips a part stored with a compression method it does not implement', async () => {
    // Neither stored nor deflated. Legal in a zip, never produced by Word, and no
    // reason to fail a comparison over.
    const archive = zip({ 'word/document.xml': `<w:document>${CHART_DRAWING}</w:document>` });
    const view = new DataView(archive);
    // The method appears twice: once in the local header, once in the central
    // directory the reader trusts.
    view.setUint16(8, 14, true);
    view.setUint16(archive.byteLength - 22 - 46 + 10, 14, true);

    expect(await scanDocxGraphics(archive)).toEqual(createEmptyGraphicsReport());
  });

  it('reports nothing rather than failing on a package it cannot walk', async () => {
    // Runs beside a conversion that already succeeded, so an unreadable package
    // must not take down the comparison the reader is waiting for.
    expect(await scanDocxGraphics(new ArrayBuffer(0))).toEqual(createEmptyGraphicsReport());
    expect(await scanDocxGraphics(new Uint8Array([1, 2, 3, 4, 5]).buffer)).toEqual(createEmptyGraphicsReport());
  });

  it('skips an entry whose local header does not check out', async () => {
    // Only the scanned part, so the corrupted header is certainly the one the
    // central directory pointed the reader at.
    const archive = zip({ 'word/document.xml': `<w:document>${CHART_DRAWING}</w:document>` });
    new DataView(archive).setUint32(0, 0x00000000, true);

    expect(await scanDocxGraphics(archive)).toEqual(createEmptyGraphicsReport());
  });
});
