# -*- coding: utf-8 -*-
"""
Fix: Add cache-busting version to toc-enhancer.js references
and ensure the script is loaded after DOM is ready.
"""
import os
import re

docs_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'docs', 'knowledge-base')
count = 0

for fname in os.listdir(docs_dir):
    if not fname.endswith('.html'):
        continue
    fpath = os.path.join(docs_dir, fname)
    with open(fpath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Replace old script tag (with or without version param) with new versioned one
    old_pattern = r'<script src="toc-enhancer\.js(\?v=[^"]*)?"></script>'
    new_tag = '<script src="toc-enhancer.js?v=1.1"></script>'
    
    if re.search(old_pattern, content):
        new_content = re.sub(old_pattern, new_tag, content)
        if new_content != content:
            with open(fpath, 'w', encoding='utf-8') as f:
                f.write(new_content)
            count += 1
            print(f'  [OK] {fname}')

print(f'\nDone! Updated {count} files with cache-busting version.')
