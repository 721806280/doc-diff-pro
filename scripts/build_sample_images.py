"""Rebuild the sample contract figures beside the clauses they illustrate.

Run: python3 scripts/build_sample_images.py
Optional: --preview-dir /tmp/doc-diff-figures saves the rendered PNGs for review.

Uses Python's standard library for OOXML and the project's installed Playwright
and Chrome for sharp, three-times-resolution Chinese diagrams. Re-running updates
only this script's figures, captions, formula and text box; contract text, tables,
headers and footers are preserved. Payment values come from the contract tables.
"""

import argparse
import base64
import io
import json
import posixpath
import re
import subprocess
import zipfile
from pathlib import Path
from xml.dom import Node, minidom
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parent.parent
SAMPLES = ROOT / 'public/samples'
EMU_PER_PIXEL = 9525
WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
PACKAGE_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships'
DRAWING_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main'


def related_part(rels_path, relation):
    source_directory = posixpath.dirname(posixpath.dirname(rels_path))
    return posixpath.normpath(
        posixpath.join(source_directory, relation.getAttribute('Target'))
    ).lstrip('/')


def word_text(node):
    return ''.join(
        text.firstChild.nodeValue
        for text in node.getElementsByTagName('w:t')
        if text.firstChild
    )


def paragraph(body, prefix):
    matches = [
        node for node in body.childNodes
        if node.nodeName == 'w:p' and word_text(node).startswith(prefix)
    ]
    if len(matches) != 1:
        raise ValueError(f'Expected one paragraph starting with {prefix!r}, found {len(matches)}')
    return matches[0]


def payment_table(body):
    return next(
        node for node in body.childNodes
        if node.nodeName == 'w:tbl' and word_text(node).startswith('付款阶段')
    )


def contract_terms(document, side):
    body = document.getElementsByTagName('w:body')[0]
    cells = [word_text(cell) for cell in document.getElementsByTagName('w:tc')]
    amount = cells[cells.index('合同金额') + 1]
    total = int(re.search(r'[\d,]+', amount).group().replace(',', ''))
    payments = {}
    for row in payment_table(body).getElementsByTagName('w:tr')[1:]:
        row_cells = [word_text(cell) for cell in row.getElementsByTagName('w:tc')]
        payments[row_cells[0]] = int(row_cells[1].removesuffix('%'))
    assert total > 0 and sum(payments.values()) == 100, 'Invalid sample payment totals'
    terms = {'total': total, 'payments': payments}
    if side == 'baseline':
        clause = word_text(paragraph(body, '甲方应在收到交付物后'))
        terms['acceptanceDays'] = int(re.search(r'(\d+) 个工作日', clause).group(1))
    else:
        clause = word_text(paragraph(body, '5.3 '))
        terms['notificationHours'] = int(re.search(r'(\d+) 小时', clause).group(1))
    return terms


def drawing_xml(relationship_id, name, width, height, description):
    name = escape(name, {'"': '&quot;'})
    description = escape(description, {'"': '&quot;'})
    return (
        '<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="120" w:after="200"/></w:pPr><w:r><w:drawing>'
        '<wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"'
        ' distT="0" distB="0" distL="0" distR="0">'
        f'<wp:extent cx="{width * EMU_PER_PIXEL}" cy="{height * EMU_PER_PIXEL}"/>'
        f'<wp:docPr id="{900 + int(relationship_id[3:])}" name="{name}" descr="{description}"/>'
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
    text = escape(text)
    return (
        '<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="60"/>'
        '<w:rPr><w:color w:val="657187"/><w:sz w:val="18"/></w:rPr></w:pPr>'
        f'<w:r><w:rPr><w:color w:val="657187"/><w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">{text}</w:t></w:r></w:p>'
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
        '履约资料：源代码、部署包、测试报告与验收记录应完整归档。</w:t></w:r></w:p></w:txbxContent></wps:txbx>'
        '<wps:bodyPr/></wps:wsp></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>'
    )


def formula_xml():
    """A formula, which the converter drops without leaving a placeholder."""
    return (
        '<w:p><w:pPr><w:jc w:val="center"/></w:pPr>'
        '<m:oMathPara xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><m:oMath>'
        '<m:r><m:t xml:space="preserve">阶段付款金额 = 含税合同总额 × 付款比例</m:t></m:r>'
        '</m:oMath></m:oMathPara></w:p>'
    )


def embed(parts, document, side, figures):
    body = document.getElementsByTagName('w:body')[0]
    removed_image_ids = set()

    # Remove the old generic appendix once, and our bookmarked paragraphs on
    # subsequent runs. Bookmarks survive Word round-trips without visible labels.
    legacy_appendix = False
    for node in list(body.childNodes):
        if node.nodeType != Node.ELEMENT_NODE or node.nodeName == 'w:sectPr':
            continue
        if word_text(node) == '附件一 图示':
            legacy_appendix = True
        owned = any(
            mark.getAttribute('w:name').startswith('DDPSample_')
            for mark in node.getElementsByTagName('w:bookmarkStart')
        )
        if legacy_appendix or owned:
            removed_image_ids.update(
                blip.getAttributeNS(REL_NS, 'embed')
                for blip in node.getElementsByTagNameNS(DRAWING_NS, 'blip')
            )
            body.removeChild(node)

    # Word/WPS may rename media when saving. Follow the removed drawings' IDs,
    # but preserve images also referenced by retained content or other parts.
    retained_ids = {
        attribute.value
        for element in document.getElementsByTagName('*')
        for attribute in element.attributes.values()
        if attribute.namespaceURI == REL_NS
    }
    unused_media = {name for name in parts if name.startswith('word/media/figure-')}
    rels_path = 'word/_rels/document.xml.rels'
    relationships = minidom.parseString(parts[rels_path])
    for relation in list(relationships.getElementsByTagName('Relationship')):
        if relation.getAttribute('TargetMode') == 'External':
            continue
        target = related_part(rels_path, relation)
        relationship_id = relation.getAttribute('Id')
        if relationship_id not in retained_ids and (
            relationship_id in removed_image_ids or target in unused_media
        ):
            unused_media.add(target)
            relation.parentNode.removeChild(relation)
    for path, data in parts.items():
        if not path.endswith('.rels'):
            continue
        relations = relationships if path == rels_path else minidom.parseString(data)
        for relation in relations.getElementsByTagName('Relationship'):
            if relation.getAttribute('TargetMode') != 'External':
                unused_media.discard(related_part(path, relation))
    for name in unused_media:
        parts.pop(name, None)

    bookmark_id = 6000

    def insert_after(anchor, fragments):
        nonlocal bookmark_id
        wrapper = minidom.parseString(
            f'<root xmlns:w="{WORD_NS}" xmlns:r="{REL_NS}">'
            + ''.join(fragments) + '</root>'
        )
        for element in wrapper.documentElement.childNodes:
            if element.nodeType != Node.ELEMENT_NODE:
                continue
            block = document.importNode(element, True)
            assert block.nodeName == 'w:p'
            start = document.createElementNS(WORD_NS, 'w:bookmarkStart')
            start.setAttribute('w:id', str(bookmark_id))
            start.setAttribute('w:name', f'DDPSample_{bookmark_id}')
            end = document.createElementNS(WORD_NS, 'w:bookmarkEnd')
            end.setAttribute('w:id', str(bookmark_id))
            first = block.firstChild
            if first and first.nodeName == 'w:pPr':
                first = first.nextSibling
            block.insertBefore(start, first)
            block.appendChild(end)
            body.insertBefore(block, anchor.nextSibling)
            anchor = block
            bookmark_id += 1
        return anchor

    image_index = 700
    relationship_ids = {
        relation.getAttribute('Id')
        for relation in relationships.getElementsByTagName('Relationship')
    }

    def image_after(anchor, key, explanation):
        nonlocal image_index
        figure = figures[key]
        while f'rId{image_index}' in relationship_ids:
            image_index += 1
        relationship_id = f'rId{image_index}'
        file_name = f'figure-{key}.png'
        suffix = 1
        while f'word/media/{file_name}' in parts:
            file_name = f'figure-{key}-{suffix}.png'
            suffix += 1
        parts[f'word/media/{file_name}'] = base64.b64decode(figure['png'])
        relation = relationships.createElementNS(PACKAGE_REL_NS, 'Relationship')
        relation.setAttribute('Id', relationship_id)
        relation.setAttribute('Type', f'{REL_NS}/image')
        relation.setAttribute('Target', f'media/{file_name}')
        relationships.documentElement.appendChild(relation)
        image_index += 1
        return insert_after(anchor, [
            caption_xml(explanation),
            drawing_xml(
                relationship_id, figure['title'], figure['width'],
                figure['height'], figure['description']
            ),
        ])

    image_after(
        paragraph(body, '1.3 '), 'service-chain',
        '核心服务链路如下，所有环节均受权限管理控制。'
    )
    if side == 'baseline':
        image_after(
            paragraph(body, '甲方逾期未提出书面异议的'), 'acceptance',
            '阶段验收流程如下，时限自收到交付物起算。'
        )

    payment = image_after(
        payment_table(body), f'payment-{side}',
        '下图金额及比例与本条付款表一致，金额单位为人民币万元。'
    )
    insert_after(payment, [
        caption_xml('阶段付款金额按含税合同总额与对应付款比例的乘积计算。'),
        formula_xml(),
    ])

    if side == 'revised':
        image_after(
            paragraph(body, '5.3 '), 'incident-response',
            '数据泄露的通知时限及责任方处置义务如下。'
        )

    last = next(
        node for node in reversed(body.childNodes)
        if node.nodeType == Node.ELEMENT_NODE and node.nodeName != 'w:sectPr'
    )
    insert_after(last, [caption_xml('履约资料归档说明'), text_box_xml()])

    parts['word/document.xml'] = document.toxml(encoding='utf-8')
    parts['word/_rels/document.xml.rels'] = relationships.toxml(encoding='utf-8')
    content_types = minidom.parseString(parts['[Content_Types].xml'])
    for item in list(content_types.getElementsByTagName('Override')):
        if item.getAttribute('PartName').lstrip('/') in unused_media:
            item.parentNode.removeChild(item)
    if not any(
        item.getAttribute('Extension') == 'png'
        for item in content_types.getElementsByTagName('Default')
    ):
        image_type = content_types.createElement('Default')
        image_type.setAttribute('Extension', 'png')
        image_type.setAttribute('ContentType', 'image/png')
        content_types.documentElement.appendChild(image_type)
    parts['[Content_Types].xml'] = content_types.toxml(encoding='utf-8')

    output = io.BytesIO()
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name in sorted(parts, key=lambda name: (name != '[Content_Types].xml', name)):
            if not name.endswith('/'):
                info = zipfile.ZipInfo(name, date_time=(2026, 8, 1, 0, 0, 0))
                archive.writestr(info, parts[name], compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    result = output.getvalue()
    with zipfile.ZipFile(io.BytesIO(result)) as archive:
        assert archive.testzip() is None
        minidom.parseString(archive.read('word/document.xml'))
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--preview-dir', type=Path)
    args = parser.parse_args()
    packages = {}
    documents = {}
    terms = {}
    for side in ('baseline', 'revised'):
        with zipfile.ZipFile(SAMPLES / f'{side}.docx') as archive:
            packages[side] = {name: archive.read(name) for name in archive.namelist()}
        documents[side] = minidom.parseString(packages[side]['word/document.xml'])
        terms[side] = contract_terms(documents[side], side)

    renderer = subprocess.run(
        ['node', str(ROOT / 'scripts/render_sample_images.js')],
        input=json.dumps(terms), stdout=subprocess.PIPE, text=True, check=True, cwd=ROOT,
    )
    figures = json.loads(renderer.stdout)
    # Prepare both packages before replacing either checked-in sample.
    results = {
        side: embed(packages[side], documents[side], side, figures)
        for side in ('baseline', 'revised')
    }
    for side, data in results.items():
        path = SAMPLES / f'{side}.docx'
        temporary = path.with_suffix('.docx.tmp')
        temporary.write_bytes(data)
        temporary.replace(path)
        print(f'{path.name}: {len(data):,} bytes')

    if args.preview_dir:
        args.preview_dir.mkdir(parents=True, exist_ok=True)
        for key, figure in figures.items():
            (args.preview_dir / f'{key}.png').write_bytes(base64.b64decode(figure['png']))
        print(f'Figure previews: {args.preview_dir}')


if __name__ == '__main__':
    main()
