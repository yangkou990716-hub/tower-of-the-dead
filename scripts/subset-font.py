#!/usr/bin/env python3
"""把 Noto Serif CJK TC 裁成只含遊戲用到的字，輸出 woff2（離線、免 CDN）。
用法：python3 scripts/subset-font.py   （新增文字內容後重跑一次即可）
字型授權：SIL Open Font License 1.1（可自由再散布）。"""
import glob, os, sys
from fontTools.ttLib import TTCollection
from fontTools import subset

SRC_DIR = '/usr/share/fonts/opentype/noto'
WEIGHTS = {'500': 'NotoSerifCJK-Medium.ttc', '900': 'NotoSerifCJK-Black.ttc'}
chars = set(chr(c) for c in range(0x20, 0x7f))
chars |= set('　、。，．・：；？！「」『』（）〔〕【】《》〈〉—…～％＋－×÷＝→←↑↓·“”‘’')
for path in glob.glob('src/**/*.ts', recursive=True) + glob.glob('src/**/*.css', recursive=True) + ['index.html', 'vite.config.ts']:
    with open(path, encoding='utf-8') as f:
        chars |= set(ch for ch in f.read() if ord(ch) > 0x7f)
chars = sorted(c for c in chars if c not in '\n\r\t')
os.makedirs('public/fonts', exist_ok=True)
for w, fn in WEIGHTS.items():
    src = os.path.join(SRC_DIR, fn)
    if not os.path.exists(src):
        print('找不到來源字型', src, '（略過；沿用 public/fonts 內既有檔案）'); continue
    col = TTCollection(src)
    font = next(f for f in col.fonts if any('TC' in str(n) for n in f['name'].names if n.nameID in (1, 4)))
    opts = subset.Options(); opts.flavor = 'woff2'; opts.layout_features = ['*']; opts.name_IDs = [1, 2, 4, 6]; opts.notdef_outline = True; opts.desubroutinize = True
    s = subset.Subsetter(opts); s.populate(text=''.join(chars)); s.subset(font)
    out = f'public/fonts/tower-serif-{w}.woff2'; font.flavor = 'woff2'; font.save(out)
    print(out, os.path.getsize(out) // 1024, 'KB', len(chars), 'chars')
