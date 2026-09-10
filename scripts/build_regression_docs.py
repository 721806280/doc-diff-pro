"""Deterministic OOXML fixtures, generated with Python's standard library.

These exercise known package structures; they are not Office-exported samples.
Run from any directory with: python3 scripts/build_regression_docs.py
"""

from pathlib import Path
from struct import pack
from xml.sax.saxutils import escape
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo
import zlib

ROOT = Path(__file__).resolve().parents[1]
W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
A = "http://schemas.openxmlformats.org/drawingml/2006/main"
C = "http://schemas.openxmlformats.org/drawingml/2006/chart"
WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
PIC = "http://schemas.openxmlformats.org/drawingml/2006/picture"


def paragraph(text):
    return f'<w:p><w:r><w:t xml:space="preserve">{escape(text)}</w:t></w:r></w:p>'


def picture(index, relationship):
    return f'''<w:p><w:r><w:drawing><wp:inline>
      <wp:extent cx="2438400" cy="2438400"/><wp:docPr id="{index}" name="Payment chart {index}"/>
      <a:graphic><a:graphicData uri="{PIC}"><pic:pic>
        <pic:nvPicPr><pic:cNvPr id="{index}" name="Payment chart {index}"/><pic:cNvPicPr/></pic:nvPicPr>
        <pic:blipFill><a:blip r:embed="{relationship}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
        <pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="2438400" cy="2438400"/></a:xfrm>
          <a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>
      </pic:pic></a:graphicData></a:graphic>
    </wp:inline></w:drawing></w:r></w:p>'''


def png_chart(heights=(0.3, 0.55, 0.4, 0.7, 0.5), compression=6):
    size = 256
    pixels = bytearray()
    for y in range(size):
        pixels.append(0)  # No PNG row filter.
        for x in range(size):
            ink = size - 16 <= y < size - 8 or any(
                16 + i * 48 <= x < 48 + i * 48 and size - 16 - round(h * size) <= y < size - 16
                for i, h in enumerate(heights)
            )
            pixels.extend((31, 41, 55) if ink else (255, 255, 255))

    def chunk(kind, data):
        return pack('!I', len(data)) + kind + data + pack('!I', zlib.crc32(kind + data))

    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', pack('!2I5B', size, size, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(bytes(pixels), compression)) + chunk(b'IEND', b''))


def write_docx(path, body, images=None, chart=None):
    images = images or {}
    relationships = [f'<Relationship Id="{key}" Type="{R}/image" Target="media/{key}.png"/>' for key in images]
    content_types = [f'<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>']
    parts = {f'word/media/{key}.png': value for key, value in images.items()}
    if chart:
        relationships.append(f'<Relationship Id="chart" Type="{R}/chart" Target="charts/chart1.xml"/>')
        content_types.append('<Override PartName="/word/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>')
        parts['word/charts/chart1.xml'] = chart
    parts.update({
        '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>'
            + ''.join(content_types) + '</Types>',
        '_rels/.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            f'<Relationship Id="document" Type="{R}/officeDocument" Target="word/document.xml"/></Relationships>',
        'word/_rels/document.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            + ''.join(relationships) + '</Relationships>',
        'word/document.xml': f'<w:document xmlns:w="{W}" xmlns:r="{R}" xmlns:a="{A}" xmlns:wp="{WP}" xmlns:pic="{PIC}" xmlns:c="{C}">'
            f'<w:body>{body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>'
    })
    path.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(path, 'w') as archive:
        for name, value in sorted(parts.items()):
            entry = ZipInfo(name, date_time=(2026, 9, 10, 0, 0, 0))
            entry.compress_type = ZIP_DEFLATED
            entry.create_system = 3
            entry.external_attr = 0o644 << 16
            archive.writestr(entry, value)


def merged_table(amount):
    def cell(text, properties=''):
        return f'<w:tc><w:tcPr>{properties}</w:tcPr>{paragraph(text)}</w:tc>'

    return ('<w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="2200"/>'
            '<w:gridCol w:w="2200"/><w:gridCol w:w="2200"/></w:tblGrid><w:tr>'
            + cell('预算汇总', '<w:gridSpan w:val="2"/>') + cell('执行说明') + '</w:tr><w:tr>'
            + cell('服务费', '<w:vMerge w:val="restart"/>') + cell(amount) + cell('分期付款') + '</w:tr><w:tr>'
            + cell('', '<w:vMerge/>') + cell('20000.00') + cell('验收付款') + '</w:tr></w:tbl>')


def build_regressions():
    target = ROOT / 'e2e/fixtures'
    for revised in (False, True):
        suffix = 'revised' if revised else 'original'
        clauses = [
            '服务合同关键条款',
            '付款金额：120000.00元。' if revised else '付款金额：100000.00元。',
            '交付日期：2026年10月10日。' if revised else '交付日期：2026年9月10日。',
            '每日违约金比例：0.08%。' if revised else '每日违约金比例：0.05%。',
            '乙方可以转包服务。' if revised else '乙方不得转包服务。',
            '双方应妥善保存履约记录。',
            '通知送达期限：7日。' if revised else '通知送达期限：3日。',
            '双方应妥善保存履约记录。'
        ]
        write_docx(target / f'clauses-{suffix}.docx', ''.join(map(paragraph, clauses)))

        images = {
            'first': png_chart(),
            'second': png_chart(compression=1 if revised else 6),
            'third': png_chart((0.3, 0.55, 0.4, 0.25, 0.5)) if revised else png_chart()
        }
        body = paragraph('预算与付款计划') + merged_table('120000.00' if revised else '100000.00')
        for index, key in enumerate(images, start=1):
            body += paragraph(f'付款计划附图 {index}') + picture(index, key)
        write_docx(target / f'structure-images-{suffix}.docx', body, images)

        tracked = ('<w:p><w:del w:id="1" w:author="Fixture" w:date="2026-09-10T00:00:00Z">'
                   '<w:r><w:delText>交付期限为30日。</w:delText></w:r></w:del>'
                   '<w:ins w:id="2" w:author="Fixture" w:date="2026-09-10T00:00:00Z">'
                   '<w:r><w:t>交付期限为15日。</w:t></w:r></w:ins></w:p>')
        write_docx(target / f'tracked-{suffix}.docx', tracked if revised else paragraph('交付期限为15日。'))

        chart_body = (paragraph('附图：年度付款预算。') + '<w:p><w:r><w:drawing><wp:inline>'
                      '<wp:extent cx="2438400" cy="2438400"/><wp:docPr id="1" name="Native chart"/>'
                      f'<a:graphic><a:graphicData uri="{C}"><c:chart r:id="chart"/></a:graphicData>'
                      '</a:graphic></wp:inline></w:drawing></w:r></w:p>')
        chart = (f'<c:chartSpace xmlns:c="{C}"><c:chart><c:plotArea><c:barChart><c:barDir val="col"/>'
                 '<c:ser><c:idx val="0"/><c:order val="0"/><c:val><c:numLit><c:formatCode>General</c:formatCode>'
                 '<c:ptCount val="1"/><c:pt idx="0"><c:v>' + ('120000' if revised else '100000')
                 + '</c:v></c:pt></c:numLit></c:val></c:ser></c:barChart></c:plotArea></c:chart></c:chartSpace>')
        write_docx(target / f'native-chart-{suffix}.docx', chart_body, chart=chart)


if __name__ == '__main__':
    build_regressions()
