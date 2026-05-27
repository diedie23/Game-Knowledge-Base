"""
恢复 .doc 的 padding-left 为 40px，max-width 恢复为 1400px
之前错误地把整体内容右移了 120px，现在改为只让外层 .main 和侧边栏之间有间距
"""
import os, re, glob

docs_dir = r"h:\游戏项目知识库\docs\knowledge-base"
pattern = re.compile(
    r'\.doc\{max-width:\s*1100px;\s*margin:\s*0 auto;\s*padding:\s*32px 28px 32px 120px\}'
)
replacement = '.doc{max-width:1400px;margin:0 auto;padding:32px 40px}'

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
