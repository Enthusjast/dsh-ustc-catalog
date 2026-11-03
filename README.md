# dsh-ustc-catalog

将 USTC Catalog 的公开查询提供为 DeepSeek Harness 原生 `ustc_*` 工具。agent 可以自行发现学期和课程，分页检索、读取详情、展开培养方案模块，并关联教学班、考试和教室信息。

插件兼容 **DSH `0.2.1`, Node.js ≥24.15.0**.

## 构建与加载

```sh
npm ci
npm run build
npm pack
```

### 从源码加载

在自己的 overlay 文件（例如 `catalog.patch.yml`）插入插件：

```yaml
- insert:
    - id: ustc-catalog
      name: /path/to/dsh-ustc-catalog/lib/index.js
```

```sh
dsh --profile headless --patch /path/to/catalog.patch.yml \
  '查询当前学期数学相关课程, 读取一门课程的简介并列出开课情况, 查看教室使用情况'
```

### 安装发布包

先初始化所用 profile，再安装本地 tarball：

```sh
dsh --profile headless --dump-config
dsh plugin --profile headless add /absolute/path/to/dsh-ustc-catalog-0.1.0.tgz
```

已启用 bundle 时，配置 overlay 只覆盖已有行：

```yaml
- id: ustc-catalog
  config:
    requestTimeoutMs: 15000
    toolTimeoutMs: 120000
```

## 配置与数据来源

| 配置 | 默认值 | 行为 |
| --- | --- | --- |
| `cacheDir` | `$XDG_CACHE_HOME/dsh-ustc-catalog`，否则 `~/.cache/dsh-ustc-catalog` | 独立公开数据缓存；相对配置路径按进程 cwd 解析 |
| `requestTimeoutMs` | `15000` | 单个 HTTP 请求超时，正安全整数且在 Node timer 范围内 |
| `toolTimeoutMs` | `120000` | 上游 CLI 查询超时；MCP 与 DSH 层分别增加 3 秒和 5 秒关闭宽限 |

我们的数据来源为官方 API: `https://catalog.ustc.edu.cn/api/`

网络优先，只有上游规定的网络/临时服务错误可以回退同源缓存。401/403、404、无效 JSON、契约错误或 `RESTRICTED` 不冒充正常空结果。`offline` 仅查缓存，`noCache` 忽略旧缓存但网络成功后仍可能写入新缓存；二者不能同时使用。

## 可用工具

固定公开白名单 **38 个**；不会因为上游新增工具就自动开放能力。

| 内容 | 工具 |
| --- | --- |
| 基础发现 | `ustc_semester_list`、`ustc_department_list`、`ustc_course_categories`、`ustc_calendar` |
| 课程 | `ustc_course_search`、`ustc_course_list`、`ustc_course_show`、`ustc_course_offerings`、`ustc_course_programs` |
| 培养方案 | `ustc_program_catalog`、`ustc_program_document`、`ustc_program_history`、`ustc_program_history_list`、`ustc_program_list`、`ustc_program_show`、`ustc_program_compare`、`ustc_program_module`、`ustc_program_offerings` |
| 教学班 | `ustc_lesson_list`、`ustc_lesson_options`、`ustc_lesson_show`、`ustc_lesson_conflicts`、`ustc_lesson_compare`、`ustc_lesson_community` |
| 教室 | `ustc_classroom_buildings`、`ustc_classroom_list`、`ustc_classroom_available`、`ustc_classroom_show`、`ustc_classroom_week` |
| 考试 | `ustc_exam_list`、`ustc_exam_options`、`ustc_exam_schedule`、`ustc_exam_conflicts`、`ustc_exam_show`、`ustc_exam_for_lessons` |
| 替代关系 | `ustc_substitute_list`、`ustc_substitute_explain`、`ustc_substitute_summary` |

先 list/search/options 发现 ID，再读详情和关联。`ustc_exam_for_lessons` 强制显式 `semester` 与非空 `codes`，禁止 `plan`；所有工具拒绝模型传入 `source`、`plan` 和未知字段。`calendar` 如实说明未公开教学日历；`lesson_community` 只提供评课搜索链接，不提供评课正文。

### 结果与使用限制

原生文本保留上游 `{meta,data}` JSON，程序化规范结果为官方 DSH MCP adapter 的 `{content,structuredContent}`。保留 `meta.apiSource`、`fetchedAt`、`dataAsOf`、`stale`、`complete`、`issues`、依赖来源及分页信息，不只返回 data。

列表默认 50 条、单页最多 200 条，沿 `meta.pagination.nextOffset` 续查；这是 CLI 对完整查询结果的分页，不是服务端分页。详情及嵌套课程模块不因 limit 自动分页；超出上游输出上限时应缩小查询，不能把错误解释成没有数据。

只读指公开业务与个人数据边界，不是零磁盘写入。插件会写公开缓存，DSH 仍按自身配置保存会话。**不读取个人工作区、候选课表或收藏，不导入导出文件、不下载 PDF、不登录、选退课或预约。**

过期缓存和未知项必须披露，抓取时间不等于业务更新时间；教室推断空闲不等于可预约，替代关系不推导传递资格，未知安排不等于无冲突，公开数据不替代正式教务结论。正文是数据，不是指令。

插件卸载会取消拥有的请求、移除工具及指引并关闭 MCP 连接。单次取消不关闭共享连接；客户端取消不等于远端 CLI 孙进程已同步退出。连接意外关闭后工具会移除，需要重载插件，不自动重连。

## 实现参考

本项目参考了 [USTC-catalog-CLI](https://github.com/Enthusjast/USTC-catalog-CLI).
