"""
将 .doc 改为居中布局：max-width:1200px, margin:0 auto, padding:32px 48px
左右 padding 对称，内容自然居中
"""
import os, re, glob

docs_dir = r"h:\游戏项目知识库\docs\knowledge-base"
pattern = re.compile(
    r'\.doc\{max-width:\s*1400px;\s*margin:\s*0 auto;\s*padding:\s*32px 40px\}'
)
replacement = '.doc{max-width:1200px;margin:0 auto;padding:32px 48px}'

count = 0
for f in glob.glob(os.path.join(docs_dir, "*.html")):
    with open(f, "r", encoding="utf-8") as fh:
        content = fh.read()
    if pattern.search(content):
        new_content = pattern.sub(replacement, content)
        with open(f, "w", encoding="utf-8") as fh:
            fh.write(new_content)
        count += 1
        print(f"  OK: {os.path.basename(f)}")

print(f"\nDone: {count} files updated")
