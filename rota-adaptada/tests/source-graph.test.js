import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir, stat} from 'node:fs/promises';
import {dirname, join, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
async function filesIn(directory) {
  const entries = await readdir(directory, {withFileTypes: true});
  return (await Promise.all(entries.map(entry => entry.isDirectory()
    ? filesIn(join(directory, entry.name)) : join(directory, entry.name)))).flat();
}

// A module's own tests do not establish that it still belongs to the website.
// Walk the actual HTML entry, including lazy imports and CSS/JSON, so removed
// features cannot linger as an isolated second application under src/.
test('every source belongs to a live entry and all local imports resolve', async () => {
  const html = await readFile(join(root, 'index.html'), 'utf8');
  const entry = html.match(/<script\b[^>]*\bsrc=["']([^"']+)["']/)?.[1];
  assert.ok(entry, 'HTML must declare an application entry');
  const pending = [resolve(root, entry.replace(/^\//, ''))], visited = new Set();
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  while (pending.length) {
    const file = pending.pop();
    if (visited.has(file)) continue;
    assert.ok((await stat(file).catch(() => null))?.isFile(), `Missing module: ${relative(root, file)}`);
    visited.add(file);
    if (!file.endsWith('.js')) continue;
    const code = await readFile(file, 'utf8');
    const patterns = [
      /\bfrom\s*['"]([^'"]+)['"]/g,
      /\bimport\s*['"]([^'"]+)['"]/g,
      /\bimport\s*\(\s*['"]([^'"]+)['"]/g,
    ];
    for (const pattern of patterns) for (const [, specifier] of code.matchAll(pattern)) {
      const path = specifier.split('?')[0];
      if (path.startsWith('.')) pending.push(resolve(dirname(file), path));
      else {
        const name = path.startsWith('@') ? path.split('/').slice(0, 2).join('/') : path.split('/')[0];
        assert.ok(pkg.dependencies?.[name], `Undeclared browser dependency: ${specifier}`);
      }
    }
  }
  const orphaned = (await filesIn(join(root, 'src'))).filter(file => !visited.has(file)).map(file => relative(root, file));
  assert.deepEqual(orphaned, [], 'Remove obsolete sources or connect them to an active flow');
});
