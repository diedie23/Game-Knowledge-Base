#!/usr/bin/env python3
"""
批量放大知识库 HTML 文档字号脚本
=======================================
目标：将所有文档页的正文字号统一升级到舒适阅读级别
- body: 添加 font-size:16px（如没有）
- .section p: 13px → 15px
- table: 12px → 14px
- .alert font-size: 12px → 14px
- code: 11px → 13px
- .faq-a: 12px → 14px
- .badge: 10px → 11px
- .toc h3 / .toc ol: 13px → 15px
- .doc-header h1: 24px → 28px
- .sub-title: 15px → 17px
- .doc-header .subtitle: 13px → 15px
- .dd-card: 12px → 14px
- .dd-card h4: 13px → 15px
- .faq-q: 14px → 16px
- .doc-footer: 11px → 12px
- .doc-header .meta: 11px → 12px
- .doc-header h1 .ver: 11px → 12px
- .section h2: 20px → 22px
- check-item: 12px → 14px
- flow-node: 11px → 13px
- flow-node strong: 12px → 14px
- flow-node .sub: 10px → 12px
- pre: 12px → 13px
- .checklist: font-size adjustments

跳过已经升级过的文件(body已有font-size:16px且.section p已 >= 15px)
跳过工具类页面(auto-mask.html, channel-packer.html, mask-tool.html, spine-split.html 等)
"""

import os
import re
import glob
import sys
import io

# 修复 Windows GBK 编码问题
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

# 知识库文档目录
BASE_DIR = r"H:\游戏项目知识库\docs\knowledge-base"

# 工具类/应用类页面，不需要调整字号（它们有自己的 UI 布局）
SKIP_FILES = {
    "auto-mask.html",
    "channel-packer.html",
    "mask-tool.html",
    "spine-split.html",
    "mask-core-algorithms.html",
    "image-skew-corrector-online.html",
    "game-resource-toolkit-online.html",
    "index.html",       # 首页有自己的 CSS 体系
    "placeholder.html",  # 占位页
    "md-viewer.html",    # Markdown 查看器
}

# 已经升级过的文件（body已有16px 且 .section p 已 >= 15px）
ALREADY_UPGRADED = {
    "aigc-production-spec.html",
    "art-vs-qa-checklist.html",
    "supplier-ecosystem.html",
    "project-pitfall-log.html",
}

def should_process(filepath):
    """判断文件是否需要处理"""
    basename = os.path.basename(filepath)
    if basename in SKIP_FILES:
        return False
    if basename in ALREADY_UPGRADED:
        return False
    return True

def upgrade_font_sizes(content, filename):
    """对单个文件内容执行字号升级替换"""
    changes = []
    original = content
    
    # ============ 1. body 添加 font-size:16px ============
    # 情况 A: body{...line-height:1.8} → body{...line-height:1.8;font-size:16px}
    # 但如果已经有 font-size 就跳过
    body_match = re.search(r'body\{([^}]*)\}', content)
    if body_match:
        body_css = body_match.group(1)
        if 'font-size' not in body_css:
            # 在 body 闭合 } 前添加 ;font-size:16px
            new_body_css = body_css.rstrip(';') + ';font-size:16px'
            content = content.replace(
                'body{' + body_css + '}',
                'body{' + new_body_css + '}',
                1
            )
            changes.append("body: 添加 font-size:16px")
    
    # ============ 2. .section p: 13px → 15px ============
    old = '.section p{font-size:13px;margin-bottom:10px}'
    new = '.section p{font-size:15px;margin-bottom:12px;line-height:1.7}'
    if old in content:
        content = content.replace(old, new)
        changes.append(".section p: 13px → 15px")
    
    # ============ 3. .section h2: 20px → 22px ============
    # 匹配 .section h2{font-size:20px;...}
    content, n = re.subn(
        r'(\.section h2\{font-size:)20px',
        r'\g<1>22px',
        content
    )
    if n: changes.append(".section h2: 20px → 22px")
    
    # ============ 4. .sub-title: 15px → 17px ============
    content, n = re.subn(
        r'(\.sub-title\{font-size:)15px',
        r'\g<1>17px',
        content
    )
    if n: changes.append(".sub-title: 15px → 17px")
    
    # ============ 5. table: 12px → 14px ============
    content, n = re.subn(
        r'(table\{[^}]*font-size:)12px',
        r'\g<1>14px',
        content
    )
    if n: changes.append("table: 12px → 14px")
    
    # ============ 6. td: 添加 line-height ============
    # td{padding:8px 12px; → td{padding:9px 12px;line-height:1.7;
    if 'td{padding:8px 12px;border:' in content:
        content = content.replace(
            'td{padding:8px 12px;border:',
            'td{padding:9px 12px;border:'
        )
    
    # ============ 7. .alert: 12px → 14px ============
    content, n = re.subn(
        r'(\.alert\{[^}]*font-size:)12px',
        r'\g<1>14px',
        content
    )
    if n: changes.append(".alert: 12px → 14px")
    
    # ============ 8. code: 11px → 13px ============
    content, n = re.subn(
        r'(code\{[^}]*font-size:)11px',
        r'\g<1>13px',
        content
    )
    if n: changes.append("code: 11px → 13px")
    
    # ============ 9. pre: 12px → 13px ============
    content, n = re.subn(
        r'(pre\{[^}]*font-size:)12px',
        r'\g<1>13px',
        content
    )
    if n: changes.append("pre: 12px → 13px")
    
    # ============ 10. .faq-a: 12px → 14px ============
    content, n = re.subn(
        r'(\.faq-a\{font-size:)12px',
        r'\g<1>14px',
        content
    )
    if n: changes.append(".faq-a: 12px → 14px")
    
    # ============ 11. .faq-q: 14px → 16px ============
    content, n = re.subn(
        r'(\.faq-q\{font-size:)14px',
        r'\g<1>16px',
        content
    )
    if n: changes.append(".faq-q: 14px → 16px")
    
    # ============ 12. .badge: 10px → 11px ============
    content, n = re.subn(
        r'(\.badge\{[^}]*font-size:)10px',
        r'\g<1>11px',
        content
    )
    if n: changes.append(".badge: 10px → 11px")
    
    # ============ 13. .toc h3: 13px → 15px ============
    content, n = re.subn(
        r'(\.toc h3\{font-size:)13px',
        r'\g<1>15px',
        content
    )
    if n: changes.append(".toc h3: 13px → 15px")
    
    # ============ 14. .toc ol: 13px → 15px ============
    content, n = re.subn(
        r'(\.toc ol\{[^}]*font-size:)13px',
        r'\g<1>15px',
        content
    )
    if n: changes.append(".toc ol: 13px → 15px")
    
    # ============ 15. .doc-header h1: 24px → 28px ============
    content, n = re.subn(
        r'(\.doc-header h1\{font-size:)24px',
        r'\g<1>28px',
        content
    )
    if n: changes.append(".doc-header h1: 24px → 28px")
    
    # ============ 16. .doc-header h1 .ver: 11px → 12px ============
    content, n = re.subn(
        r'(\.doc-header h1 \.ver\{font-size:)11px',
        r'\g<1>12px',
        content
    )
    if n: changes.append(".doc-header h1 .ver: 11px → 12px")
    
    # ============ 17. .doc-header .subtitle: 13px → 15px ============
    content, n = re.subn(
        r'(\.doc-header \.subtitle\{[^}]*font-size:)13px',
        r'\g<1>15px',
        content
    )
    if n: changes.append(".doc-header .subtitle: 13px → 15px")
    
    # ============ 18. .doc-header .meta: 11px → 12px ============
    content, n = re.subn(
        r'(\.doc-header \.meta\{[^}]*font-size:)11px',
        r'\g<1>12px',
        content
    )
    if n: changes.append(".doc-header .meta: 11px → 12px")
    
    # ============ 19. .doc-footer: 11px → 12px ============
    content, n = re.subn(
        r'(\.doc-footer\{[^}]*font-size:)11px',
        r'\g<1>12px',
        content
    )
    if n: changes.append(".doc-footer: 11px → 12px")
    
    # ============ 20. .dd-card: 12px → 14px ============
    content, n = re.subn(
        r'(\.dd-card\{[^}]*font-size:)12px',
        r'\g<1>14px',
        content
    )
    if n: changes.append(".dd-card: 12px → 14px")
    
    # ============ 21. .dd-card h4: 13px → 15px ============
    content, n = re.subn(
        r'(\.dd-card h4\{[^}]*font-size:)13px',
        r'\g<1>15px',
        content
    )
    if n: changes.append(".dd-card h4: 13px → 15px")
    
    # ============ 22. .check-item: 12px → 14px ============
    content, n = re.subn(
        r'(\.check-item\{[^}]*font-size:)12px',
        r'\g<1>14px',
        content
    )
    if n: changes.append(".check-item: 12px → 14px")
    
    # ============ 23. .flow-node: 11px → 13px ============
    content, n = re.subn(
        r'(\.flow-node\{[^}]*font-size:)11px',
        r'\g<1>13px',
        content
    )
    if n: changes.append(".flow-node: 11px → 13px")
    
    # ============ 24. .flow-node strong: 12px → 14px ============
    content, n = re.subn(
        r'(\.flow-node strong\{[^}]*font-size:)12px',
        r'\g<1>14px',
        content
    )
    if n: changes.append(".flow-node strong: 12px → 14px")
    
    # ============ 25. .flow-node .sub: 10px → 12px ============
    content, n = re.subn(
        r'(\.flow-node \.sub\{[^}]*font-size:)10px',
        r'\g<1>12px',
        content
    )
    if n: changes.append(".flow-node .sub: 10px → 12px")
    
    # ============ 26. .toc li margin: 4px → 6px ============
    if '.toc li{margin-bottom:4px}' in content:
        content = content.replace(
            '.toc li{margin-bottom:4px}',
            '.toc li{margin-bottom:6px}'
        )
        changes.append(".toc li: margin 4px → 6px")
    
    has_changes = content != original
    return content, changes, has_changes


def main():
    # 收集所有 HTML 文件
    html_files = []
    for pattern in [os.path.join(BASE_DIR, "*.html"), os.path.join(BASE_DIR, "art", "*.html")]:
        html_files.extend(glob.glob(pattern))
    
    total = len(html_files)
    processed = 0
    modified = 0
    skipped = 0
    errors = []
    
    print(f"=" * 60)
    print(f"📝 知识库文档字号批量升级工具")
    print(f"=" * 60)
    print(f"📂 目录: {BASE_DIR}")
    print(f"📄 共找到 {total} 个 HTML 文件")
    print(f"⏭️ 跳过列表: {len(SKIP_FILES)} 个工具页 + {len(ALREADY_UPGRADED)} 个已升级文件")
    print(f"-" * 60)
    
    for filepath in sorted(html_files):
        basename = os.path.basename(filepath)
        relpath = os.path.relpath(filepath, BASE_DIR)
        
        if not should_process(filepath):
            print(f"  ⏭️ 跳过: {relpath}")
            skipped += 1
            continue
        
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
            
            new_content, changes, has_changes = upgrade_font_sizes(content, basename)
            
            if has_changes:
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(new_content)
                modified += 1
                print(f"  ✅ 已修改: {relpath}")
                for c in changes:
                    print(f"      └─ {c}")
            else:
                print(f"  ⚪ 无需修改: {relpath}")
            
            processed += 1
            
        except Exception as e:
            errors.append((relpath, str(e)))
            print(f"  ❌ 错误: {relpath} — {e}")
    
    print(f"\n{'=' * 60}")
    print(f"📊 执行结果汇总")
    print(f"{'=' * 60}")
    print(f"  📄 总文件数:    {total}")
    print(f"  ⏭️ 跳过:        {skipped}")
    print(f"  🔍 已检查:      {processed}")
    print(f"  ✅ 已修改:      {modified}")
    print(f"  ⚪ 无需修改:    {processed - modified}")
    if errors:
        print(f"  ❌ 错误:        {len(errors)}")
        for fp, err in errors:
            print(f"      └─ {fp}: {err}")
    print(f"{'=' * 60}")
    print(f"🎉 完成！所有文档字号已统一升级到舒适阅读级别。")


if __name__ == "__main__":
    main()
