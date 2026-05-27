# -*- coding: utf-8 -*-
"""Fix remaining files with different max-width but same padding issue."""
import os
import re

docs_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'docs', 'knowledge-base')
count = 0

# Match .doc{max-width:NNNpx;margin:0 auto;padding:32px 24px}
pattern = r'\.doc\{(max-width:\d+px;margin:0 auto;)padding:32px 24px\}'
replacement = r'.doc{\1padding:32px 28px 32px 48px}'

for fname in sorted(os.listdir(docs_dir)):
    if not fname.endswith('.html'):
        continue
    fpath = os.path.join(docs_dir, fname)
    with open(fpath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    new_content = re.sub(pattern, replacement, content, count=1)
    if new_content != content:
        with open(fpath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        count += 1
        print(f'  [OK] {fname}')

print(f'\nDone! Updated {count} files.')
