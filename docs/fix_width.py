import os, glob

# 批量处理所有独立文档HTML
files = glob.glob(r'H:\游戏项目知识库\docs\knowledge-base\**\*.html', recursive=True)
count = 0

for f in files:
    # 跳过特殊工具页面
    basename = os.path.basename(f)
    if basename in ('index.html', 'md-viewer.html', 'auto-mask.html', 'mask-tool.html', 
                    'spine-split.html', 'mask-core-algorithms.html', 'channel-packer.html',
                    'image-skew-corrector.html', 'game-resource-toolkit.html'):
        continue
    
    with open(f, 'r', encoding='utf-8') as fh:
        content = fh.read()
    
    original = content
    
    # 1. max-width 从 1200px 加宽到 1400px
    content = content.replace('.doc{max-width:1200px', '.doc{max-width:1400px')
    
    # 2. body font-size 从 16px 增大到 18px（如果存在 body{font-size:16px}）
    content = content.replace('body{font-size:16px', 'body{font-size:18px')
    
    # 3. 文档标题字体放大
    # h1: 28px → 32px
    content = content.replace('.doc h1{font-size:28px', '.doc h1{font-size:32px')
    content = content.replace('.doc h1{font-size:26px', '.doc h1{font-size:30px')
    # h2: 22px → 26px, 20px → 24px
    content = content.replace('.doc h2{font-size:22px', '.doc h2{font-size:26px')
    content = content.replace('.doc h2{font-size:20px', '.doc h2{font-size:24px')
    # h3: 17px → 20px, 16px → 19px
    content = content.replace('.doc h3{font-size:17px', '.doc h3{font-size:20px')
    content = content.replace('.doc h3{font-size:16px', '.doc h3{font-size:19px')
    # h4: 15px → 17px
    content = content.replace('.doc h4{font-size:15px', '.doc h4{font-size:17px')
    content = content.replace('.doc h4{font-size:14px', '.doc h4{font-size:16px')
    
    # 4. 正文 p 字体: 15px → 17px, 14px → 16px (仅在 .doc p 上下文中)
    content = content.replace('.doc p{font-size:15px', '.doc p{font-size:17px')
    content = content.replace('.doc p{font-size:14px', '.doc p{font-size:16px')
    
    # 5. blockquote 字体放大
    content = content.replace('.doc blockquote{font-size:14px', '.doc blockquote{font-size:16px')
    content = content.replace('.doc blockquote{font-size:15px', '.doc blockquote{font-size:17px')
    
    # 6. li 字体放大
    content = content.replace('.doc li{font-size:14px', '.doc li{font-size:16px')
    content = content.replace('.doc li{font-size:15px', '.doc li{font-size:17px')
    
    # 7. table 字体放大
    content = content.replace('.doc table{font-size:14px', '.doc table{font-size:16px')
    content = content.replace('.doc table{font-size:13px', '.doc table{font-size:15px')
    
    # 8. code 字体放大
    content = content.replace('.doc code{font-size:13px', '.doc code{font-size:14px')
    content = content.replace('.doc pre{font-size:13px', '.doc pre{font-size:14px')
    
    # 9. line-height 增加
    content = content.replace('line-height:1.7}', 'line-height:1.8}')
    content = content.replace('line-height:1.6}', 'line-height:1.75}')
    
    if content != original:
        with open(f, 'w', encoding='utf-8') as fh:
            fh.write(content)
        count += 1
        print(f'  Updated: {basename}')

print(f'\nDone: updated {count} of {len(files)} files')
