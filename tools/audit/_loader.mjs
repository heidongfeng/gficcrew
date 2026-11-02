// Module loader hooks that let the audit harness import app source the way the bundler does.
//
// Two gaps between "runs under Vite" and "runs under plain Node":
//   1. src/data/*.js do `import x from './generated/x.json'` with no import attribute.
//      Valid under a bundler, rejected by Node's default JSON loader.
//   2. src/data/site.js reads `import.meta.env.PUBLIC_*` and the bare globals
//      __GFIC_SITE_URL__ / __GFIC_VARIANT__ / __GFIC_ICP__, which astro.config
//      injects through vite.define. Node has none of them and the module throws on load.
//
// Editing app source just to make it testable would mean auditing something other than
// what ships, so both gaps are closed here instead. The transformation is limited to
// src/data/**.js and only rewrites `import.meta.env`.
import { readFile } from 'node:fs/promises';

const AUDIT_ENV = {
  PUBLIC_SITE_URL: 'https://gficcrew.com',
  PUBLIC_VARIANT: 'global',
  PUBLIC_ICP: '',
  MODE: 'global',
  DEV: false,
  PROD: true,
};

export async function load(url, context, nextLoad) {
  if (url.endsWith('.json')) {
    const source = await readFile(new URL(url), 'utf8');
    return { format: 'json', source, shortCircuit: true };
  }

  if (url.includes('/src/data/') && url.endsWith('.js')) {
    const result = await nextLoad(url, context);
    let src = result.source.toString();
    if (src.includes('import.meta.env') || src.includes('__GFIC_')) {
      // Declare the vite.define globals the same way vite would inline them, then
      // swap import.meta.env for the audit env object.
      src =
        `const __env = globalThis.__GFIC_AUDIT_ENV__ || {};\n` +
        `const __GFIC_SITE_URL__ = __env.PUBLIC_SITE_URL || '';\n` +
        `const __GFIC_VARIANT__ = __env.PUBLIC_VARIANT || 'global';\n` +
        `const __GFIC_ICP__ = __env.PUBLIC_ICP || '';\n` +
        src.replaceAll('import.meta.env', '__env');
      return { ...result, source: src, shortCircuit: true };
    }
    return result;
  }

  return nextLoad(url, context);
}

export function installEnv() {
  globalThis.__GFIC_AUDIT_ENV__ = AUDIT_ENV;
}
