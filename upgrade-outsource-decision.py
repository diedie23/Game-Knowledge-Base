# -*- coding: utf-8 -*-
"""升级外包vs内发决策矩阵 v1.0→v2.0"""
import pathlib
out = pathlib.Path(r"h:\游戏项目知识库\docs\knowledge-base\outsource-vs-inhouse-decision.html")

# 读取模板片段并拼接
p1 = pathlib.Path(r"h:\游戏项目知识库\_part1.html")
p2 = pathlib.Path(r"h:\游戏项目知识库\_part2.html")
p3 = pathlib.Path(r"h:\游戏项目知识库\_part3.html")

content = p1.read_text(encoding='utf-8') + p2.read_text(encoding='utf-8') + p3.read_text(encoding='utf-8')
out.write_text(content, encoding='utf-8')

# 清理临时文件
p1.unlink()
p2.unlink()
p3.unlink()

print(f"Done! Output: {out} ({len(content):,} bytes)")
