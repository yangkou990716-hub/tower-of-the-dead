#!/usr/bin/env bash
# 把 Showcase 建置結果（proto-style 的 dist-proto）併進正式遊戲的 dist。
# 只複製 showcase.html 實際引用的 JS/CSS（含其相依 chunk）與 showcase/models；
# 遇到同名但內容不同的檔案就失敗，絕不覆蓋正式遊戲的檔案。
# 用法：bash scripts/merge-showcase.sh <dist-proto> <dist>
set -euo pipefail
SRC="$1"; DST="$2"
[ -f "$SRC/showcase.html" ] || { echo "找不到 $SRC/showcase.html"; exit 1; }
[ -f "$DST/index.html" ] || { echo "找不到 $DST/index.html（請先建置正式遊戲）"; exit 1; }

put() { # 複製單一檔案；目的地已有同名檔時必須內容相同
  local rel="$1"
  mkdir -p "$DST/$(dirname "$rel")"
  if [ -e "$DST/$rel" ]; then cmp -s "$SRC/$rel" "$DST/$rel" || { echo "衝突：$rel 已存在且內容不同"; exit 1; }
  else cp "$SRC/$rel" "$DST/$rel"; fi
}

# 1) showcase.html 引用的資源，再遞迴找出 JS 內 import 的其他 chunk
declare -A seen; queue=()
while read -r f; do queue+=("$f"); done < <(grep -oE 'assets/[A-Za-z0-9._-]+\.(js|css)' "$SRC/showcase.html" | sort -u)
while [ ${#queue[@]} -gt 0 ]; do
  f="${queue[0]}"; queue=("${queue[@]:1}")
  [ -n "${seen[$f]:-}" ] && continue; seen[$f]=1
  [ -f "$SRC/$f" ] || { echo "showcase 引用的 $f 不存在"; exit 1; }
  put "$f"
  if [[ "$f" == *.js ]]; then
    while read -r dep; do queue+=("assets/$dep"); done < <(grep -oE '\./[A-Za-z0-9._-]+\.(js|css)' "$SRC/$f" | sed 's#^\./##' | sort -u)
  fi
done
# 2) 模型
[ -d "$SRC/showcase/models" ] || { echo "找不到 $SRC/showcase/models"; exit 1; }
for m in "$SRC"/showcase/models/*; do put "showcase/models/$(basename "$m")"; done
# 3) 頁面
put showcase.html
echo "已併入 showcase：$(( ${#seen[@]} )) 個 JS/CSS、$(ls "$SRC/showcase/models" | wc -l) 個模型檔"
