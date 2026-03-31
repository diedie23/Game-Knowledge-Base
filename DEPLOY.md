# 🚀 部署到 GitHub Pages（3 步完成）

## 第 1 步：在 GitHub 上创建一个新仓库

1. 打开 https://github.com/new
2. 仓库名填：`game-knowledge-base`（或你喜欢的名字）
3. 选择 **Public**（公开）
4. **不要**勾选 README / .gitignore / License
5. 点击 **Create repository**

## 第 2 步：在终端中执行推送命令

创建完仓库后，把下面命令中的 `你的GitHub用户名` 替换成你的真实用户名，然后在终端中执行：

```bash
cd c:\Users\v_zhyszhang.TENCENT\CodeBuddy\20260331174644
git add .
git commit -m "发布游戏项目知识库"
git branch -M main
git remote add origin https://github.com/你的GitHub用户名/game-knowledge-base.git
git push -u origin main
```

## 第 3 步：开启 GitHub Pages

1. 打开你的仓库页面 `https://github.com/你的GitHub用户名/game-knowledge-base`
2. 点击 **Settings**（设置）
3. 左侧找到 **Pages**
4. Source 选择 **Deploy from a branch**
5. Branch 选择 **main**，文件夹选择 **/docs**
6. 点击 **Save**

等待 1~2 分钟，你的知识库就可以通过以下链接访问了：

```
https://你的GitHub用户名.github.io/game-knowledge-base/
```

把这个链接发给任何人，对方打开浏览器就能直接看！🎉
