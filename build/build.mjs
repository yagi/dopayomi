// budoux-ja.js・kuromoji.js・dict/ を作り直す。使い方: npm install && npm run build
import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

await esbuild.build({
  entryPoints: [path.join(root, 'build/budoux-entry.js')],
  bundle: true, minify: true, format: 'iife',
  outfile: path.join(root, 'budoux-ja.js'),
  plugins: [{
    name: 'budoux-dist',   // budoux は dist/ 以下を exports で公開していないので、直接ファイルを指す
    setup(b) {
      const dist = path.join(root, 'node_modules/budoux/dist');
      b.onResolve({ filter: /^budoux-dist\// }, (a) => ({ path: path.join(dist, a.path.slice('budoux-dist/'.length)) }));
    },
  }],
});

await esbuild.build({
  entryPoints: [path.join(root, 'build/kuromoji-loader/entry.js')],
  bundle: true, minify: true, format: 'iife',
  outfile: path.join(root, 'kuromoji.js'),
  plugins: [{
    name: 'browser-loader',
    setup(b) {
      b.onResolve({ filter: /^path$/ }, () => ({ path: require.resolve('path-browserify') }));
      b.onResolve({ filter: /NodeDictionaryLoader/ }, () => ({ path: path.join(root, 'build/kuromoji-loader/Loader.js') }));
    },
  }],
});

// 辞書: 配信の都合で .gz が置けないため、gzip のまま base64 にした .txt にする
const dictSrc = path.join(path.dirname(require.resolve('kuromoji/package.json')), 'dict');
const dictOut = path.join(root, 'dict');
fs.mkdirSync(dictOut, { recursive: true });
for (const f of fs.readdirSync(dictSrc).filter((f) => f.endsWith('.dat.gz'))) {
  fs.writeFileSync(path.join(dictOut, f.replace(/\.dat\.gz$/, '.b64.txt')), fs.readFileSync(path.join(dictSrc, f)).toString('base64'));
}
console.log('built: budoux-ja.js, kuromoji.js, dict/');
