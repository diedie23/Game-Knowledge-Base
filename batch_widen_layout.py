"""
batch_widen_layout.py
批量将 knowledge-base 下所有 HTML 文件的 .doc{max-width:960px} 改为 .doc{max-width:1200px}
"""
import os
import re
import glob
import sys
import io

# 修复 Windows GBK 编码问题
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'docs', 'knowledge-base')

# 搜索所有 HTML 文件（包括子目录）
patterns = [
    os.path.join(BASE, '*.html'),
    os.path.join(BASE, '**', '*.html'),
]

files = set()
for p in patterns:
    files.update(glob.glob(p, recursive=True))

# 排除工具页（独立运行的页面，不含 .doc 类）
SKIP_TOOLS = {'auto-mask.html', 'channel-packer.html', 'spine-split.html',
              'mask-tool.html', 'mask-core-algorithms.html',
              'game-resource-toolkit-online.html', 'image-skew-corrector-online.html',
              'md-viewer.html', 'index.html', 'placeholder.html'}

modified = 0
skipped = 0
errors = 0

for fpath in sorted(files):
    fname = os.path.basename(fpath)
    if fname in SKIP_TOOLS:
        print(f'[SKIP] {fname} (tool/special page)')
        skipped += 1
        continue

    try:
        with open(fpath, 'r', encoding='utf-8') as f:
            content = f.read()

        # 替换 .doc{max-width:960px 为 .doc{max-width:1200px
        new_content = content.replace(
            '.doc{max-width:960px',
            '.doc{max-width:1200px'
        )

        if new_content != content:
            with open(fpath, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f'[OK] {fname}: 960px -> 1200px')
            modified += 1
        else:
            # 检查是否已经是1200px
            if '.doc{max-width:1200px' in content:
                print(f'[SKIP] {fname} (already 1200px)')
                skipped += 1
            else:
                print(f'[SKIP] {fname} (no .doc{{max-width:960px}} found)')
                skipped += 1
    except Exception as e:
        print(f'[ERR] {fname}: {e}')
        errors += 1

print(f'\n=== DONE ===')
print(f'Modified: {modified}')
print(f'Skipped:  {skipped}')
print(f'Errors:   {errors}')
