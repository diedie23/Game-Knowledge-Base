import zipfile
import xml.etree.ElementTree as ET
import re

# 读取 docx 文件（本质是 ZIP）
docx_path = r"h:\游戏项目知识库\resume_temp.docx"

with zipfile.ZipFile(docx_path, 'r') as z:
    # 读取主文档内容
    xml_content = z.read('word/document.xml')
    
# 解析 XML
tree = ET.fromstring(xml_content)

# 命名空间
namespaces = {
    'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
}

# 提取所有文本
paragraphs = []
for para in tree.findall('.//w:p', namespaces):
    texts = []
    for text in para.findall('.//w:t', namespaces):
        if text.text:
            texts.append(text.text)
    if texts:
        paragraphs.append(''.join(texts))

# 输出内容
for i, p in enumerate(paragraphs):
    print(f"{i}: {p}")
