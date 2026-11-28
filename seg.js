/* ドパ読み 区切りと表示時間のロジック（DOMに依存しない）
 * ブラウザでは index.html から <script src="seg.js"> で読み込み、Node では require('./seg.js') で使える。
 * 文節モードでは BudouX のパーサー（budoux-ja.js）を opts.parser に渡す。 */
var RE_LATIN_WORD = /^[A-Za-zÀ-ɏ0-9'’\-]+$/;   // 欧文の単語（アクセント付き文字を含む）
var RE_HIRA = /^[ぁ-ゖゝゞー]+$/;
var RE_STOP = /^[、。，．！？!?…‥,.;；]+$/;          // ここで区切りを閉じる
var RE_CLOSE = /^[」』）)\]】〉》”’:：・〜～ー―—\-]+$/;   // 前に付けるが閉じない
var RE_OPEN = /^[「『（(\[【〈《“‘]+$/;                 // 次の区切りの頭に付ける
var RE_KANJI_END = /[一-鿿々〆ヶァ-ヺ]$/;
var RE_KANJI1 = /^[一-鿿]$/;
var RE_DIGIT_END = /[0-9０-９]$/;
var RE_HAS_HIRA = /[ぁ-ゖ]/;
// ひらがなだけでも新しい文節を始める語（自立語）
var INDEP = new Set(('この その あの どの これ それ あれ どれ ここ そこ あそこ どこ こう そう ああ どう ' +
  'そして しかし また ただ もし なぜ だから つまり さらに そこで それで ところが けれども すると なお および または あるいは ' +
  'とても かなり すぐ まだ もう ずっと きっと やはり やっぱり ほとんど たくさん すこし ちょっと もっと いつも よく たとえば もちろん むしろ ' +
  'こと もの ため とき ところ ひと わたし あなた みんな だれ なに いつ いま ' +
  'ある ない いい よい できる わかる なる').split(' '));

function tokenize(text) {
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    var seg = new Intl.Segmenter('ja', { granularity: 'word' });
    var out = [];
    for (var s of seg.segment(text)) out.push(s.segment);
    return out;
  }
  // Intl.Segmenter がない環境: 文字種の変わり目で分ける簡易版
  return text.match(/[一-鿿々〆ヶ]+|[ぁ-ゖー]+|[ァ-ヺー]+|[A-Za-z0-9０-９]+|\s+|[\s\S]/g) || [];
}

function plainLen(s) { return s.replace(/[、。，．！？!?…‥,.;；「」『』（）()\[\]【】〈〉《》“”‘’:：・\s]/g, '').length; }

// ---- 文節モード: BudouX の文節境界を土台に、つなぎ直しと長すぎる文節の分割をする ----
var RENTAI = new Set('この その あの どの 同じ 大きな 小さな ある いわゆる あらゆる わが'.split(' '));
var RE_PARTICLE_END = /[はがをにへとでもやの]$/;
var RE_COMPOUND = /^(よって|より|よる|よれば|よると|ついて|つき|おいて|おける|とって|対して|対する|関して|関する|つれて|わたって|かけて|応じて|基づいて|比べて)/;
var RE_AUX = /^(いる|いた|いて|います|いました|いく|いった|くる|きた|みる|みた|おく|おいた|しまう|しまった|ください|ほしい|もらう|もらった|くれる|くれた|あげる)/;
var RE_END_PUNCT = /[、。，．！？!?…‥」』）)]$/;
var RE_OPEN_TAIL = /[「『（(\[【〈《“‘]+$/;
function plain(s) { return s.replace(/[、。，．！？!?…‥,.;；「」『』（）()\[\]【】〈〉《》“”‘’:：・\s]/g, ''); }

var RE_STEM = /^[\u4e00-\u9fff々]+[\u3041-\u3096]{0,2}[いきぎしじちびみりえけげせぜねべめれ]$/;   // 泊まり、買い、読み、受け など
var RE_FORMAL = /^(こと|もの|ため|よう|はず|わけ|ところ|とき|ほう|まま|つもり)/;           // 形式名詞
var RE_LIGHT = /^(でき|なる|なっ|なり|する|した|して|しま|ある|あっ|あり|ない|なかっ|いる|いた|いま)/; // 軽い述語

// 読むときの重さ（漢字1、かな0.8、英数0.5）。句読点・括弧は数えない
function weight(s) {
  var w = 0;
  Array.from(plain(s)).forEach(function (c) {
    if (/[\u4e00-\u9fff々〆ヶ]/.test(c)) w += 1;
    else if (/[\u3041-\u30ff]/.test(c)) w += 0.8;
    else if (/[\x20-\x7e]/.test(c)) w += 0.5;
    else w += 1;
  });
  return w;
}

// 文節 a と b のあいだの切れ目の強さ。0=ほぼ切れない、1=ふつう、2=やや強い、Infinity=必ず切る
function boundary(a, b) {
  var pa = plain(a), pb = plain(b);
  if (/[、。，．！？!?…‥,.;；:：]$/.test(a)) return Infinity;
  if (/[A-Za-zÀ-ɏ0-9]$/.test(pa) && /^[A-Za-zÀ-ɏ0-9]/.test(pb)) return Infinity;   // 欧文の単語どうしは詰めない（空白が消えるため）
  if (RE_OPEN.test(b.charAt(0))) return 2;                         // 開き括弧の前
  if (/^[\u30a1-\u30faー・]+$/.test(pa) && /^[\u4e00-\u9fff\u30a1-\u30fa]/.test(pb)) return -1;   // カタカナ語＋漢字は複合語とみなす（モルダウ｜河の）
  if (RE_STEM.test(pa) && /^[\u4e00-\u9fff]/.test(pb)) return -1;   // 連用形＋漢字は複合語とみなす（泊まり｜客の）
  if (RENTAI.has(pa)) return 0;                                    // 連体詞＋名詞（この｜リーダーでは）
  if (/[のな]$/.test(pa)) return 0;                                // 連体修飾（基本の｜単位に、経済的な｜問題）
  if (/に$/.test(pa) && RE_COMPOUND.test(pb)) return 0;            // 複合助詞（人に｜よって）
  if (/と$/.test(pa) && /^(いう|いった|いえば|いって)/.test(pb)) return 0;  // 〜と｜いう
  if (/[てで]$/.test(pa) && RE_AUX.test(pb)) return 0;             // 補助動詞（読んで｜いる）
  if (RE_FORMAL.test(pb)) return 0;                                // 形式名詞（感じる｜ことが）
  if (RE_LIGHT.test(pb)) return 0;                                 // 軽い述語（ことが｜できる）
  if (pa.length <= 2 && !RE_PARTICLE_END.test(pa)) return 0;       // 短い副詞など（まだ｜無い）
  if (/[はも]$/.test(pa)) return 2;                                // 主題のあと
  if (/(ので|から|けど|けれど|ても|たら|なら|れば|[てでば])$/.test(pa)) return 2;  // 節の切れ目
  return 1;
}

function splitLong(phrase, maxLen, terms) {
  var total = plain(phrase).length;
  var target = total / Math.ceil(total / maxLen);                    // 均等に近い長さで割る
  var pieces = [], cur = '';
  // 割ってよい位置を語の切れ目から選ぶ。ただし複合語の内側（カタカナ語の途中、カタカナ語＋漢字1〜2字、ひとまとめ指定の語）は切らない
  var toks = [];
  protect(tokenize(phrase), terms || []).forEach(function (tok) {
    var prev = toks.length ? toks[toks.length - 1] : '';
    var kataPrev = /[\u30a1-\u30faー]$/.test(prev);
    if ((kataPrev && /^([\u30a1-\u30faー]+|・)$/.test(tok)) || (/・$/.test(prev) && /^[\u30a1-\u30fa]/.test(tok))) toks[toks.length - 1] += tok;   // モル＋ダウ、ドルフィン・ホテル
    else if (kataPrev && /^[\u4e00-\u9fff]{1,2}/.test(tok)) toks[toks.length - 1] += tok;          // モルダウ＋河
    else toks.push(tok);
  });
  function flush() {
    var m = cur.match(RE_OPEN_TAIL), carry = m ? m[0] : '';
    var body = carry ? cur.slice(0, -carry.length) : cur;
    if (body) pieces.push(body);
    cur = carry;
  }
  toks.forEach(function (tok) {
    if (/^\s+$/.test(tok)) return;
    if (RE_STOP.test(tok) || RE_CLOSE.test(tok)) {
      if (cur) cur += tok; else if (pieces.length) pieces[pieces.length - 1] += tok; else cur = tok;
      return;
    }
    if (RE_OPEN.test(tok)) { if (plain(cur).length >= target) flush(); cur += tok; return; }
    var arr = Array.from(tok), hard = RE_LATIN_WORD.test(tok) ? Infinity : Math.max(maxLen, 12);   // 1語は12字まで割らない。欧文の単語は長さによらず割らない
    while (arr.length > hard) { flush(); cur += arr.splice(0, hard).join(''); flush(); }
    tok = arr.join('');
    var n = plain(cur).length;
    var attachable = RE_HIRA.test(tok) && tok.length <= 2;           // 助詞はなるべく前に残す
    if (n && (n + tok.length > maxLen || (n >= target && !attachable))) flush();
    cur += tok;
  });
  flush();
  if (cur) { if (pieces.length) pieces[pieces.length - 1] += cur; else pieces.push(cur); }
  for (var i = pieces.length - 1; i >= 0 && pieces.length > 1; i--) {   // 1字だけの切れ端を残さない
    if (plain(pieces[i]).length > 1) continue;
    if (i > 0) { pieces[i - 1] += pieces[i]; pieces.splice(i, 1); }
    else { pieces[1] = pieces[0] + pieces[1]; pieces.splice(0, 1); }
  }
  return pieces;
}

// ひとまとめにする語の内側にある文節境界を消す
// 辞書が漢字表記しか知らず、ひらがなで書くと誤って割られやすい語（じぶん → はじ／ぶん など）。
// 内側では切らず、直前が助詞か仮名以外なら語の頭で切る
var HIRA_WORDS = 'じぶん ともだち からだ きもち あたま まっくら まっさお まっしろ ほんとう いっしょ ひとり ふたり みんな こども おとな わたし あなた'.split(' ');
var RE_SMALL_KANA = /^[ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶー]/;
function protect(phrases, terms) {
  if (phrases.length < 2 && !phrases.some(function (p) { return HIRA_WORDS.some(function (w) { return p.indexOf(w) > 0; }); })) return phrases;
  var text = phrases.join(''), cuts = new Set(), pos = 0;
  for (var i = 0; i < phrases.length - 1; i++) { pos += phrases[i].length; cuts.add(pos); }
  terms.forEach(function (term) {
    for (var s = text.indexOf(term); s >= 0; s = text.indexOf(term, s + 1)) {
      for (var b = s + 1; b < s + term.length; b++) cuts.delete(b);
    }
  });
  HIRA_WORDS.forEach(function (w) {
    for (var s = text.indexOf(w); s >= 0; s = text.indexOf(w, s + 1)) {
      for (var b = s + 1; b < s + w.length; b++) cuts.delete(b);
      var before = s > 0 ? text[s - 1] : '';
      if (s > 0 && (!/[\u3041-\u3096]/.test(before) || /[はがをにのもとでへや]/.test(before))) cuts.add(s);
    }
  });
  cuts.forEach(function (c) { if (RE_SMALL_KANA.test(text.slice(c))) cuts.delete(c); });   // 小書きの仮名や長音の前では切らない
  var out = [], prev = 0;
  Array.from(cuts).sort(function (a, b) { return a - b; }).forEach(function (c) { out.push(text.slice(prev, c)); prev = c; });
  out.push(text.slice(prev));
  return out;
}

// 本文中でいつも同じ並びで出てくる「語＋次の語」を、固有名詞などの候補として拾う。
// 文節の切れ方は前後の文脈で変わるので、文節境界をまたぐ並びを候補にして、回数は本文全体の文字列で数える
function countOcc(text, s) {
  var n = 0;
  for (var i = text.indexOf(s); i >= 0; i = text.indexOf(s, i + s.length)) n++;
  return n;
}
function detectTerms(text, parser) {
  var RE_WORD = /^[\u3041-\u30ff\u4e00-\u9fff々]+$/;
  var cands = {};
  text.split(/\s+/).forEach(function (part) {
    if (!part) return;
    var ph = parser.parse(part);
    for (var i = 0; i < ph.length - 1; i++) {
      var left = ph[i];
      if (/[はがをにでともへやの]$/.test(left)) continue;
      var head = tokenize(ph[i + 1])[0] || '';
      if (head.length < 2 || !RE_WORD.test(head) || (RE_HIRA.test(head) && head.length < 3)) continue;
      var toks = tokenize(left), suf = '';
      for (var k = toks.length - 1; k >= 0 && k >= toks.length - 3; k--) {   // 左側は語の切れ目に沿って1〜3語ぶん
        if (!RE_WORD.test(toks[k])) break;
        suf = toks[k] + suf;
        if (suf.length > 8) break;
        if (suf.length < 2) continue;
        var key = suf + '\u0000' + head;
        cands[key] = (cands[key] || 0) + 1;
      }
    }
  });
  var found = [];
  var sufCount = {};
  Object.keys(cands).sort(function (a, b) { return a.length - b.length; }).forEach(function (key) {
    if (cands[key] < 2) return;   // 文節境界をまたいで2回以上出たものだけを数える（長い本で遅くならないように）
    var suf = key.split('\u0000')[0], term = key.replace('\u0000', '');
    if (found.some(function (f) { return term.indexOf(f) >= 0; })) return;   // 短い形がすでに採用済み
    var total = countOcc(text, term);
    if (total < 3) return;
    if (!(suf in sufCount)) sufCount[suf] = countOcc(text, suf);
    if (total / sufCount[suf] >= 0.8) found.push(term);
  });
  return found;
}

function segmentBunsetsu(text, maxLen, opts) {
  var chunks = [];
  var terms = (opts.terms || []).filter(function (t) { return t.length > 1; });
  opts.detected = opts.auto ? detectTerms(text, opts.parser) : [];
  terms = terms.concat(opts.detected);
  text.split(/\n+/).forEach(function (line) {
    var phrases = [];
    line.split(/\s+/).forEach(function (part) {
      if (!part) return;
      protect(opts.parser.parse(part), terms).forEach(function (ph) {
        if (!ph) return;
        var last = phrases.length ? phrases[phrases.length - 1] : '';
        if ((RE_STOP.test(ph) || RE_CLOSE.test(ph)) && last) phrases[phrases.length - 1] += ph;
        else if (last && RE_OPEN.test(last)) phrases[phrases.length - 1] += ph;
        else phrases.push(ph);
      });
    });
    var joined = phrases.map(function (ph) { return { t: ph, first: ph, last: ph }; });
    if (opts.merge) {
      // 切れ目の弱い境界から順につなげ、目安の重さに収まるかぎり続ける
      // 長い本でも速いよう、各文節の重さと境界の強さは覚えておき、つなげた周りだけ計算し直す
      var wts = joined.map(function (j) { return weight(j.t); });
      var bnd = joined.slice(0, -1).map(function (j, i) { return boundary(j.last, joined[i + 1].first); });
      for (;;) {
        var best = -1, bestS = Infinity, bestW = Infinity;
        for (var i = 0; i < bnd.length; i++) {
          var s = bnd[i];
          if (s === Infinity || s > bestS) continue;
          var w = wts[i] + wts[i + 1];
          if (w > (s >= 2 ? maxLen * 0.75 : maxLen)) continue;
          if (s < bestS || w < bestW) { best = i; bestS = s; bestW = w; }
        }
        if (best < 0) break;
        joined[best].t += joined[best + 1].t;
        joined[best].last = joined[best + 1].last;
        joined.splice(best + 1, 1);
        wts.splice(best, 2, wts[best] + wts[best + 1]);
        bnd.splice(best, 1);   // つなげた境界を消す。左右の境界は文節の端が変わらないので強さも同じ
      }
      // ごく短い区切りが残ったら、目安を少し超えてでも隣に寄せる
      for (var k = 0; k < joined.length; k++) {
        if (joined.length < 2 || weight(joined[k].t) > 2.4) continue;
        var sl = k > 0 ? boundary(joined[k - 1].last, joined[k].first) : Infinity;
        var sr = k < joined.length - 1 ? boundary(joined[k].last, joined[k + 1].first) : Infinity;
        var wl = k > 0 ? weight(joined[k - 1].t) : Infinity, wr = k < joined.length - 1 ? weight(joined[k + 1].t) : Infinity;
        var lim = maxLen * 1.25 - weight(joined[k].t);
        var okL = sl !== Infinity && wl <= lim, okR = sr !== Infinity && wr <= lim;
        if (!okL && !okR) continue;
        var left = okL && (!okR || sl < sr || (sl === sr && wl <= wr));
        var at = left ? k - 1 : k;
        joined[at].t += joined[at + 1].t; joined[at].last = joined[at + 1].last; joined.splice(at + 1, 1);
        k = Math.max(-1, at - 1);
      }
    }
    // 1字だけの区切り（「だ」「し、」など）は、目安を超えても前の区切りに付ける
    for (var q = 0; q < joined.length; q++) {
      if (joined.length < 2 || plain(joined[q].t).length > 1) continue;
      var canL = q > 0 && !/[。．！？!?…]$/.test(joined[q - 1].t);
      var canR = q < joined.length - 1 && !/[、。，．！？!?…‥,.;；:：]$/.test(joined[q].t);
      if (!canL && !canR) continue;
      var to = canL ? q - 1 : q;
      joined[to].t += joined[to + 1].t; joined[to].last = joined[to + 1].last; joined.splice(to + 1, 1);
      q = Math.max(-1, to - 1);
    }
    var start = chunks.length;
    joined.forEach(function (j) {
      if (weight(j.t) > maxLen * 1.25) splitLong(j.t, Math.ceil(maxLen * 1.25), terms).forEach(function (p) { chunks.push({ t: p, para: false }); });
      else chunks.push({ t: j.t, para: false });
    });
    if (chunks.length > start) chunks[chunks.length - 1].para = true;
  });
  return chunks;
}

// ---- 品詞モード: 形態素解析（kuromoji）の結果から文節を組み立てる ----
// 自立語で新しい文節を始め、助詞・助動詞・接尾辞・非自立語・記号は前に付ける
function posPhrases(tokens) {
  var out = [], cur = '', prev = null;
  tokens.forEach(function (t) {
    var pos = t.pos, d1 = t.pos_detail_1, s = t.surface_form;
    var attach;
    if (!cur) attach = false;
    else if (pos === '記号') attach = d1 !== '括弧開';
    else if (pos === '助詞' || pos === '助動詞') attach = true;
    else if (d1 === '非自立' || d1 === '接尾') attach = true;
    else if (prev && prev.pos === '接頭詞') attach = true;
    else if (prev && prev.surface_form === '・' && pos === '名詞') attach = true;                // ドルフィン・ホテル
    else if (prev && prev.pos === '名詞' && pos === '名詞'
      && !/代名詞|副詞可能/.test(prev.pos_detail_1) && !/代名詞|副詞可能/.test(d1)) attach = true; // 複合名詞（泊まり客）
    else if (prev && prev.pos_detail_1 === 'サ変接続' && t.basic_form === 'する') attach = true;   // 勉強する
    else attach = false;
    if (attach) cur += s;
    else { if (cur) out.push(cur); cur = s; }
    prev = t;
  });
  if (cur) out.push(cur);
  return out;
}

function segment(text, mode, maxLen, opts) {
  if ((mode === 'bunsetsu' || mode === 'pos') && opts && opts.parser) return segmentBunsetsu(text, maxLen, opts);
  var chunks = [];           // {t: 文字列, para: 段落末か}
  var cur = '', open = '';
  function flush() { if (cur) { chunks.push({ t: cur, para: false }); cur = ''; } }
  function start(tok) { cur = open + tok; open = ''; }

  if (mode === 'fixed') {
    var chars = Array.from(text);
    for (var i = 0; i < chars.length; i++) {
      var c = chars[i];
      if (c === '\n') { flush(); if (chunks.length) chunks[chunks.length - 1].para = true; continue; }
      if (/\s/.test(c)) continue;
      cur += c;
      var nx = chars[i + 1] || '';
      if (plainLen(cur) >= maxLen && !RE_STOP.test(nx) && !RE_CLOSE.test(nx) && !RE_OPEN.test(c)) flush();
    }
    flush();
    return chunks;
  }

  var toks = tokenize(text);
  for (var k = 0; k < toks.length; k++) {
    var tok = toks[k];
    if (/\n/.test(tok)) { flush(); if (chunks.length) chunks[chunks.length - 1].para = true; continue; }
    if (/^\s+$/.test(tok)) { flush(); continue; }
    if (RE_OPEN.test(tok)) { flush(); open += tok; continue; }
    if (RE_STOP.test(tok) || RE_CLOSE.test(tok)) {
      if (cur) cur += tok;
      else if (chunks.length && !chunks[chunks.length - 1].para && !open) chunks[chunks.length - 1].t += tok;
      else start(tok);
      if (RE_STOP.test(tok)) flush();
      continue;
    }
    // 1語が上限より長いときは機械的に割る
    if (tok.length > maxLen && !RE_LATIN_WORD.test(tok)) {   // 欧文の単語は割らない
      flush();
      var arr = Array.from(tok);
      while (arr.length > maxLen) { start(arr.splice(0, maxLen).join('')); flush(); }
      start(arr.join(''));
      continue;
    }
    var attach = false;
    if (cur && mode === 'bunsetsu') {
      var body = cur.slice(open.length ? 0 : 0);
      if (RE_HIRA.test(tok) && !INDEP.has(tok)) attach = true;                        // 助詞・助動詞・活用語尾
      else if (RE_DIGIT_END.test(cur)) attach = true;                                  // 3+人、2026+年
      else if (RE_KANJI1.test(tok) && RE_KANJI_END.test(cur) && !RE_HAS_HIRA.test(body)) attach = true; // 接尾の1字（的・性・化…）
      else if (/^[おご]$/.test(cur.replace(/^[「『（(\[【〈《“‘]+/, ''))) attach = true;   // 接頭の お・ご
      if (/[」』）)\]】〉》”’]$/.test(cur) && !RE_HIRA.test(tok)) attach = false;
    }
    if (attach && plainLen(cur) + tok.length > maxLen) attach = false;
    if (attach) cur += tok; else { flush(); start(tok); }
  }
  if (open) { cur += open; open = ''; }
  flush();
  return chunks;
}

// 1区切りの表示時間（ミリ秒）
function duration(chunk, cpm, pauseScale) {
  var per = 60000 / cpm;
  var ms = Math.max(250 * 900 / cpm, plainLen(chunk.t) * per * 0.85);   // 下限は毎分900字のとき250msで、速度に反比例。字数比例ぶんは0.85倍
  var extra = 0;
  if (/[。．！？!?…]/.test(chunk.t.slice(-2))) extra = per * 2.5;
  else if (/[、，,;；]$/.test(chunk.t)) extra = per * 1.25;
  if (chunk.para) extra = per * 4;
  return ms + extra * pauseScale;
}
// ---- 青空文庫形式のテキストを読める本文にする（ルビ・注記・底本情報を取り除く） ----
// JIS X 0213 の面区点でしか示されていない外字は、ブラウザ内では引けないので〓にする
function isAozora(raw) { return /《[^》\n]+》|［＃[^］\n]*］|\n底本：/.test(raw); }
function aozoraClean(raw) {
  raw = raw.replace(/\r\n?/g, '\n');
  // 1行目が題名・2行目が著者になるのは、配布ファイルそのまま（記号説明の囲みか底本情報がある）のときだけ
  var whole = /\n-{20,}\n/.test(raw) || /\n底本：/.test(raw);
  var lines = raw.split('\n');
  var title = whole ? (lines[0] || '').trim() : '', author = whole ? (lines[1] || '').trim() : '';
  var body = whole ? lines.slice(2).join('\n') : raw;
  var parts = body.split(/\n-{20,}\n/);
  if (parts.length >= 3 && /記号/.test(parts[1])) body = parts.slice(2).join('\n');
  var m = body.match(/\n\n+底本：/);
  var colophon = '';
  if (m) { colophon = body.slice(m.index).trim(); body = body.slice(0, m.index); }
  body = body.replace(/※［＃([^］]*)］/g, function (_, note) {
    var u = note.match(/U\+([0-9A-Fa-f]{4,6})/);
    if (u) return String.fromCodePoint(parseInt(u[1], 16));
    var s = note.match(/小書き(?:平仮名|片仮名)(.)/);
    if (s) return s[1];
    return '〓';
  });
  body = body.replace(/［＃[^］]*］/g, '')
    .replace(/[ \t　]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+|\n+$/g, '');
  var r = extractRuby(body);
  return { title: title, author: author, text: r.text, colophon: colophon, ruby: r.ruby };
}
// ルビを取り除き、[開始, 終了, 読み] の一覧にする（build/aozora_books.py と同じ規則）
function rubyClass(c) {
  if (/[\u4e00-\u9fff\u3400-\u4dbf々〆〇ヶ仝〻〓\ud800-\udfff]/.test(c)) return 'kanji';   // 〓（引けなかった外字）と拡張漢字（サロゲート）も漢字扱い
  if (/[\u30a1-\u30faー]/.test(c)) return 'kata';
  if (/[\u3041-\u3096]/.test(c)) return 'hira';
  if (/[A-Za-z0-9Ａ-Ｚａ-ｚ０-９À-ɏ]/.test(c)) return 'latin';
  return null;
}
function extractRuby(text) {
  var re = /｜([^《｜\n]*)《([^》\n]*)》|《([^》\n]*)》/g, out = '', ruby = [], last = 0, floor = 0, m;
  while ((m = re.exec(text))) {
    out += text.slice(last, m.index); last = re.lastIndex;
    if (m[1] !== undefined) {   // ｜親文字《読み》
      var pre = out.length; out += m[1]; floor = out.length;
      if (m[1]) ruby.push([pre, out.length, m[2]]);
    } else {                    // 親文字《読み》: 直前の同じ字種の連なりが親文字
      var k = out.length, cls = k ? rubyClass(out[k - 1]) : null;
      while (k > floor && cls && rubyClass(out[k - 1]) === cls) k--;
      if (k < out.length) ruby.push([k, out.length, m[3]]);
      floor = out.length;
    }
  }
  out += text.slice(last);
  return { text: out.replace(/｜/g, ''), ruby: ruby };
}
if (typeof module !== 'undefined') module.exports = { segment: segment, duration: duration, posPhrases: posPhrases, aozoraClean: aozoraClean, isAozora: isAozora, extractRuby: extractRuby };
