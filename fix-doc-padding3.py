"""批量将 .doc 容器左侧 padding 从 48px 增大到 64px"""
import re, glob, os

html_dir = r"h:\游戏项目知识库\docs\knowledge-base"
pattern = os.path.join(html_dir, "*.html")
count = 0

for f in glob.glob(pattern):
    with open(f, 'r', encoding='utf-8') as fh:
        content = fh.read()
    
    original = content
    
    # 替换 padding:32px 28px 32px 48px -> padding:32px 28px 32px 64px
    content = content.replace(
        'padding:32px 28px 32px 48px',
        'padding:32px 28px 32px 64px'
    )
    
    # 也处理 padding:16px 的情况（ui-workflow-sync.html）
    # 这个比较特殊，用正则匹配 .doc{...padding:16px...}
    content = re.sub(
        r'(\.doc\{[^}]*?)padding:\s*16px',
        r'\1padding:32px 28px 32px 64px',
        content
    )
    
    # 处理可能的其他 padding:32px 24px (如果遗漏的)
    content = content.replace(
        'padding:32px 24px',
        'padding:32px 28px 32px 64px'
    )
    
    if content != original:
        with open(f, 'w', encoding='utf-8') as fh:
            fh.write(content)
        count += 1
        print(f"  OK: {os.path.basename(f)}")

print(f"\nDone: updated {count} files, left padding = 64px")
