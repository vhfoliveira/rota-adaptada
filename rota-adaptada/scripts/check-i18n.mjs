import {readdirSync, readFileSync, statSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const rootDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
const srcDir = join(rootDir, 'src');
const indexPath = join(rootDir, 'index.html');
const enPath = join(srcDir, 'i18n', 'en.json');

function walkJsFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...walkJsFiles(full));
    } else if (entry.endsWith('.js') && full !== join(srcDir, 'i18n.js')) {
      files.push(full);
    }
  }
  return files;
}

function unescapeString(raw, quote) {
  return raw
    .replaceAll(`\\${quote}`, quote)
    .replaceAll('\\\\', '\\')
    .replaceAll('\\n', '\n')
    .replaceAll('\\t', '\t');
}

function extractTCalls(source) {
  const keys = [];
  const pattern = /(?:^|[^a-zA-Z0-9_$.])t\(\s*(['"])((?:\\.|(?!\1).)*)\1/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    const text = unescapeString(match[2], match[1]);
    if (text) keys.push(text);
  }
  return keys;
}

function extractHtmlMarkers(html) {
  const keys = [];
  const textMarker = /<([a-z0-9-]+)\b[^>]*\bdata-i18n(?:=(['"])(.*?)\2)?[^>]*>([\s\S]*?)<\/\1>/gi;
  let match;
  while ((match = textMarker.exec(html)) !== null) {
    const explicit = match[3]?.trim();
    const body = match[4]?.replace(/<[^>]+>/g, '').trim();
    if (explicit || body) keys.push(explicit || body);
  }

  for (const attr of ['content', 'placeholder', 'title', 'aria-label']) {
    const attrPattern = new RegExp(`\\bdata-i18n-${attr}(?:=(['"])(.*?)\\1)?[^>]*?\\b${attr}=(['"])(.*?)\\3`, 'gi');
    while ((match = attrPattern.exec(html)) !== null) {
      const value = (match[2] || match[4] || '').trim();
      if (value) keys.push(value);
    }
  }
  return keys;
}

const strict = process.argv.includes('--strict');
const jsonOutput = process.argv.includes('--json');

const enDict = JSON.parse(readFileSync(enPath, 'utf8'));
const usedKeys = new Set();

if (statSync(indexPath, {throwIfNoEntry: false})) {
  for (const key of extractHtmlMarkers(readFileSync(indexPath, 'utf8'))) {
    usedKeys.add(key);
  }
}

for (const file of walkJsFiles(srcDir)) {
  for (const key of extractTCalls(readFileSync(file, 'utf8'))) {
    usedKeys.add(key);
  }
}

const sortedKeys = [...usedKeys].sort((a, b) => a.localeCompare(b, 'pt-BR'));
const translated = sortedKeys.filter(key => typeof enDict[key] === 'string' && enDict[key].length > 0);
const missing = sortedKeys.filter(key => !(typeof enDict[key] === 'string' && enDict[key].length > 0));
const orphan = Object.keys(enDict).filter(key => !usedKeys.has(key));

if (jsonOutput) {
  console.log(JSON.stringify({
    totalMarked: sortedKeys.length,
    translated: translated.length,
    missingCount: missing.length,
    orphanCount: orphan.length,
    missing,
    orphan,
  }, null, 2));
} else {
  console.log(`i18n (PT-BR -> EN): ${translated.length}/${sortedKeys.length} traduzidas, ${missing.length} pendentes.`);
  if (missing.length) {
    console.log('\nTextos em PT-BR ainda sem tradução em src/i18n/en.json:');
    for (const key of missing) console.log(`  - ${JSON.stringify(key)}`);
  }
  if (orphan.length) {
    console.log('\nChaves extras em src/i18n/en.json (não encontradas em t() / data-i18n):');
    for (const key of orphan) console.log(`  - ${JSON.stringify(key)}`);
  }
}

if (strict && missing.length > 0) {
  process.exitCode = 1;
}
