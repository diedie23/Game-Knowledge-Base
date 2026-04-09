"""
批量注入 editor-kit.js 到知识库 HTML 文档
只处理知识文档（.doc 骨架的），跳过工具类（.app 骨架）和已注入的
"""
import os, re, glob

KB_DIR = r"H:\游戏项目知识库\docs\knowledge-base"
INJECT_LINE = '<script src="editor-kit.js"></script>'
INJECT_LINE_SUB = '<script src="../editor-kit.js"></script>'  # 子目录用

# 跳过这些文件（工具类 / 特殊页面 / 已手动处理的）
SKIP_FILES = {
    'index.html',        # 门户首页（有自己的 JS 逻辑）
    'md-viewer.html',    # Markdown 阅读器
    'Blank_Template.html',  # 模板（已注入）
    'editor-guide.html',    # 使用指南（已注入）
    'placeholder.html',     # 占位页
}

# 工具类页面（有 <script> 且是 .app 骨架的），也注入但要小心位置
count = 0
skipped = 0

for fpath in glob.glob(os.path.join(KB_DIR, "**", "*.html"), recursive=True):
    fname = os.path.basename(fpath)
    rel = os.path.relpath(fpath, KB_DIR)
    
    if fname in SKIP_FILES:
        print(f"  SKIP (exclude list): {rel}")
        skipped += 1
        continue
    
    with open(fpath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 已经注入过的跳过
    if 'editor-kit.js' in content:
        print(f"  SKIP (already injected): {rel}")
        skipped += 1
        continue
    
    # 确定注入行（子目录需要 ../）
    is_subdir = os.path.dirname(rel) != ''
    line = INJECT_LINE_SUB if is_subdir else INJECT_LINE
    
    # 在 </body> 前注入
    if '</body>' in content:
        content = content.replace('</body>', line + '\n</body>')
        with open(fpath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"  [OK] INJECTED: {rel}")
        count += 1
    else:
        print(f"  [WARN] NO </body> FOUND: {rel}")

print(f"\n=== Done: {count} files injected, {skipped} skipped ===")
