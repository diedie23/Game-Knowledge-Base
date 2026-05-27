"""
将所有 knowledge-base HTML 文件的 .doc 容器左侧 padding 从 64px 增大到 100px
"""
import os, re, glob

KB_DIR = r"h:\游戏项目知识库\docs\knowledge-base"
pattern = re.compile(r'(\.doc\{[^}]*padding:\s*)(\d+px\s+\d+px\s+\d+px\s+)\d+px', re.IGNORECASE)

count = 0
for f in glob.glob(os.path.join(KB_DIR, "*.html")):
    with open(f, 'r', encoding='utf-8') as fh:
        content = fh.read()
    
    new_content, n = pattern.subn(r'\g<1>\g<2>100px', content)
    if n > 0:
        with open(f, 'w', encoding='utf-8') as fh:
            fh.write(new_content)
        count += 1
        print(f"  OK: {os.path.basename(f)}")

print(f"\nDone: updated {count} files, left padding = 100px")
