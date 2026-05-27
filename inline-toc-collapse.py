# -*- coding: utf-8 -*-
"""
Inline TOC Collapse: Directly embed TOC folding CSS + JS into each HTML file.
This ensures the optimization works regardless of external JS caching or CSP issues.

Strategy:
1. Add inline CSS for .toc collapse/grid layout into existing <style> block
2. Add a small inline <script> right after the .toc div for collapse toggling
"""
import os
import re

docs_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'docs', 'knowledge-base')

# The CSS to inject (into existing <style> block, before </style>)
INLINE_CSS = """
/* === TOC Inline Collapse + Grid === */
.toc{position:relative;overflow:hidden;transition:all .3s ease}
.toc.toc-folded .toc-inner{max-height:0;padding-top:0;padding-bottom:0;overflow:hidden}
.toc .toc-inner{max-height:2000px;transition:max-height .35s cubic-bezier(.4,0,.2,1),padding .35s ease;overflow:hidden}
.toc .toc-toggle-bar{display:flex;align-items:center;justify-content:space-between;padding:10px 0 8px;cursor:pointer;user-select:none}
.toc .toc-toggle-bar:hover{opacity:.85}
.toc .toc-toggle-bar .toc-badge{font-size:11px;background:rgba(108,140,255,.15);color:var(--accent,#6c8cff);padding:2px 8px;border-radius:8px;font-weight:600;margin-left:10px}
.toc .toc-toggle-bar .toc-hint{font-size:12px;color:var(--dim,#6b7085);display:flex;align-items:center;gap:4px}
.toc .toc-toggle-bar .toc-chevron{display:inline-block;transition:transform .25s ease}
.toc.toc-folded .toc-toggle-bar .toc-chevron{transform:rotate(-90deg)}
.toc .toc-inner>ol{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:4px 20px;list-style:none;padding:0;margin:0;counter-reset:toc-top}
.toc .toc-inner>ol>li{counter-increment:toc-top;margin:0;padding:0}
.toc .toc-inner>ol>li>a{display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:6px;font-size:13px;text-decoration:none;font-weight:500;transition:all .15s ease}
.toc .toc-inner>ol>li>a::before{content:counter(toc-top);font-size:11px;font-weight:700;min-width:20px;height:20px;display:flex;align-items:center;justify-content:center;border-radius:5px;background:rgba(108,140,255,.1);color:var(--accent,#6c8cff);flex-shrink:0}
.toc .toc-inner>ol>li>a:hover{background:rgba(108,140,255,.08)}
.toc .toc-inner>ol>li>a:hover::before{background:var(--accent,#6c8cff);color:#000}
.toc .toc-inner>ol>li>ol{list-style:none;padding:0 0 0 28px;margin:2px 0 6px}
.toc .toc-inner>ol>li>ol>li{margin:0}
.toc .toc-inner>ol>li>ol a{display:block;padding:2px 10px;font-size:12px;color:var(--dim,#6b7085);text-decoration:none;border-radius:4px;transition:all .12s;line-height:1.6}
.toc .toc-inner>ol>li>ol a:hover{color:var(--text,#c5c9d6);background:rgba(108,140,255,.05)}
@media(max-width:600px){.toc .toc-inner>ol{grid-template-columns:1fr}}
"""

# The inline script to inject (right after the .toc div closing tag)
INLINE_SCRIPT = """<script>
(function(){
  var toc=document.querySelector('.toc');
  if(!toc)return;
  var links=toc.querySelectorAll('a[href^="#"]');
  if(links.length<5)return;
  // Wrap existing content
  var h3=toc.querySelector('h3');
  var ol=toc.querySelector('ol');
  if(!ol)return;
  var topCount=ol.querySelectorAll(':scope>li').length;
  var totalCount=links.length;
  // Build toggle bar
  var bar=document.createElement('div');
  bar.className='toc-toggle-bar';
  bar.innerHTML='<div style="display:flex;align-items:center">'+
    (h3?h3.outerHTML:'')+
    '<span class="toc-badge">'+topCount+' \\u7AE0 \\u00B7 '+totalCount+' \\u8282</span></div>'+
    '<span class="toc-hint"><span class="toc-hint-text">\\u70B9\\u51FB\\u5C55\\u5F00</span> <span class="toc-chevron">\\u25BC</span></span>';
  // Create inner wrapper
  var inner=document.createElement('div');
  inner.className='toc-inner';
  inner.appendChild(ol);
  // Clear and rebuild
  toc.innerHTML='';
  toc.appendChild(bar);
  toc.appendChild(inner);
  toc.classList.add('toc-folded');
  // Bind toggle
  var hintText=bar.querySelector('.toc-hint-text');
  bar.addEventListener('click',function(){
    var folded=toc.classList.toggle('toc-folded');
    hintText.textContent=folded?'\\u70B9\\u51FB\\u5C55\\u5F00':'\\u70B9\\u51FB\\u6536\\u8D77';
  });
  // Remove original h3 (already in bar)
  if(h3&&h3.parentNode===toc)h3.remove();
})();
</script>"""

count = 0
skipped = 0

for fname in sorted(os.listdir(docs_dir)):
    if not fname.endswith('.html'):
        continue
    fpath = os.path.join(docs_dir, fname)
    with open(fpath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Skip if already has inline collapse
    if 'toc-folded' in content or 'toc-toggle-bar' in content:
        skipped += 1
        continue
    
    # Skip if no .toc div
    if 'class="toc"' not in content:
        skipped += 1
        continue
    
    modified = content
    
    # 1. Inject CSS before </style>
    if '</style>' in modified:
        modified = modified.replace('</style>', INLINE_CSS + '</style>', 1)
    
    # 2. Inject inline script right before </body>
    if '</body>' in modified:
        modified = modified.replace('</body>', INLINE_SCRIPT + '\n</body>', 1)
    
    if modified != content:
        with open(fpath, 'w', encoding='utf-8') as f:
            f.write(modified)
        count += 1
        print(f'  [OK] {fname}')

print(f'\nDone! Inlined TOC collapse into {count} files. Skipped: {skipped}')
