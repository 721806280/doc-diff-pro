import { describe, expect, it } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import { createEmptyGraphicsReport, graphicsReportTotal, scanDocxParts } from './docxGraphics';

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

describe('scanDocxParts', () => {
  it('counts a drawing Word rendered itself, which the converter drops in silence', async () => {
    // The case that motivates the whole module: mammoth collects the `pic:pic`
    // descendants of a drawing, so a chart yields neither an element nor a
    // warning, and would otherwise be invisible.
    const report = (await scanDocxParts(zip(documentWith(CHART_DRAWING)))).graphics;

    expect(report.nativeGraphics).toBe(1);
    expect(graphicsReportTotal(report)).toBe(1);
  });

  it('leaves ordinary pictures alone, since those are already compared', async () => {
    const report = (await scanDocxParts(zip(documentWith(PICTURE_DRAWING)))).graphics;

    expect(report).toEqual(createEmptyGraphicsReport());
  });

  it('separates pictures from native graphics in one document', async () => {
    const report = (await scanDocxParts(zip(documentWith(PICTURE_DRAWING + CHART_DRAWING + PICTURE_DRAWING)))).graphics;

    expect(report.nativeGraphics).toBe(1);
  });

  it('counts an embedded object once, not once per element', async () => {
    // An OLE object stores its own preview, so a single embedded equation is a
    // `w:object` wrapping a `v:imagedata` that points at an EMF. Counting both
    // reported a real document's three equations as six.
    const report = (
      await scanDocxParts(zip(documentWith('<w:object><v:shape><v:imagedata r:id="rId4"/></v:shape></w:object>')))
    ).graphics;

    expect(report.embeddedObjects).toBe(1);
  });

  it('reads each embedded object ProgID and preview title', async () => {
    // The ProgID and the preview's `o:title` both sit on the `w:object` markup,
    // so the kind can be named without walking the package's relationship parts.
    const report = (
      await scanDocxParts(
        zip(
          documentWith(
            '<w:object><v:shape><v:imagedata r:id="rId4" o:title="Sheet1"/></v:shape>' +
              '<o:OLEObject Type="Embed" ProgID="Excel.Sheet.12" r:id="rId8"/></w:object>' +
              '<w:object><v:shape><v:imagedata r:id="rId5"/></v:shape>' +
              '<o:OLEObject Type="Embed" ProgID="Equation.3" r:id="rId9"/></w:object>'
          )
        )
      )
    ).graphics;

    expect(report.embeddedObjects).toBe(2);
    expect(report.embeddedObjectKinds).toEqual([
      { progId: 'Excel.Sheet.12', title: 'Sheet1' },
      { progId: 'Equation.3', title: '' }
    ]);
  });

  it('lists a bare VML image outside any object as a picture, not an OLE kind', async () => {
    const report = (
      await scanDocxParts(
        zip(
          documentWith(
            '<w:object><v:shape><v:imagedata r:id="rId4"/></v:shape></w:object>' +
              '<w:p><v:shape><v:imagedata r:id="rId5"/></v:shape></w:p>'
          )
        )
      )
    ).graphics;

    expect(report.embeddedObjects).toBe(2);
    expect(report.embeddedObjectKinds).toEqual([
      { progId: '', title: '' },
      { progId: 'vml-image', title: '' }
    ]);
  });

  it('counts a VML image standing outside any object as its own figure', async () => {
    const report = (
      await scanDocxParts(
        zip(
          documentWith(
            '<w:object><v:shape><v:imagedata r:id="rId4"/></v:shape></w:object>' +
              '<w:p><v:shape><v:imagedata r:id="rId5"/></v:shape></w:p>'
          )
        )
      )
    ).graphics;

    expect(report.embeddedObjects).toBe(2);
  });

  it('counts formulas, which vanish without even an empty element', async () => {
    // A displayed formula is an `m:oMath` inside an `m:oMathPara`, and an inline
    // one is not, so both shapes have to count as exactly one formula.
    const report = (
      await scanDocxParts(
        zip(
          documentWith(
            '<m:oMathPara><m:oMath><m:r><m:t>x</m:t></m:r></m:oMath></m:oMathPara>' +
              '<w:p><m:oMath><m:r><m:t>y</m:t></m:r></m:oMath></w:p>'
          )
        )
      )
    ).graphics;

    expect(report.formulas).toBe(2);
  });

  it('scans headers and footers, which are converted alongside the body', async () => {
    const report = (
      await scanDocxParts(
        zip({
          'word/document.xml': '<w:document><w:body/></w:document>',
          'word/header1.xml': `<w:hdr>${CHART_DRAWING}</w:hdr>`,
          'word/footer2.xml': `<w:ftr>${CHART_DRAWING}</w:ftr>`
        })
      )
    ).graphics;

    expect(report.nativeGraphics).toBe(2);
  });

  it('ignores parts that are not body content', async () => {
    const report = (
      await scanDocxParts(zip({ 'word/document.xml': '<w:document/>', 'word/styles.xml': CHART_DRAWING }))
    ).graphics;

    expect(report.nativeGraphics).toBe(0);
  });

  it('reads deflated parts as well as stored ones', async () => {
    const report = (await scanDocxParts(zip(documentWith(CHART_DRAWING + CHART_DRAWING), { deflate: true }))).graphics;

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

    expect((await scanDocxParts(archive)).graphics).toEqual(createEmptyGraphicsReport());
  });

  it('leaves out a figure that a tracked deletion took away', async () => {
    // The converter renders the accepted state, so a figure inside a `w:del` is
    // not in the text that was compared. Counting it reported a figure the reader
    // cannot find: three embedded equations in a real document, one of them
    // already deleted, came out as three rather than two.
    //
    // `w:moveFrom` is the same situation: the figure is at the destination, and
    // the source it left behind is not in the accepted document.
    const report = (
      await scanDocxParts(
        zip(
          documentWith(
            '<w:p><w:r><w:object><v:shape><v:imagedata r:id="rId4"/></v:shape></w:object></w:r></w:p>' +
              '<w:p><w:del w:id="1" w:author="a"><w:r>' +
              '<w:object><v:shape><v:imagedata r:id="rId5"/></v:shape></w:object>' +
              '</w:r></w:del></w:p>' +
              '<w:p><w:moveFrom w:id="2" w:author="a">' +
              `<w:r>${CHART_DRAWING}</w:r>` +
              '</w:moveFrom></w:p>'
          )
        )
      )
    ).graphics;

    expect(report.embeddedObjects).toBe(1);
    expect(report.nativeGraphics).toBe(0);
  });

  it('keeps a figure whose run merely carries a deletion mark', async () => {
    // `w:del` also appears self-closing in run properties. Treating that as the
    // opening of a deleted span would swallow content that is still there.
    const report = (
      await scanDocxParts(
        zip(
          documentWith(
            '<w:p><w:r><w:rPr><w:del w:id="2"/></w:rPr>' +
              '<w:object><v:shape><v:imagedata r:id="rId4"/></v:shape></w:object></w:r></w:p>'
          )
        )
      )
    ).graphics;

    expect(report.embeddedObjects).toBe(1);
  });

  it('counts the tracked changes a document still carries', async () => {
    // The comparison shows the accepted state. Saying so needs the numbers, and
    // they are marks rather than edits: one reworded sentence carries several.
    const { revisions } = await scanDocxParts(
      zip(
        documentWith(
          '<w:p><w:ins w:id="1"><w:r><w:t>新</w:t></w:r></w:ins>' +
            '<w:ins w:id="2"><w:r><w:t>增</w:t></w:r></w:ins>' +
            '<w:del w:id="3"><w:r><w:delText>旧</w:delText></w:r></w:del></w:p>'
        )
      )
    );

    expect(revisions).toEqual({ insertions: 2, deletions: 1 });
  });

  it('reports no revisions for a document that carries none', async () => {
    const { revisions } = await scanDocxParts(zip(documentWith('<w:p><w:r><w:t>正文</w:t></w:r></w:p>')));

    expect(revisions).toEqual({ insertions: 0, deletions: 0 });
  });

  it('reports nothing rather than failing on a package it cannot walk', async () => {
    // Runs beside a conversion that already succeeded, so an unreadable package
    // must not take down the comparison the reader is waiting for.
    expect((await scanDocxParts(new ArrayBuffer(0))).graphics).toEqual(createEmptyGraphicsReport());
    expect((await scanDocxParts(new Uint8Array([1, 2, 3, 4, 5]).buffer)).graphics).toEqual(createEmptyGraphicsReport());
  });

  it('skips an entry whose local header does not check out', async () => {
    // Only the scanned part, so the corrupted header is certainly the one the
    // central directory pointed the reader at.
    const archive = zip({ 'word/document.xml': `<w:document>${CHART_DRAWING}</w:document>` });
    new DataView(archive).setUint32(0, 0x00000000, true);

    expect((await scanDocxParts(archive)).graphics).toEqual(createEmptyGraphicsReport());
  });
});
