/**
 * Скачивает шрифты Google Fonts в public/assets/fonts и собирает локальный fonts.css.
 * Берём только кириллические и латинские сабсеты — этого достаточно интерфейсу.
 *
 * node tools/fetch_fonts.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.join(ROOT, 'public', 'assets', 'fonts');

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const FAMILIES = [
  'Lora:wght@400;500;600;700',
  'Manrope:wght@400;500;600;700;800',
];

const KEEP = ['cyrillic', 'cyrillic-ext', 'latin', 'latin-ext'];

await mkdir(OUT_DIR, { recursive: true });

const cssParts = [];
let downloaded = 0;

for (const family of FAMILIES) {
  const url = `https://fonts.googleapis.com/css2?family=${family}&display=swap`;
  const css = await fetch(url, { headers: { 'User-Agent': UA } }).then((r) => r.text());

  // Разбиваем на блоки «комментарий с именем сабсета + @font-face»
  const blocks = css.split('/*').slice(1);
  for (const block of blocks) {
    const subset = block.slice(0, block.indexOf('*/')).trim();
    if (!KEEP.includes(subset)) continue;

    const face = block.slice(block.indexOf('*/') + 2);
    const srcMatch = face.match(/url\((https:\/\/[^)]+\.woff2)\)/);
    if (!srcMatch) continue;

    const remote = srcMatch[1];
    const fileName = path.basename(new URL(remote).pathname);
    const buf = Buffer.from(await fetch(remote, { headers: { 'User-Agent': UA } }).then((r) => r.arrayBuffer()));
    await writeFile(path.join(OUT_DIR, fileName), buf);
    downloaded++;

    cssParts.push(face.replace(remote, fileName).trim());
  }
  console.log('готово:', decodeURIComponent(family.split(':')[0]).replace(/\+/g, ' '));
}

await writeFile(
  path.join(OUT_DIR, 'fonts.css'),
  `/* Локальные шрифты интерфейса. Сгенерировано tools/fetch_fonts.mjs */\n\n${cssParts.join('\n\n')}\n`
);

console.log(`файлов шрифтов: ${downloaded}`);
