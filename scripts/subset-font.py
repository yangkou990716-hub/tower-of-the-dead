#!/usr/bin/env python3
"""把「霞鶩文楷 TC」裁成只含遊戲用到的字，輸出 woff2（離線、免 CDN）。
用法：python3 scripts/subset-font.py   （新增文字內容後重跑一次即可；需要 fonttools、brotli）
來源字型不在版本庫裡（太大），缺少時會自動從 google/fonts 下載到 .fonts-src/。
字型授權：SIL Open Font License 1.1（可自由再散布）。"""
import glob, os, urllib.request
from fontTools.ttLib import TTFont
from fontTools import subset

SRC = '.fonts-src'
BASE = 'https://raw.githubusercontent.com/google/fonts/main/ofl/lxgwwenkaitc/'
WEIGHTS = {'400': 'LXGWWenKaiTC-Regular.ttf', '700': 'LXGWWenKaiTC-Bold.ttf'}
chars = set(chr(c) for c in range(0x20, 0x7f))
chars |= set('　、。，．・：；？！「」『』（）〔〕【】《》〈〉—…～％＋－×÷＝→←↑↓·“”‘’一二三四五六七八九十百千')
for path in glob.glob('src/**/*.ts', recursive=True) + glob.glob('src/**/*.css', recursive=True) + ['index.html', 'vite.config.ts']:
    with open(path, encoding='utf-8') as f:
        chars |= set(ch for ch in f.read() if ord(ch) > 0x7f)
chars = sorted(c for c in chars if c not in '\n\r\t')
os.makedirs('public/fonts', exist_ok=True); os.makedirs(SRC, exist_ok=True)
for w, fn in WEIGHTS.items():
    src = os.path.join(SRC, fn)
    if not os.path.exists(src):
        print('下載', fn); urllib.request.urlretrieve(BASE + fn, src)
    font = TTFont(src)
    opts = subset.Options(); opts.flavor = 'woff2'; opts.layout_features = ['vert', 'vrt2', 'kern', 'liga']; opts.name_IDs = [1, 2, 4, 6]; opts.notdef_outline = True; opts.hinting = False
    s = subset.Subsetter(opts); s.populate(text=''.join(chars)); s.subset(font)
    out = f'public/fonts/tower-kai-{w}.woff2'; font.flavor = 'woff2'; font.save(out)
    print(out, os.path.getsize(out) // 1024, 'KB', len(chars), 'chars')
