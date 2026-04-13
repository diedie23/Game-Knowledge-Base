"""
HTML → TXT 批量转换脚本（供 Coze 知识库上传）
================================================
功能：
  1. 扫描 docs/knowledge-base/ 下所有 .html 文件
  2. 提取 <body> 中的纯文本内容（去掉 CSS/JS/HTML 标签）
  3. 清理多余空行、元数据噪音
  4. 输出到 coze-upload/ 目录，每个文件对应一个 .txt
"""

import os
import re
import sys
import glob
from html.parser import HTMLParser

# 修复 Windows 终端编码
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# ============ 配置 ============
DOCS_DIR = os.path.join(os.path.dirname(__file__), "docs", "knowledge-base")
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "coze-upload")
# ==============================


class HTMLTextExtractor(HTMLParser):
    """从 HTML 中提取纯文本，跳过 <style> 和 <script> 标签"""

    def __init__(self):
        super().__init__()
        self._result = []
        self._skip_stack = 0  # 跳过嵌套的 style/script

    def handle_starttag(self, tag, attrs):
        if tag in ("style", "script", "noscript"):
            self._skip_stack += 1
        # 块级标签前加换行
        if tag in ("p", "div", "h1", "h2", "h3", "h4", "h5", "h6",
                    "li", "tr", "br", "hr", "section", "article",
                    "header", "footer", "blockquote", "pre", "table"):
            self._result.append("\n")

    def handle_endtag(self, tag):
        if tag in ("style", "script", "noscript"):
            self._skip_stack = max(0, self._skip_stack - 1)
        if tag in ("p", "div", "h1", "h2", "h3", "h4", "h5", "h6",
                    "li", "tr", "table", "section", "article",
                    "blockquote", "pre"):
            self._result.append("\n")
        if tag == "td" or tag == "th":
            self._result.append(" | ")

    def handle_data(self, data):
        if self._skip_stack == 0:
            self._result.append(data)

    def handle_entityref(self, name):
        if self._skip_stack == 0:
            char_map = {"amp": "&", "lt": "<", "gt": ">", "nbsp": " ",
                        "quot": '"', "apos": "'"}
            self._result.append(char_map.get(name, f"&{name};"))

    def handle_charref(self, name):
        if self._skip_stack == 0:
            try:
                if name.startswith("x"):
                    self._result.append(chr(int(name[1:], 16)))
                else:
                    self._result.append(chr(int(name)))
            except (ValueError, OverflowError):
                pass

    def get_text(self):
        return "".join(self._result)


def html_to_text(html_content: str) -> str:
    """将 HTML 转为干净的纯文本"""
    extractor = HTMLTextExtractor()
    extractor.feed(html_content)
    text = extractor.get_text()

    # 清理多余空白
    text = re.sub(r"[ \t]+", " ", text)           # 合并空格
    text = re.sub(r" *\n *", "\n", text)           # 去行首尾空格
    text = re.sub(r"\n{3,}", "\n\n", text)         # 最多保留一个空行
    text = text.strip()

    return text


def clean_metadata_noise(text: str) -> str:
    """移除文档元数据行（维护人、日期、版本号等），让知识库更干净"""
    lines = text.split("\n")
    cleaned = []
    for line in lines:
        stripped = line.strip()
        # 跳过纯元数据行
        if re.match(r"^(📋|👤|📅|🎮|📂|🔒|🚀|🏠|📌|🔐|💼)\s", stripped):
            continue
        if re.match(r"^v\d+\.\d+", stripped):
            continue
        if re.match(r"^适用[：:]", stripped):
            continue
        if re.match(r"^维护[：:]", stripped):
            continue
        cleaned.append(line)
    return "\n".join(cleaned)


def process_all():
    """批量转换所有 HTML 文件"""
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # 搜索所有 HTML 文件（包括子目录）
    html_files = []
    for root, dirs, files in os.walk(DOCS_DIR):
        for f in files:
            if f.endswith(".html") and f not in ("index.html", "placeholder.html",
                                                   "Blank_Template.html", "md-viewer.html",
                                                   "permission-nav.html", "editor-guide.html"):
                html_files.append(os.path.join(root, f))

    print(f"📂 扫描到 {len(html_files)} 个知识文档 HTML\n")

    success = 0
    errors = []

    for html_path in sorted(html_files):
        rel_path = os.path.relpath(html_path, DOCS_DIR)
        # 生成输出文件名（子目录用 _ 连接）
        out_name = rel_path.replace(os.sep, "_").replace(".html", ".txt")
        out_path = os.path.join(OUTPUT_DIR, out_name)

        try:
            with open(html_path, "r", encoding="utf-8") as f:
                html_content = f.read()

            text = html_to_text(html_content)
            text = clean_metadata_noise(text)

            # 提取标题作为文件第一行
            title_match = re.search(r"<title>(.*?)</title>", html_content, re.IGNORECASE)
            if title_match:
                title = title_match.group(1).strip()
                text = f"# {title}\n\n{text}"

            # 过滤太短的文件（可能是空模板）
            if len(text.strip()) < 100:
                print(f"  ⏭️  跳过（内容太少）: {rel_path}")
                continue

            with open(out_path, "w", encoding="utf-8") as f:
                f.write(text)

            size_kb = os.path.getsize(out_path) / 1024
            print(f"  ✅ {out_name} ({size_kb:.1f} KB)")
            success += 1

        except Exception as e:
            print(f"  ❌ {rel_path}: {e}")
            errors.append(rel_path)

    print(f"\n{'='*50}")
    print(f"✅ 成功转换: {success} 个文件")
    if errors:
        print(f"❌ 失败: {len(errors)} 个文件")
    print(f"📁 输出目录: {OUTPUT_DIR}")
    print(f"\n💡 接下来请在 Coze 知识库中：")
    print(f"   1. 点击「新建知识库」→ 选择「本地文档」")
    print(f"   2. 全选 coze-upload/ 目录下所有 .txt 文件上传")
    print(f"   3. 分段策略选「自动」即可")


if __name__ == "__main__":
    process_all()
