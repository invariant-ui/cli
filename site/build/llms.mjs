// Writes site/llms-full.txt (docs as plain text) from site/docs/index.html. Run from the repo root: node site/build/llms.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync('site/docs/index.html', 'utf8');
const main = html.slice(html.indexOf('<main>'), html.indexOf('</main>'));
const ent = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&rsquo;': "'", '&lsquo;': "'", '&middot;': '·', '&nbsp;': ' ', '&mdash;': '—', '&ndash;': '–', '&hellip;': '…' };
const text = main
  .replace(/<pre[^>]*>([\s\S]*?)<\/pre>/g, (_, c) => '\n```\n' + c.replace(/<[^>]+>/g, '') + '\n```\n')
  .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/g, '\n# $1\n')
  .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/g, '\n## $1\n')
  .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/g, '\n### $1\n')
  .replace(/<li[^>]*>/g, '\n- ')
  .replace(/<\/(p|tr|div|section|ul|table)>/g, '\n')
  .replace(/<\/t[dh]>/g, ' | ')
  .replace(/<code[^>]*>([\s\S]*?)<\/code>/g, '`$1`')
  .replace(/<[^>]+>/g, '')
  .replace(/&[a-z]+;/g, (e) => ent[e] ?? e)
  .replace(/[ \t]+\n/g, '\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim();
writeFileSync('site/llms-full.txt', `# Invariant documentation\n\nSource: https://invariant-ui.com/docs/\n\n${text}\n`);
