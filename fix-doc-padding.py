# -*- coding: utf-8 -*-
"""
Fix: Increase .doc container left padding for better spacing from left frame border.
Changes: padding:32px 24px -> padding:32px 24px 32px 48px (top right bottom left)
"""
import os

docs_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'docs', 'knowledge-base')
count = 0

old_val = '.doc{max-width:1400px;margin:0 auto;padding:32px 24px}'
new_val = '.doc{max-width:1400px;margin:0 auto;padding:32px 28px 32px 48px}'

for fname in sorted(os.listdir(docs_dir)):
    if not fname.endswith('.html'):
        continue
    fpath = os.path.join(docs_dir, fname)
    with open(fpath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    if old_val in content:
        content = content.replace(old_val, new_val, 1)
        with open(fpath, 'w', encoding='utf-8') as f:
            f.write(content)
        count += 1
        print(f'  [OK] {fname}')

print(f'\nDone! Updated {count} files.')
