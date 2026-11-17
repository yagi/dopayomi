# 青空文庫のテキスト（Shift_JIS、ルビ・注記つき）から、同梱用のプレーンテキストと一覧を作る。
# 使い方: python3 build/aozora_books.py <元テキストを置いたフォルダ>
# 元テキストは aozorahack/aozorabunko_text の cards/<作家番号>/files/<ファイル名>/<ファイル名>.txt
import json, os, re, sys

BOOKS = [  # (id, 作家番号, ファイル名)
    ('rashomon', '000879', '127_ruby_150'),
    ('kumonoito', '000879', '92_ruby_164'),
    ('hashiremerosu', '000035', '1567_ruby_4948'),
    ('sangetsuki', '000119', '624_ruby_5668'),
    ('chumon', '000081', '43754_ruby_17594'),
    ('yumejuya', '000148', '799_ruby_6024'),
    ('gingatetsudo', '000081', '456_ruby_145'),
    ('gongitsune', '000121', '628_ruby_649'),
    ('remon', '000074', '424_ruby_19825'),
    ('kagakushatoatama', '000042', '2359_ruby_4688'),
]

def jis0213(plane, row, cell):
    b = bytes([0xA0 + row, 0xA0 + cell])
    if plane == 2: b = b'\x8f' + b
    try: return b.decode('euc_jis_2004')
    except UnicodeDecodeError: return None

def gaiji(m):
    note = m.group(1)
    u = re.search(r'U\+([0-9A-Fa-f]{4,6})', note)
    if u: return chr(int(u.group(1), 16))
    j = re.search(r'第[34]水準(\d)-(\d+)-(\d+)', note) or re.search(r'(\d)-(\d+)-(\d+)', note)
    if j:
        c = jis0213(int(j.group(1)), int(j.group(2)), int(j.group(3)))
        if c: return c
    s = re.match(r'小書き(?:平仮名|片仮名)(.)', note)
    if s: return s.group(1)
    return '〓'

def clean(raw):
    lines = raw.replace('\r\n', '\n').split('\n')
    title, author = lines[0].strip(), lines[1].strip()
    body = '\n'.join(lines[2:])
    # 冒頭の「テキスト中に現れる記号について」の囲みを外す
    parts = re.split(r'\n-{20,}\n', body)
    if len(parts) >= 3 and '記号' in parts[1]: body = '\n'.join(parts[2:])
    # 末尾の底本情報を分ける
    m = re.search(r'\n\n+底本：', body)
    colophon = ''
    if m: colophon, body = body[m.start():].strip(), body[:m.start()]
    body = re.sub(r'※［＃([^］]*)］', gaiji, body)
    body = re.sub(r'［＃[^］]*］', '', body)              # そのほかの注記（字下げ、傍点など）
    body = re.sub(r'[ \t　]+\n', '\n', body)
    body = re.sub(r'\n{3,}', '\n\n', body).strip('\n')
    body, ruby = extract_ruby(body)
    return title, author, body, colophon, ruby

# ルビを取り除き、[開始, 終了, 読み] の一覧にする。位置はブラウザの文字列と同じ UTF-16 の単位で数える
RE_RUBY = re.compile(r'｜([^《｜\n]*)《([^》\n]*)》|《([^》\n]*)》')
def char_class(c):
    o = ord(c)
    if 0x4E00 <= o <= 0x9FFF or 0x3400 <= o <= 0x4DBF or o >= 0x20000 or c in '々〆〇ヶ仝〻': return 'kanji'
    if 0x30A1 <= o <= 0x30FA or c == 'ー': return 'kata'
    if 0x3041 <= o <= 0x3096: return 'hira'
    if c.isalnum(): return 'latin'
    return None
def u16(s): return len(s.encode('utf-16-le')) // 2
def extract_ruby(text):
    out, ruby, last, floor = [], [], 0, 0   # floor: 直前のルビの終わり。親文字はそれより前に伸ばさない
    for m in RE_RUBY.finditer(text):
        out.append(text[last:m.start()]); last = m.end()
        if m.group(1) is not None:          # ｜親文字《読み》
            pre = u16(''.join(out)); out.append(m.group(1)); floor = len(''.join(out))
            if m.group(1): ruby.append([pre, pre + u16(m.group(1)), m.group(2)])
        else:                               # 親文字《読み》: 直前の同じ字種の連なりが親文字
            done = ''.join(out); out = [done]
            k = len(done); cls = char_class(done[-1]) if done else None
            while k > floor and cls and char_class(done[k - 1]) == cls: k -= 1
            if k < len(done): ruby.append([u16(done[:k]), u16(done), m.group(3)])
            floor = len(done)
    out.append(text[last:])
    return ''.join(out).replace('｜', ''), ruby

src = sys.argv[1]
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
out = os.path.join(root, 'books')
os.makedirs(out, exist_ok=True)
index = []
for bid, card, fname in BOOKS:
    raw = open(os.path.join(src, 'cards', card, 'files', fname, fname + '.txt'), 'rb').read().decode('shift_jis_2004')
    title, author, body, colophon, ruby = clean(raw)
    open(os.path.join(out, bid + '.txt'), 'w', encoding='utf-8').write(body + '\n')
    json.dump(ruby, open(os.path.join(out, bid + '.ruby.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    index.append({'id': bid, 'title': title, 'author': author, 'chars': len(re.sub(r'\s', '', body)),
                  'card': 'https://www.aozora.gr.jp/cards/%s/card%s.html' % (card, fname.split('_')[0]),
                  'colophon': colophon})
json.dump(index, open(os.path.join(out, 'index.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
for b in index: print(b['id'], b['title'], b['author'], b['chars'], len(json.load(open(os.path.join(out, b['id'] + '.ruby.json')))), 'ruby')
