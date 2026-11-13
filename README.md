# “求真·问道” 学术诚信漂流瓶

福州大学 2026 年研究生科学道德与学风建设月 · 计算机与大数据学院

一个匿名漂流瓶互动网页：写下科研路上的困惑、学术红线探讨、导学故事或暖心寄语，
扔进海里；也可以选择把瓶子沉入海底，等待有缘人捞起。

纯静态前端，数据存储使用 Supabase。

## 功能

- **漂流瓶墙**：公开的漂流瓶以卡片形式展示，支持匿名发起讨论。
- **两种抛瓶方式**
  - 抛入大海 · 公开展示：进入漂流瓶墙，所有人可见并可参与讨论。
  - 漂在海面 · 等待捞起：不在墙上展示，只出现在「海上漂流瓶」区域。
- **海上捞瓶**：海面画里漂浮着许多未公开的瓶子；点首屏「捞一个漂流瓶」会先弹出海面，
  再点任意一只瓶子把它捞起来阅读，并可进一步参与讨论。
- **四种漂流瓶类型**：学术红线探讨、科研困惑求助、导学关系树洞、暖光寄语。
- **违禁词过滤**：漂流瓶与讨论在提交前都会做归一化匹配，命中违禁词即拦截发布。
- **明亮海洋视觉**：水彩海景背景 + 白色玻璃拟态卡片、Canvas 动态波形、SVG 图标系统、
  响应式布局与 `prefers-reduced-motion` 降级。

## 目录结构

```
.
├── index.html              # 页面结构（含 SVG 图标 sprite）
├── assets/
│   ├── css/style.css       # 全站样式与动画
│   ├── js/app.js           # 全部交互逻辑（Supabase、渲染、违禁词）
│   └── img/ocean-bg.png    # 海洋背景图
├── supabase/schema.sql     # 数据库建表与 RLS 策略
├── subject.jpg             # 活动通知原图（仅留档，页面不引用）
├── .gitignore
└── README.md
```

## 本地运行

项目不依赖构建工具，但通过 `file://` 直接打开会受跨域限制，建议起一个静态服务器：

```bash
# Python
python -m http.server 8000

# 或 Node
npx serve .
```

然后访问 <http://localhost:8000>。

## 配置 Supabase

1. 在 [Supabase](https://supabase.com/) 新建项目。
2. 打开 **SQL Editor**，执行 `supabase/schema.sql` 的全部内容。
3. 打开 `assets/js/app.js`，替换顶部的两个常量：

```js
const SUPABASE_URL = 'https://<your-project>.supabase.co';
const SUPABASE_KEY = '<your-anon-or-publishable-key>';
```

> 这里只能使用 anon / publishable key，**不要**把 service_role key 写进前端代码。

### 数据表

| 表 | 字段 | 说明 |
| --- | --- | --- |
| `bottles` | `id`, `nickname`, `content`, `type`, `visible`, `created_at` | `type` 取值 `red` / `blue` / `green` / `warm`；`visible=false` 表示漂在海面、不公开展示 |
| `comments` | `id`, `bottle_id`, `nickname`, `content`, `created_at` | `bottle_id` 关联 `bottles.id` |

`visible` 字段默认 `true`。如果数据库是早期版本，执行 schema.sql 中的
`alter table ... add column if not exists visible ...` 语句即可补齐。

### 安全说明

schema.sql 已开启 RLS：匿名用户只能 `insert` 与 `select`，不能 `update` / `delete`。
违禁词过滤在前端完成，仅用于体验引导；如需强约束，可在数据库侧再加触发器或 Edge Function 校验。

## 部署到 GitHub Pages

1. 把仓库推到 GitHub。
2. 进入 **Settings → Pages**。
3. Source 选择 `Deploy from a branch`，分支 `main`，目录 `/ (root)`。
4. 保存后等待构建，页面地址形如 `https://<username>.github.io/<repo>/`。

因为项目使用相对路径（`assets/...`），部署在子路径下也能正常加载。

## 素材来源

- 海洋背景图来自 [Unsplash](https://unsplash.com/)，遵循 Unsplash License。
- 图标为项目内联 SVG，无外部图标库依赖。
