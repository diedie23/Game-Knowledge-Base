"""
批量语气柔化脚本 - 将知识库中的命令式/禁令式措辞转为协作建议式
规则：
1. 流程管理/协作类 → 柔化（"必须参加"→"建议参加"）
2. 法律/合规/安全/合同类 → 保持不变（"禁止泄密"属于合理硬约束）
3. 技术规范类 → "必须"→"需要/应当"，保持专业性但去掉命令感
4. "铁律" → "流程约定/核心原则/重要提醒"
5. "严禁越级" → "协作提醒"
6. "不予受理" → 更柔和的表述
7. "约谈" → "沟通对齐"
8. "处罚/缺席处罚" → "友情提示"
"""

import os
import re
import sys

# 需要处理的目录
BASE_DIR = r"h:\游戏项目知识库\docs\knowledge-base"

# 排除列表 - 已经处理过的文件
EXCLUDE_FILES = [
    "ui-production-workflow.html",  # 已在之前的对话中处理
]

# 统计
stats = {"files_modified": 0, "total_replacements": 0}

def should_skip_context(line, match_text):
    """
    判断是否在合规/安全/法律/合同语境中，这些不应该修改
    """
    # 安全/保密/合同/法律相关的关键词上下文 - 这些"禁止"是合理的
    security_keywords = [
        "泄密", "泄露", "保密", "NDA", "合同", "违约", "赔偿", "侵权",
        "盗版", "版权", "知识产权", "解约", "黑名单", "法律", "法规",
        "安全", "加密", "截屏", "录屏", "外传", "转包", "二包",
        "冒充", "一票否决", "违规", "AI直出", "L4", "数据安全",
        "隐私", "个人电脑", "公网", "U盘", "网盘", "云盘",
        "终止合作", "竞业", "原创性", "版权归属"
    ]
    
    for kw in security_keywords:
        if kw in line:
            return True
    return False


def soften_text(content, filename):
    """对单个文件内容进行语气柔化"""
    changes = 0
    lines = content.split('\n')
    new_lines = []
    
    for line in lines:
        original_line = line
        
        # === 铁律 → 流程约定/核心原则/重要提醒 ===
        # 但安全/合规类的铁律保留（改为"核心原则"而非"建议"）
        if "铁律" in line:
            if should_skip_context(line, "铁律"):
                # 安全类：铁律 → 核心原则（保持严肃但不命令）
                line = line.replace("🔴 铁律", "📌 核心原则")
                line = line.replace("铁律", "核心原则")
            else:
                # 流程类：铁律 → 流程约定
                line = line.replace("🔴 铁律", "📌 流程约定")
                line = line.replace("铁律", "流程约定")
        
        # === 严禁越级/严禁 === (分场景)
        if "严禁越级" in line:
            line = line.replace("严禁越级", "协作提醒")
        
        # 非安全语境的"严禁" → "请避免"  
        if "严禁" in line and not should_skip_context(line, "严禁"):
            line = line.replace("严禁", "请避免")
        
        # === 不予受理 → 更柔和 ===
        if "不予受理" in line:
            line = line.replace("不予受理", "可能需要补充完善后再提交")
        
        # === 约谈 → 沟通对齐 === (非安全语境)
        if "约谈" in line and not should_skip_context(line, "约谈"):
            line = line.replace("约谈", "沟通对齐")
        
        # === 缺席处罚 → 友情提示 ===
        if "缺席处罚" in line:
            line = line.replace("缺席处罚", "友情提示")
        
        # === 强制执行 → 推荐执行 === (非安全语境)
        if "强制执行" in line and not should_skip_context(line, "强制执行"):
            line = line.replace("强制执行", "推荐执行")
        if "（强制）" in line and not should_skip_context(line, "强制"):
            line = line.replace("（强制）", "（推荐）")
        if "(强制)" in line and not should_skip_context(line, "强制"):
            line = line.replace("(强制)", "(推荐)")
            
        # === 流程类的"必须" → "建议/需要" ===
        # 注意：保留安全/合同/技术硬约束中的"必须"
        if "必须" in line and not should_skip_context(line, "必须"):
            # 流程协作类的必须 → 建议
            flow_patterns = [
                ("必须参与", "建议参与"),
                ("必须参加", "建议参加"),
                ("必须召开", "建议召开"),
                ("必须执行", "建议执行"),
                ("必须做到", "建议做到"),
                ("必须标注", "建议标注"),
                ("必须关联", "建议关联"),
                ("必须同步", "建议同步"),
                ("必须在", "建议在"),
                ("必须经过", "建议经过"),
                ("必须提交", "建议提交"),
                ("必须附上", "建议附上"),
                ("必须包含", "建议包含"),
                ("必须明确", "建议明确"),
                ("必须逐项", "建议逐项"),
                ("必须先", "建议先"),
                ("必须由", "建议由"),
                ("必须有", "建议有"),
            ]
            for old, new in flow_patterns:
                if old in line:
                    line = line.replace(old, new)
        
        # === "禁止发起" → "建议在...之后再发起" ===
        if "禁止发起" in line and not should_skip_context(line, "禁止"):
            line = line.replace("禁止发起", "建议完成后再发起")
        
        # === "禁止进入" → "建议在...之后再进入" ===    
        if "禁止进入" in line and not should_skip_context(line, "禁止"):
            line = line.replace("禁止进入", "建议评审通过后再进入")
        
        # === "不得越过" → "建议通过...统一协调" ===
        if "不得越过" in line and not should_skip_context(line, "不得"):
            line = line.replace("不得越过", "建议不要绕过")
        if "不得" in line and "不得越过" not in original_line and not should_skip_context(line, "不得"):
            # 流程类的"不得" → "建议不要"
            if any(kw in line for kw in ["排期", "评审", "流转", "参与", "会议", "环节"]):
                line = line.replace("不得", "建议不要")
        
        # === alert-red → alert-yellow (非安全类) ===
        # 只在我们修改了措辞的行上做样式降级
        if line != original_line and "alert-red" in line:
            if not should_skip_context(line, ""):
                line = line.replace("alert-red", "alert-yellow")
        
        if line != original_line:
            changes += 1
        
        new_lines.append(line)
    
    return '\n'.join(new_lines), changes


def process_files():
    """遍历所有HTML文件并进行柔化处理"""
    for root, dirs, files in os.walk(BASE_DIR):
        for fname in files:
            if not fname.endswith('.html'):
                continue
            if fname in EXCLUDE_FILES:
                continue
                
            fpath = os.path.join(root, fname)
            
            try:
                with open(fpath, 'r', encoding='utf-8') as f:
                    content = f.read()
            except Exception as e:
                print(f"[SKIP] {fname}: {e}")
                continue
            
            new_content, changes = soften_text(content, fname)
            
            if changes > 0:
                with open(fpath, 'w', encoding='utf-8') as f:
                    f.write(new_content)
                print(f"[MODIFIED] {fname}: {changes} replacements")
                stats["files_modified"] += 1
                stats["total_replacements"] += changes
            else:
                # Don't print unmodified files to reduce noise
                pass
    
    print(f"\n{'='*50}")
    print(f"Complete! Files modified: {stats['files_modified']}, Total replacements: {stats['total_replacements']}")


if __name__ == "__main__":
    process_files()
