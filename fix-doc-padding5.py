"""
fix-doc-padding5.py
将所有 knowledge-base HTML 文件中的 .doc 容器样式更新：
- max-width: 1400px → 1100px（让内容在宽屏上居中，左右都有留白）
- padding-left: 100px → 120px
"""
import re, glob, os

folder = r"h:\游戏项目知识库\docs\knowledge-base"
pattern = os.path.join(folder, "*.html")
files = glob.glob(pattern)

count = 0
for f in files:
    with open(f, "r", encoding="utf-8") as fp:
        content = fp.read()
    
    # 匹配 .doc{...} 样式块
    # 可能的格式: .doc{max-width:1400px;margin:0 auto;padding:32px 28px 32px 100px}
    # 或者: .doc{max-width:1400px;margin:0 auto;padding:32px 28px 32px 64px}
    new_content = re.sub(
        r'\.doc\{([^}]*?)max-width:\s*\d+px([^}]*?)padding:\s*(\d+px)\s+(\d+px)\s+(\d+px)\s+(\d+px)',
        lambda m: f'.doc{{{m.group(1)}max-width:1100px{m.group(2)}padding:{m.group(3)} {m.group(4)} {m.group(5)} 120px',
        content
    )
    
    if new_content != content:
        with open(f, "w", encoding="utf-8") as fp:
            fp.write(new_content)
        count += 1
        print(f"  OK: {os.path.basename(f)}")

print(f"\n共更新 {count} 个文件")
