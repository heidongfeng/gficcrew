import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import fs from 'node:fs';
import path from 'node:path';
// Shared with src/pages/rss.xml.ts, which stamps the same date onto each feed item as
// <pubDate>. The reasoning behind it lives in that file.
import { lastmodFor } from './scripts/lastmod.mjs';

/**
 * Astro loads .env.<mode> into import.meta.env but not into process.env, so read the
 * mode-specific file here. An empty PUBLIC_ICP must stay empty — shipping the
 * placeholder filing number is worse than shipping none.
 */
function readModeEnv(variant) {
  const file = path.resolve(process.cwd(), `.env.${variant}`);
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^['"]|['"]$/g, '').trim();
  }
  return out;
}

/**
 * Two builds from one codebase:
 *   --mode global  → gficcrew.com   (Cloudflare Pages, no ICP filing, global CDN)
 *   --mode cn      → gficcrew.cn    (Tencent Cloud, ICP filing required)
 * The variant can also be forced with the SITE_VARIANT env var (used by CI).
 */
function resolveVariant(mode) {
  if (process.env.SITE_VARIANT === 'cn' || process.env.SITE_VARIANT === 'global') {
    return process.env.SITE_VARIANT;
  }
  const argv = process.argv || [];
  const dashIndex = argv.indexOf('--mode');
  const fromArg =
    dashIndex >= 0
      ? argv[dashIndex + 1]
      : (argv.find((a) => typeof a === 'string' && a.startsWith('--mode=')) || '').replace('--mode=', '');
  return (mode || fromArg) === 'cn' ? 'cn' : 'global';
}

const VARIANT = resolveVariant();
const SITE_URL = VARIANT === 'cn' ? 'https://gficcrew.cn' : 'https://gficcrew.com';
const OUT_DIR = VARIANT === 'cn' ? 'dist-cn' : 'dist-global';
const MODE_ENV = readModeEnv(VARIANT);
const ICP = VARIANT === 'cn' ? process.env.PUBLIC_ICP || MODE_ENV.PUBLIC_ICP || '' : '';

export default defineConfig({
  site: SITE_URL,
  outDir: OUT_DIR,
  integrations: [
    sitemap({
      // Retired/redirect pages stay out of the sitemap.
      filter: (page) =>
        !/\/join\//.test(page) &&
        !/\/account\//.test(page) &&
        !/\/admin\//.test(page) &&
        !/\/guangzhou-guide\//.test(page) &&
        !/404/.test(page),
      serialize: (item) => {
        const lastmod = lastmodFor(item.url);
        return lastmod ? { ...item, lastmod } : item;
      },
    }),
  ],
  markdown: {
    shikiConfig: { theme: 'github-light', wrap: true },
  },
  // Injected so every page agrees on which domain and variant it was built for,
  // even when the .env file for the mode is not picked up (some CI runners).
  vite: {
    define: {
      __GFIC_SITE_URL__: JSON.stringify(SITE_URL),
      __GFIC_VARIANT__: JSON.stringify(VARIANT),
      __GFIC_ICP__: JSON.stringify(ICP),
    },
  },
});
