// Plain-text ⇄ JSON codecs for the two nested guide fields.
//
// Editing raw JSON for nested content is painful, so the admin edits them as plain text
// using a small documented markup, and can flip to JSON and back without losing anything.
//
//   sections:   ## Title | anchor-id      (blank line starts a new paragraph, "- " is a bullet)
//   faq:        Q: question               (blank line separates entries)
//               A: answer
//   formats:    # id | tier N | rank N    (blank line separates entries)
//               Name: / Tagline: / Why: / China: / Solo: / Keywords:
//
// Both directions round-trip for the shapes used in src/data/*.js:
//   sections: { id, title, paragraphs[], list?[] }
//   faq:      { q, a }
//   formats:  { id, tier, rank, name, tagline, why, inChina, soloNote, keywords[] }

export function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

// slugify() strips everything non-ASCII, so a Chinese heading would end up with an empty
// anchor. Fall back to a deterministic hash so the id stays stable across saves.
function hashId(title) {
  let h = 0;
  for (let i = 0; i < title.length; i += 1) h = (h * 31 + title.charCodeAt(i)) | 0;
  return 'section-' + Math.abs(h).toString(36);
}

export function sectionId(title) {
  return slugify(title) || hashId(String(title || ''));
}

// The activity formats behind /events/. Ordered object -> labelled lines, so the
// person editing sees one readable block per format instead of nested JSON.
const FORMAT_FIELDS = [
  ['Name', 'name'],
  ['Tagline', 'tagline'],
  ['Why', 'why'],
  ['China', 'inChina'],
  ['Solo', 'soloNote'],
];

function parseKeywords(s) {
  return String(s || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

export function codecToText(data, codec) {
  const arr = Array.isArray(data) ? data : [];
  if (codec === 'formats') {
    return arr
      .map((f) => {
        const head = '# ' + (f.id || '') + ' | tier ' + (f.tier || 0) + ' | rank ' + (f.rank || 0);
        const rows = FORMAT_FIELDS.map(([label, key]) => label + ': ' + (f[key] || ''));
        rows.push('Keywords: ' + (Array.isArray(f.keywords) ? f.keywords : []).join(', '));
        return [head, ...rows].join('\n');
      })
      .join('\n\n');
  }
  if (codec === 'faq') {
    return arr.map((x) => 'Q: ' + (x.q || '') + '\nA: ' + (x.a || '')).join('\n\n');
  }
  if (codec === 'sections') {
    return arr
      .map((s) => {
        const head = '## ' + (s.title || '') + (s.id ? ' | ' + s.id : '');
        const body = (s.paragraphs || []).join('\n\n');
        const bullets = (s.list || []).map((l) => '- ' + l).join('\n');
        return [head, body, bullets].filter((x) => x && String(x).trim()).join('\n\n');
      })
      .join('\n\n\n');
  }
  return JSON.stringify(arr, null, 2);
}

export function codecFromText(text, codec) {
  const t = String(text || '');
  if (codec === 'formats') {
    const out = [];
    for (const block of t.split(/\n\s*\n/)) {
      const lines = block.split('\n').map((s) => s.trim()).filter(Boolean);
      if (!lines.length) continue;
      const head = lines.shift();
      if (!/^#\s+/.test(head)) continue;
      const parts = head.replace(/^#\s+/, '').split('|').map((s) => s.trim());
      const item = {
        id: parts[0] || '',
        tier: 0,
        rank: 0,
        name: '',
        tagline: '',
        why: '',
        inChina: '',
        soloNote: '',
        keywords: [],
      };
      for (const p of parts.slice(1)) {
        const mt = p.match(/^tier\s+(\d+)$/i);
        const mr = p.match(/^rank\s+(\d+)$/i);
        if (mt) item.tier = Number(mt[1]);
        else if (mr) item.rank = Number(mr[1]);
      }
      let current = null;
      for (const l of lines) {
        const m = l.match(/^(Name|Tagline|Why|China|Solo|Keywords):\s*(.*)$/i);
        if (m) {
          const hit = FORMAT_FIELDS.find(([label]) => label.toLowerCase() === m[1].toLowerCase());
          if (m[1].toLowerCase() === 'keywords') {
            current = 'keywords';
            item.keywords = parseKeywords(m[2]);
            continue;
          }
          current = hit ? hit[1] : null;
          if (current) item[current] = m[2];
        } else if (current === 'keywords') {
          item.keywords = item.keywords.concat(parseKeywords(l));
        } else if (current) {
          item[current] = (item[current] ? item[current] + ' ' : '') + l;
        }
      }
      out.push(item);
    }
    return out;
  }
  if (codec === 'faq') {
    const out = [];
    for (const block of t.split(/\n\s*\n/)) {
      const lines = block.split('\n').map((s) => s.trim()).filter(Boolean);
      let q = '';
      const a = [];
      for (const l of lines) {
        const mQ = l.match(/^Q:\s*(.*)$/i);
        const mA = l.match(/^A:\s*(.*)$/i);
        if (mQ) q = q ? q + ' ' + mQ[1] : mQ[1];
        else if (mA) a.push(mA[1]);
        else if (a.length) a.push(l);
        else if (q) q += ' ' + l;
      }
      if (q) out.push({ q, a: a.join(' ').trim() });
    }
    return out;
  }
  if (codec === 'sections') {
    const out = [];
    for (const block of String(t).split(/^##[ \t]+/m).slice(1)) {
      const lines = block.split('\n');
      const parts = lines.shift().trim().split('|');
      const title = (parts[0] || '').trim();
      const id = (parts[1] || '').trim() || sectionId(title);
      const paragraphs = [];
      const list = [];
      let buf = [];
      const flush = () => {
        const joined = buf.join(' ').trim();
        if (joined) paragraphs.push(joined);
        buf = [];
      };
      for (const line of lines) {
        const t2 = line.trim();
        if (!t2) { flush(); continue; }
        if (/^[-*]\s+/.test(t2)) { flush(); list.push(t2.replace(/^[-*]\s+/, '')); continue; }
        buf.push(t2);
      }
      flush();
      const section = { id, title, paragraphs };
      if (list.length) section.list = list;
      out.push(section);
    }
    return out;
  }
  return [];
}

export const CODEC_HINT = {
  sections: '每段以 ## 标题 开头（可写 "| 锚点id"），一个空行分一段，- 开头为列表项。',
  faq: '每条两行：Q: 问题 / A: 答案，条目之间空一行。',
  formats:
    '每条以 # 英文标识 | tier 层级 | rank 序号 开头，下面依次写 Name / Tagline / Why / China / Solo / Keywords 六行，条目之间空一行。' +
    'tier 1 是核心社交引擎，2 是高频强粘性，3 是稳定补充；rank 越小越靠前，两者改动会直接改变 /events/ 页面的分组和顺序。' +
    'Keywords 用逗号分隔，只用于帮助我们理解检索意图，不显示在页面上。',
};
