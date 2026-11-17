// BudouX の日本語モデルだけを（budoux-dist/ は build.mjs が node_modules/budoux/dist/ に読み替える）1ファイルにまとめ、window.BudouXJa として公開する
const { Parser } = require('budoux-dist/parser.js');
const { model } = require('budoux-dist/data/models/ja.js');
const p = new Parser(model);
const api = { parse: (s) => p.parse(s) };
if (typeof window !== 'undefined') window.BudouXJa = api;
if (typeof module !== 'undefined') module.exports = api;
