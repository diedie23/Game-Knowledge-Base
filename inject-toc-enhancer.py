"""
批量注入 toc-enhancer.js 到所有知识库 HTML 文档
条件：文件中包含 class="toc" 且尚未引入 toc-enhancer.js
"""
import os
import re

KB_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'docs', 'knowledge-base')
SCRIPT_TAG = '<script src="toc-enhancer.js"></script>'

count = 0
skipped = 0

for fname in sorted(os.listdir(KB_DIR)):
    if not fname.endswith('.html'):
        continue
    fpath = os.path.join(KB_DIR, fname)
    with open(fpath, 'r', encoding='utf-8') as f:
        content = f.read()

    # 跳过没有 TOC 的文件
    if 'class="toc"' not in content:
        continue

    # 跳过已注入的文件
    if 'toc-enhancer.js' in content:
        skipped += 1
        continue

    # 在 </body> 前插入 script 标签
    if '</body>' in content:
        content = content.replace('</body>', f'{SCRIPT_TAG}\n</body>')
    else:
        content += f'\n{SCRIPT_TAG}\n'

    with open(fpath, 'w', encoding='utf-8') as f:
        f.write(content)

    count += 1
    print(f'  [OK] {fname}')

print(f'\nDone! Injected: {count}, Skipped: {skipped}')
