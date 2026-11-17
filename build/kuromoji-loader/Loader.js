"use strict";
// 辞書ローダー: fetch で読み、gzip のときだけ展開する（配信側が先に展開して渡してくる場合に備える）
var zlib = require("zlibjs/bin/gunzip.min.js");
var DictionaryLoader = require("kuromoji/src/loader/DictionaryLoader");
function Loader(dic_path) { DictionaryLoader.apply(this, [dic_path]); }
Loader.prototype = Object.create(DictionaryLoader.prototype);
Loader.prototype.loadArrayBuffer = function (url, callback) {
  // 配信の都合で、辞書は gzip を base64 にした .txt として置いている（base.dat.gz → base.b64.txt）
  var txtUrl = url.replace(/\.dat\.gz$/, ".b64.txt");
  fetch(txtUrl).then(function (r) {
    if (!r.ok) throw new Error(r.status + " " + txtUrl);
    return r.text();
  }).then(function (b64) {
    var bin = atob(b64.replace(/\s+/g, ""));
    var u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    if (u8[0] === 0x1f && u8[1] === 0x8b) u8 = new zlib.Zlib.Gunzip(u8).decompress();
    if (window.KuromojiProgress) window.KuromojiProgress(url);
    callback(null, u8.buffer.byteLength === u8.length ? u8.buffer : u8.slice().buffer);
  }).catch(function (e) { callback(e, null); });
};
module.exports = Loader;
