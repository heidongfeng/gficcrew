#!/usr/bin/env node
import { createWorkBuddyCloud } from '@tencent-ai/workbuddy-cloud-sdk';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const pw = process.env.GFIC_ADMIN_PW || fs.readFileSync(path.join(root, '.adminpw'), 'utf8').trim();

const cloud = createWorkBuddyCloud({
  endpoint: 'https://gficcrew.app.workbuddy.host',
  publishableKey: 'wbpk_1uORfVuxR6GP7CtKSD3Ciw_ZlNBhhoZQmyPg3rXxYL6aZvBv5miIAum',
});

for (const c of ['site', 'plans', 'faq']) {
  const { data, error } = await cloud.database.rpc('cms_list', { p_password: pw, p_collection: c });
  if (error) { console.log(c, 'ERROR', error.message); continue; }
  console.log(`\n===== collection: ${c} (docs=${data?.length}) =====`);
  for (const d of data || []) {
    const t = Array.isArray(d.data) ? 'ARRAY' : typeof d.data;
    console.log(` doc_id=${d.doc_id} sort=${d.sort_order} data-is=${t}`);
    if (!Array.isArray(d.data)) {
      console.log('   keys:', Object.keys(d.data || {}).join(', '));
    } else {
      console.log('   array len:', d.data.length, 'first q:', (d.data[0] && d.data[0].q) || '(no q)');
    }
  }
}
