// Render the sample's contract figures with the browser already used by E2E tests.
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { chromium } from '@playwright/test';

const terms = JSON.parse(readFileSync(0, 'utf8'));
const ink = '#203149';
const muted = '#617188';
const rule = '#dce4ee';
const blue = '#4560c4';
const teal = '#087f8c';

function text(x, y, value, size = 14, fill = ink, weight = 400, anchor = 'start') {
  const safe = String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  return `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" font-weight="${weight}" text-anchor="${anchor}">${safe}</text>`;
}

function rect(x, y, width, height, fill, stroke = 'none', radius = 4) {
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}" stroke="${stroke}"/>`;
}

function line(x1, y1, x2, y2, arrow = false, color = rule) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="2"${arrow ? ' marker-end="url(#arrow)"' : ''}/>`;
}

function figure(key, title, description, height, elements) {
  return {
    key,
    title,
    description,
    width: 560,
    height,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="560" height="${height}" viewBox="0 0 560 ${height}">
      <style>text { font-family: Arial, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif; }</style>
      <defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M1 1 9 5 1 9" fill="none" stroke="#8293ab" stroke-width="1.5"/></marker></defs>
      ${rect(0, 0, 560, height, '#ffffff', 'none', 0)}${elements.join('')}
    </svg>`
  };
}

function paymentPlan(side) {
  const { total, payments } = terms[side];
  const stages = [
    ['预付款', blue],
    ['里程碑款', teal],
    ['上线款', '#2894bc'],
    ['质保款', '#899bb2']
  ];
  const elements = [
    text(24, 36, '付款计划', 24, ink, 700),
    text(24, 62, '第三条 · 费用与支付', 14, muted),
    text(536, 28, '合同总额（含税）', 13, muted, 400, 'end'),
    text(536, 62, `${total / 10000} 万元`, 28, ink, 700, 'end'),
    line(24, 84, 536, 84),
    text(24, 112, '付款阶段', 12, muted),
    text(410, 112, '比例', 12, muted, 400, 'end'),
    text(536, 112, '含税金额', 12, muted, 400, 'end')
  ];
  for (const value of [0, 20, 40, 60]) {
    const x = 132 + value * 3.8;
    elements.push(text(x, 112, `${value}%`, 11, muted, 400, 'middle'), line(x, 126, x, 302));
  }
  stages.forEach(([stage, color], index) => {
    const ratio = payments[stage] ?? 0;
    const y = 148 + index * 46;
    elements.push(text(24, y + 6, stage, 16, ratio ? ink : muted, 500));
    if (ratio) elements.push(rect(132, y - 12, ratio * 3.8, 24, color, 'none', 2));
    else elements.push(text(140, y + 5, '本版本未设置', 13, muted));
    elements.push(
      text(410, y + 6, ratio ? `${ratio}%` : '—', 17, ink, 700, 'end'),
      text(536, y + 6, ratio ? `${(total * ratio) / 1000000} 万元` : '—', 17, ink, 600, 'end')
    );
  });
  elements.push(
    line(24, 318, 536, 318),
    text(24, 344, '各阶段比例合计 100%；金额按合同总额 × 付款比例计算。', 13, muted)
  );
  const description =
    `付款计划：含税合同总额 ${total} 元；` +
    Object.entries(payments)
      .map(([stage, ratio]) => `${stage} ${ratio}%，${(total * ratio) / 100} 元`)
      .join('；');
  return figure(`payment-${side}`, '付款计划', description, 366, elements);
}

function serviceChain() {
  const elements = [
    text(24, 36, '核心审阅链路', 24, ink, 700),
    text(24, 62, '第一条 · 服务范围与部署边界', 14, muted),
    rect(24, 88, 512, 164, '#f4f7fc', '#bccbe0', 8),
    text(42, 116, '甲方指定私有云 · 中国大陆境内', 15, blue, 600)
  ];
  const nodes = [
    ['文档上传', '历史资料导入'],
    ['版本比对', '定位内容变化'],
    ['审阅记录', '保留处理结果']
  ];
  nodes.forEach(([title, subtitle], index) => {
    const x = 42 + index * 174;
    elements.push(
      rect(x, 140, 128, 66, '#ffffff', '#c9d5e5'),
      text(x + 64, 167, title, 17, ink, 600, 'middle'),
      text(x + 64, 190, subtitle, 12, muted, 400, 'middle')
    );
    if (index < 2) elements.push(line(x + 138, 173, x + 164, 173, true, '#8293ab'));
  });
  elements.push(text(42, 234, '权限管理覆盖各环节，生产数据保留在甲方环境。', 13, muted));
  return figure(
    'service-chain',
    '核心审阅链路',
    '第一条服务范围：文档上传、版本比对和审阅记录由权限管理控制，部署于中国大陆境内的甲方私有云。',
    274,
    elements
  );
}

function acceptanceFlow() {
  const days = terms.baseline.acceptanceDays;
  return figure(
    'acceptance',
    '阶段交付与验收',
    `基准合同第二条：甲方收到交付物后 ${days} 个工作日内完成验收。有书面异议时一次性反馈问题清单；逾期未提出书面异议则视为本阶段交付物通过验收。`,
    318,
    [
      text(24, 36, '阶段交付与验收', 24, ink, 700),
      text(24, 62, '第二条 · 基准合同的验收约定', 14, muted),
      rect(24, 92, 164, 72, '#f4f7fc', '#c9d5e5'),
      text(106, 120, '乙方提交交付物', 17, ink, 600, 'middle'),
      text(106, 145, '源代码、部署包、测试报告', 12, muted, 400, 'middle'),
      line(199, 128, 223, 128, true, '#8293ab'),
      rect(236, 92, 300, 72, '#f4f7fc', '#c9d5e5'),
      text(386, 120, '甲方完成验收', 17, ink, 600, 'middle'),
      text(386, 146, `时限：${days} 个工作日`, 18, blue, 600, 'middle'),
      line(386, 164, 386, 187),
      line(148, 187, 412, 187),
      line(148, 187, 148, 207, true),
      line(412, 187, 412, 207, true),
      rect(24, 214, 248, 66, '#fff8eb', '#ead8b7'),
      text(148, 241, '提出书面异议', 16, '#8c5a15', 600, 'middle'),
      text(148, 263, '一次性反馈问题清单', 14, ink, 400, 'middle'),
      rect(288, 214, 248, 66, '#eef6fb', '#bfd8e9'),
      text(412, 241, '逾期未提书面异议', 16, blue, 600, 'middle'),
      text(412, 263, '视为本阶段交付物通过验收', 14, ink, 400, 'middle'),
      text(24, 306, '计时起点：甲方收到交付物。', 13, muted)
    ]
  );
}

function incidentResponse() {
  const hours = terms.revised.notificationHours;
  const elements = [
    text(24, 36, '数据泄露处置', 24, ink, 700),
    text(24, 62, '第五条第 5.3 款 · 通知与处置责任', 14, muted),
    text(118, 109, '发生数据泄露后', 14, muted, 400, 'middle'),
    `<circle cx="118" cy="177" r="53" fill="#eef8f7" stroke="${teal}" stroke-width="3"/>`,
    text(118, 193, hours, 48, teal, 700, 'middle'),
    text(118, 255, '小时内通知对方', 18, teal, 600, 'middle'),
    line(228, 94, 228, 274),
    text(252, 110, '责任方承担后续处置', 17, ink, 600)
  ];
  ['调查', '修复', '监管处置'].forEach((label, index) => {
    const y = 147 + index * 54;
    elements.push(
      `<circle cx="266" cy="${y}" r="12" fill="${teal}"/>`,
      text(266, y + 5, index + 1, 13, '#ffffff', 600, 'middle'),
      text(291, y + 6, label, 18, ink, 600)
    );
    if (index < 2) elements.push(line(266, y + 16, 266, y + 37));
  });
  elements.push(
    rect(24, 296, 512, 40, '#eef8f7'),
    text(40, 322, '调查、修复及监管处置的合理费用由责任方承担。', 14, ink)
  );
  return figure(
    'incident-response',
    '数据泄露处置',
    `修订合同第 5.3 款：责任方应在 ${hours} 小时内通知对方，并承担调查、修复及监管处置产生的合理费用。`,
    354,
    elements
  );
}

const figures = [serviceChain(), acceptanceFlow(), paymentPlan('baseline'), paymentPlan('revised'), incidentResponse()];
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
try {
  const page = await browser.newPage({ deviceScaleFactor: 3, locale: 'zh-CN' });
  const rendered = {};
  for (const { key, svg, ...metadata } of figures) {
    await page.setViewportSize({ width: metadata.width, height: metadata.height });
    await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
    const png = await page.screenshot({ type: 'png', animations: 'disabled' });
    rendered[key] = { ...metadata, png: png.toString('base64') };
  }
  process.stdout.write(JSON.stringify(rendered));
} finally {
  await browser.close();
}
