"""Draws the figures the sample documents carry, and embeds them.

The samples are what a reader sees before they have a document of their own, and
until now they were text and tables only — so the whole of image comparison was
invisible in a preview. These four figures cover every outcome the image pass can
report: one figure revised, one left untouched, one added, one removed.

Run from the repository root: python3 scripts/build_sample_images.py
Raw pixels and raw OOXML on purpose; a sample fixture is not worth a toolchain.
"""

import shutil
import struct
import zipfile
import zlib
from pathlib import Path

SAMPLES = Path('public/samples')
# One CSS pixel at 96 DPI, in the English Metric Units OOXML measures in.
EMU_PER_PIXEL = 9525

INK = (31, 41, 55)
AXIS = (148, 163, 184)
WHITE = (255, 255, 255)


class Canvas:
    def __init__(self, width, height, background=WHITE):
        self.width = width
        self.height = height
        self.pixels = bytearray(background * (width * height))

    def fill(self, x, y, width, height, color):
        for row in range(max(0, y), min(self.height, y + height)):
            start = (row * self.width + max(0, x)) * 3
            span = min(self.width, x + width) - max(0, x)
            if span > 0:
                self.pixels[start:start + span * 3] = bytes(color) * span

    def ring(self, cx, cy, radius, thickness, color):
        outer, inner = radius ** 2, max(0, radius - thickness) ** 2
        for y in range(max(0, cy - radius), min(self.height, cy + radius + 1)):
            for x in range(max(0, cx - radius), min(self.width, cx + radius + 1)):
                distance = (x - cx) ** 2 + (y - cy) ** 2
                if inner <= distance <= outer:
                    offset = (y * self.width + x) * 3
                    self.pixels[offset:offset + 3] = bytes(color)

    def to_png(self):
        raw = b''.join(
            b'\x00' + bytes(self.pixels[row * self.width * 3:(row + 1) * self.width * 3])
            for row in range(self.height)
        )

        def chunk(tag, payload):
            body = tag + payload
            return struct.pack('>I', len(payload)) + body + struct.pack('>I', zlib.crc32(body))

        header = struct.pack('>IIBBBBB', self.width, self.height, 8, 2, 0, 0, 0)
        return (
            b'\x89PNG\r\n\x1a\n'
            + chunk(b'IHDR', header)
            + chunk(b'IDAT', zlib.compress(raw, 9))
            + chunk(b'IEND', b'')
        )


def bar_chart(values, palette):
    """A column chart: the figure whose ink profile is its data."""
    canvas = Canvas(480, 300)
    canvas.fill(0, 0, 480, 6, (99, 102, 241))
    canvas.fill(56, 262, 392, 3, AXIS)
    canvas.fill(56, 40, 3, 225, AXIS)
    for index, value in enumerate(values):
        height = round(value * 200)
        canvas.fill(84 + index * 72, 262 - height, 44, height, palette[index % len(palette)])
    return canvas


def brand_mark():
    """A logo, the figure a document repeats and never edits."""
    canvas = Canvas(200, 200, (79, 70, 229))
    canvas.ring(100, 100, 62, 14, WHITE)
    canvas.fill(92, 58, 16, 60, WHITE)
    canvas.fill(60, 132, 80, 16, WHITE)
    return canvas


def flow_diagram():
    """Three linked boxes: only in the baseline, so reported as removed."""
    canvas = Canvas(480, 200)
    for index in range(3):
        left = 24 + index * 152
        canvas.fill(left, 60, 120, 80, (226, 232, 240))
        canvas.fill(left, 60, 120, 5, INK)
        if index < 2:
            canvas.fill(left + 120, 98, 32, 5, AXIS)
    return canvas


def donut_chart():
    """A ring: only in the revision, so reported as added."""
    canvas = Canvas(300, 300)
    canvas.ring(150, 150, 120, 44, (16, 185, 129))
    canvas.ring(150, 150, 74, 26, (245, 158, 11))
    return canvas


def drawing_xml(relationship_id, name, width, height):
    return (
        '<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="120" w:after="200"/></w:pPr><w:r><w:drawing>'
        '<wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"'
        ' distT="0" distB="0" distL="0" distR="0">'
        f'<wp:extent cx="{width * EMU_PER_PIXEL}" cy="{height * EMU_PER_PIXEL}"/>'
        f'<wp:docPr id="{900 + int(relationship_id[3:])}" name="{name}"/>'
        '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'
        '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
        '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">'
        f'<pic:nvPicPr><pic:cNvPr id="0" name="{name}"/><pic:cNvPicPr/></pic:nvPicPr>'
        f'<pic:blipFill><a:blip r:embed="{relationship_id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
        '<pic:spPr><a:xfrm><a:off x="0" y="0"/>'
        f'<a:ext cx="{width * EMU_PER_PIXEL}" cy="{height * EMU_PER_PIXEL}"/></a:xfrm>'
        '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>'
        '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>'
    )


def caption_xml(text):
    return (
        '<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="60"/>'
        '<w:rPr><w:color w:val="657187"/><w:sz w:val="18"/></w:rPr></w:pPr>'
        f'<w:r><w:rPr><w:color w:val="657187"/><w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">{text}</w:t></w:r></w:p>'
    )


def heading_xml(text):
    return (
        '<w:p><w:pPr><w:pStyle w:val="Heading1"/><w:spacing w:before="360" w:after="160"/></w:pPr>'
        f'<w:r><w:t xml:space="preserve">{text}</w:t></w:r></w:p>'
    )


def text_box_xml():
    """A DrawingML text box: valid, self-contained, and dropped by the converter.

    `readDrawingElement` looks only for `pic:pic` descendants, so nothing inside a
    shape is reached — not even its text. Carried by the samples so the notice that
    says part of a document could not be compared has something real to report.
    """
    return (
        '<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing>'
        '<wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"'
        ' distT="0" distB="0" distL="0" distR="0">'
        '<wp:extent cx="3657600" cy="571500"/><wp:docPr id="960" name="TextBox 1"/>'
        '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'
        '<a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">'
        '<wps:wsp xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">'
        '<wps:cNvSpPr txBox="1"/>'
        '<wps:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="3657600" cy="571500"/></a:xfrm>'
        '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></wps:spPr>'
        '<wps:txbx><w:txbxContent><w:p><w:r><w:t xml:space="preserve">'
        '提示：本文本框由 Word 自行绘制</w:t></w:r></w:p></w:txbxContent></wps:txbx>'
        '<wps:bodyPr/></wps:wsp></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>'
    )


def formula_xml():
    """A formula, which the converter drops without leaving a placeholder."""
    return (
        '<w:p><w:pPr><w:jc w:val="center"/></w:pPr>'
        '<m:oMathPara xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><m:oMath>'
        '<m:r><m:t xml:space="preserve">S = a × b ÷ 2</m:t></m:r>'
        '</m:oMath></m:oMathPara></w:p>'
    )


def embed(source, target, figures):
    """Adds media parts, relationships and a figure section to one document."""
    if Path(source) != Path(target):
        shutil.copyfile(source, target)
    with zipfile.ZipFile(target) as archive:
        parts = {item.filename: archive.read(item.filename) for item in archive.infolist()}

    # Appending a second time would duplicate both the section and the
    # relationship ids, leaving a package Word would refuse. The samples are
    # committed already built, so a re-run is a mistake worth naming rather than
    # something to silently absorb.
    if any(name.startswith('word/media/figure-') for name in parts):
        raise SystemExit(
            f'{target} already carries figures. Restore it from git before rebuilding:\n'
            f'  git checkout -- {target}'
        )

    content_types = parts['[Content_Types].xml'].decode()
    if 'Extension="png"' not in content_types:
        content_types = content_types.replace(
            '<Default Extension="xml"',
            '<Default Extension="png" ContentType="image/png"/><Default Extension="xml"',
            1,
        )
    parts['[Content_Types].xml'] = content_types.encode()

    relationships = parts['word/_rels/document.xml.rels'].decode()
    body = [heading_xml('附件一 图示')]
    added = []

    for index, (file_name, canvas, caption) in enumerate(figures):
        relationship_id = f'rId{700 + index}'
        parts[f'word/media/{file_name}'] = canvas.to_png()
        added.append(
            f'<Relationship Id="{relationship_id}"'
            ' Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"'
            f' Target="media/{file_name}"/>'
        )
        body.append(caption_xml(caption))
        body.append(drawing_xml(relationship_id, file_name, canvas.width, canvas.height))

    # Identical on both sides, so they add no difference of their own. They are
    # here to exercise the notice that says part of a document was not compared:
    # both are valid OOXML and both are dropped by the converter without a trace.
    body.append(caption_xml('图 4 说明（Word 自绘文本框，不参与对比）'))
    body.append(text_box_xml())
    body.append(caption_xml('式 1 面积（公式，不参与对比）'))
    body.append(formula_xml())

    parts['word/_rels/document.xml.rels'] = relationships.replace(
        '</Relationships>', ''.join(added) + '</Relationships>', 1
    ).encode()

    document = parts['word/document.xml'].decode()
    marker = '<w:sectPr' if '<w:sectPr' in document else '</w:body>'
    parts['word/document.xml'] = document.replace(marker, ''.join(body) + marker, 1).encode()

    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as archive:
        # [Content_Types].xml first, as every reader expects of an OPC package.
        for name in ['[Content_Types].xml'] + [key for key in parts if key != '[Content_Types].xml']:
            if not name.endswith('/'):
                archive.writestr(name, parts[name])


COOL = [(99, 102, 241), (59, 130, 246), (14, 165, 233), (56, 189, 248), (125, 211, 252)]

embed(
    SAMPLES / 'baseline.docx',
    SAMPLES / 'baseline.docx',
    [
        ('figure-quarterly.png', bar_chart([0.42, 0.68, 0.55, 0.86, 0.61], COOL), '图 1 分季度交付量'),
        ('figure-mark.png', brand_mark(), '图 2 服务标识'),
        ('figure-flow.png', flow_diagram(), '图 3 验收流程'),
    ],
)

embed(
    SAMPLES / 'revised.docx',
    SAMPLES / 'revised.docx',
    [
        # One column dropped: the same figure with its data revised, which is the
        # case a byte hash alone could only call "replaced".
        ('figure-quarterly.png', bar_chart([0.42, 0.68, 0.55, 0.34, 0.61], COOL), '图 1 分季度交付量'),
        # Byte for byte the baseline's, so the comparison must report nothing.
        ('figure-mark.png', brand_mark(), '图 2 服务标识'),
        ('figure-share.png', donut_chart(), '图 3 费用构成'),
    ],
)

for name in ('baseline.docx', 'revised.docx'):
    print(f'{name}: {(SAMPLES / name).stat().st_size} bytes')
