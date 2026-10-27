# AI 助手 · 聊天式学习界面

一个纯浏览器端的聊天式学习应用，用两套视觉皮肤（Gemini / ChatGPT）承载 SaDuck 题库练习、申论、词语辨析与成语学习。当前已完成 **Phase 1–7**：工程脚手架、API/加密/登录、聊天壳与持久化、两套皮肤、真实题库、申论与词语、快速隐藏与账号/隐私设置。

> 本项目仅用于本地个人学习。`Gemini`、`ChatGPT` 等名称与视觉皮肤仅作界面样式参考，**与 Google、OpenAI 无任何关联**，也不会请求、保存或传输这些公司的账号凭据、接口或域名。公开发布前请自行评估商标与品牌合规要求。

## 环境要求

- Node.js 22+（开发使用 22.23.1）
- npm 10+

## 开始使用

```bash
npm install
npm run dev
```

默认开发地址为 `http://localhost:4521`。生产构建：

```bash
npm run build
npm run preview
```

## 常用命令

```bash
npm run dev           # 本地开发
npm run build         # 类型检查 + 生产构建
npm run preview       # 预览生产构建
npm run lint          # ESLint
npm run typecheck     # TypeScript 全量检查
npm run test          # Vitest 单元/组件测试
npm run test:watch    # 监听模式
npm run test:coverage # 覆盖率
npm run format        # Prettier
```

## 功能总览

### 聊天与命令

- 左栏只列出**导入的对话**（按导入/更新时间排序）；练习会话与空白会话不会出现在左栏，因此默认是空的，标题全部来自导入。
- 答题界面的左栏只作为遮盖列表展示，点击不会切换会话（避免打断正在进行的练习）；真正可以切换对话的是双击 Esc 后的伪装页。
- 会话仍保存在本机，最多保留 100 段；练习进行中刷新页面会回到当前练习。
- 会话、草稿与滚动位置写入 IndexedDB；写入有 300 ms 防抖，并在页面隐藏/离开时立即落盘。
- 存储带 schema 版本；无法解析的旧会话会被跳过，不会阻塞应用启动。
- 快捷键：`Enter` 发送，`Shift+Enter` 换行；支持中文输入法组合态。
- 输入 `/` 开头为命令，其他文本会先尝试作为当前题目的答案，再匹配学习意图。

可用命令：

```
/help                 查看帮助
/new                  开始新对话
/skin gemini|chatgpt  切换皮肤（保留当前会话）
/settings             打开设置
/practice [地区]      智能组卷；不带参数时打开地区/难度选择
/paper                历年试卷选择
/special              专项知识点组卷
/wrong                错题复盘
/favorites            收藏题目
/history              练习记录（回顾或重做）
/shenlun              申论材料
/shenlun sync         刷新申论作答记录
/shenlun submit [id]  重新提交批改
/shenlun refresh      手动刷新批改报告
/shenlun next         下一道申论题
/analyze              来一组词语辨析
/analyze 看释义选成语  切换辨析方向
/analyze tool         打开辨析工具与历史
/word [词语]          查成语/词语，带参数时直接搜索
/progress             查看当前练习进度
/save                 保存当前练习记录
/skip                 跳过当前题目
/reveal               查看当前题目解析（需先作答）
/next                 进入下一题
```

未知命令会得到一条帮助消息，而不是弹窗报错。

### 题库练习

- 历年试卷：`/tk/itemizes` 分类、`/tk/sourceInfo` 打开试卷，支持单选、多选、判断。
- 智能组卷：9 个地区预设与难度选项（`/tk/intelligence`）。
- 专项练习：知识点树、题数选择、材料类限制、至少 5 题（`/tk/tagInfo`）。
- 错题复盘：按组随机取最多 10 个题目 id 练习（`/tk/getCtInfo`）。
- 收藏题目：最多取 20 道，逐题读取（并发 4）。
- 练习记录：只读回顾或重新作答；保存使用实时 bundle 的载荷结构：
  - `correctIds` / `errorIds` 为 `tag -> questionId[]` 映射；
  - `tkWrongAnswerIds` 为扁平的题目 id 数组；
  - `json.questions` 内每题携带原生 `userAnswer` 与 `timeSpent`；
  - 仅在已作答比例严格大于 50% 时调用 `/tk/addRecord`。
- 正确答案不会在提交前进入问题消息、DOM 或解析文案；多选需手动「提交答案」。

### 申论

- 浏览分类、打开材料、阅读展开材料与题目。
- 长文作答至少 100 字，可直接在聊天输入框或题目卡片里写。
- 保存后通过 `/sl/getMySl` 解析记录 `sid`，再提交 `/extraFunctions/correctEssay`。
- 报告通过 `/sl/pgResp` 轮询（5 秒一次，最多 3 分钟），也支持手动刷新；报告 JSON 会整理成可读卡片。
- 历史作答可删除，但需要显式确认。

### 词语辨析与生词本

- `/analyze`：看成语选释义 / 看释义选成语，答完展开释义、辨析与例句，可标记已掌握。
- `/word`：成语/词语搜索、词条详情、近反义、例句、高频词收藏、生词本增删改。
- 所有接口 HTML 经 DOMPurify 清洗后渲染；`code: 102` 显示会员提示，不绕过限制。

## 快速隐藏

- 连续按两次 `Esc`（400 ms 内）切换到当前皮肤对应的聊天视图。侧栏列表和打开的对话都来自你导入的对话，与左侧列表完全一致。
- 隐藏层直接复用正式聊天界面：同一套侧栏、会话列表、账号行、消息操作栏、输入框与页脚；当前对话高亮。
- 伪装页的侧栏可以点击切换导入的对话；「发起新对话」打开一个本地空白对话，输入内容只保存在遮挡页本地。
- 助手文本以安全的粗体、引用和列表样式渲染，不注入原始 HTML。
- 只读取标记为导入的会话，练习、申论、词语等会话永远不会进入遮挡页；带练习卡片、题目或非纯文本消息的导入对话也会被跳过。没有可用导入时显示中性的空对话。因此遮挡内容完全由你导入的备份决定，应用不再内置示例对话。
- 遮挡页的输入框可以正常输入和发送：消息与简短回复只写入遮挡页的本地状态，不访问网络、不写入真实会话、不影响原练习；重新遮挡后回到初始对话。
- 聊天不会卸载；下层应用加 `inert` 与 `aria-hidden="true"`，恢复后滚动位置、草稿和当前题目保持不变。
- 登录框、设置、工具弹窗或删除/清空确认打开时，`Esc` 只关闭弹窗，不触发快速隐藏。
- 可在「设置 → 外观 → 快速隐藏」关闭快捷键。文档标题与 favicon 在正常/隐藏两种状态下都保持中性，且从不包含题目或考试信息。
- 遮挡页不包含任何预置对话，也不会把根目录的 JSON 打包进构建；需要遮挡内容时在「隐私与数据」里导入即可。

## 账号与隐私

设置面板分为「外观」「账号」「隐私与数据」：

- 账号：登录状态、邮箱、VIP 类型/到期、会员 102 提示、刷新登录状态。
- 本机凭据：显示是否保存了账号密码（不显示密码本身），可单独清除；退出登录时可选择是否同时清除已保存密码，聊天记录始终保留。
- 隐私与数据：清空全部本机聊天记录（二次确认，调用 `clearSessions()` 并重建空会话）、导出/导入 JSON 对话备份。
- 导出文件只包含对话、练习进度与草稿，**不包含账号、令牌或密码**；导入会校验结构并递归移除 `token`、`password`、`authorization` 等敏感字段，最大 5 MB。
- 导入同时接受 `gemini-voyager.chat.v1` 格式的对话导出（单个对象、对象数组或 `{ conversations: [...] }`），会把每段导出转成一条普通对话。
- 导入前可填写「对话标题」；留空则使用文件里的标题。多次导入会得到多条独立对话并出现在左侧列表，一个文件包含多段对话时会自动编号。
- 导入的对话视为「遮盖历史」：在它里面输入文字或执行命令时，应用会另开一段新对话，原导入内容不会被改写。

## 皮肤与外观

- `SkinProvider` 在 `<html>` 上设置 `data-skin`、`data-theme`、`data-branding`。
- Gemini：288px 侧栏、四彩星标、`发起新对话 / 库 / 已安排 / 学生 / 更多` 导航、`Gems / 笔记本 / 文件夹` 分组、胶囊输入框与 `Pro` 模型标签。
- ChatGPT：260px 侧栏、`ChatGPT ⌄` 标题、`新聊天 / 定时任务 / 资料库 / 插件 / 探索` 导航、项目与文件夹分组、`Instant` 模型标签与蓝色语音按钮。
- 练习选项以会话内的建议胶囊呈现，作答反馈是普通助手文字，不使用独立的结果卡片或大面积红/绿底色。
- 主题支持跟随系统 / 浅色 / 深色；设置与 `/skin` 命令均可切换，不会退出登录或丢失练习。
- 品牌样式仍由设置存储的 `branding` 字段控制（默认 `official`）；界面不提供切换入口。`neutral` 使用原创标记与「AI 助手」名称，布局与交互保持一致。
- 移动端（<768px）侧栏变为抽屉，390px 宽度下无横向滚动。

## API 配置

- 默认接口地址：`https://saduck.top/api`（`src/api/client.ts` 的 `DEFAULT_API_BASE_URL`）。
- 所有接口使用 `POST`、JSON 请求体，登录态请求头为自定义字段 `token: <JWT>`，**不是** `Authorization: Bearer`。
- 设置页不再显示地址输入。高级用户可直接修改 `localStorage` 的 `saduck.settings.apiBaseUrl`，或调整 `src/api/client.ts` 的 `DEFAULT_API_BASE_URL`；地址必须是 `http://` 或 `https://` 绝对地址。
- `vite.config.ts` 内的 `/saduck-api` 代理只是可选的开发兜底，默认不使用。
- 生产构建的 CSP 只允许 `https:` 连接；自定义接口地址请使用 HTTPS。

## 登录与本地凭据

- 登录成功后只持久化 `token`、邮箱、会员类型与到期时间，存储键为 `saduck.auth`。
- 支持密码登录与邮箱验证码登录；启动时调用 `/user/verify`，`100/101` 清除令牌并回到未登录状态，`102` 保留会话并标记会员状态异常。令牌轮换会自动覆盖旧值。
- 密码默认**不保存**。勾选「记住密码」后：
  - 使用 WebCrypto AES-GCM 加密 `{ email, password }`；
  - 256 位密钥以 `extractable: false` 存入 IndexedDB（`vault-key`）；
  - 密文写入 `localStorage` 的 `saduck.vault`；
  - 下次启动只用于预填登录表单，**不会自动提交**。
- 本地加密只能防止偶然查看，无法防御 XSS 或已被攻破的浏览器配置。接口令牌不会写入凭据保险库。
- 应用不会在控制台输出密码、令牌或完整请求体。

## 加密实现

- 服务端加密响应：AES-ECB / PKCS7（`crypto-js`），Base64 的 `-`/`_` 先还原为 `+`/`/`。
- 词语接口：载荷前 16 个字符为密钥。
- `/tk/sourceInfo` 的 `id`：固定密钥 `kxZ17XQ8z6957n3S` 加密后再做 URL 安全替换。
- 浏览器 WebCrypto 不提供 AES-ECB，因此接口载荷必须使用纯 JS 实现；本地凭据保险库使用 WebCrypto AES-GCM。

> 已知文档问题：API 文档中的 `encryptParam(19463) => "-yhntFjoaMpTJJ8-qLpMyw=="` 与实际不符——该密文解密后是 `7904460`。实现遵循文档算法，测试固定可验证的密文对，详见任务研究笔记。
>
> 答案语义按实时前端 bundle 修正：单/多选 `correctAnswer` 为 **0 基**选项下标，`type` 为 `multiple`（兼容 `multi`），判断题 `0` 为正确、非 0 为错误。

## 安全、CSP 与静态部署

- 无后端、无分析脚本、无第三方运行时脚本；接口直连配置的 SaDuck 地址。
- 生产构建会注入 CSP `<meta>`（仅构建时，开发服务器不受影响，以保留 Fast Refresh）。`frame-ancestors` 在 `<meta>` 中会被浏览器忽略并产生控制台提示，因此 meta 只包含可生效的指令：

  ```
  default-src 'self'; img-src 'self' https: data:; connect-src 'self' https:;
  style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none';
  base-uri 'self'; form-action 'none'
  ```

- 完整策略（含 `frame-ancestors 'none'`）通过 HTTP 响应头下发：
  - `npm run preview` 使用 `vite.config.ts` 的 `preview.headers`；
  - Netlify 使用 `public/_headers`；
  - Vercel 使用 `vercel.json` 的 `headers`。

  其他静态主机请自行添加同等响应头。自定义 API 域名必须能被 `connect-src https:` 覆盖。

- 题目、解析、申论材料、词语详情全部经 DOMPurify 清洗；脚本、iframe、表单、事件处理器被移除，API 图片保留并限制宽度。
- SPA 回退文件已提供：
  - `public/_redirects`（Netlify）：`/* /index.html 200`
  - `vercel.json`（Vercel）：将所有路径重写到 `index.html`

  部署到其他静态主机时，请配置同样的 history fallback，确保 `/login` 等路由可直接打开。

## 测试与手动验收

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

当前 221 项 Vitest 单元/组件测试覆盖加密向量、登录状态生命周期、凭据、命令、练习状态机、记录载荷、专项/错题数组解析、会话持久化、申论记录匹配与去重、词语辨析、历史导入导出、快速隐藏与隐藏对话、渲染兜底与弹窗可访问性。

内部浏览器冒烟脚本由本地 Trellis 任务维护，不随仓库发布；它不登录、不使用真实凭据。

> 手动验证真实登录、题库、申论批改、生词本与会员 `102` 状态需要**你自己的有效账号**。仓库不包含、测试也不会使用任何真实凭据；这些流程由单元测试和接口契约覆盖，但不能替代一次真实账号的端到端验收。

## 部署到 GitHub Pages

仓库使用两条分支：

- `main`：源代码。
- `static`：只放构建产物，`index.html` 直接在根目录；另生成 `404.html` 作为 SPA 深链接回退。

推送 `main` 后，`.github/workflows/deploy-static.yml` 会自动执行 `npm ci`、`npm run build`，并用 orphan 提交覆盖 `static` 分支。仓库 Settings → Pages 选择 `static` 分支的根目录即可。

工作流用 `VITE_BASE=/KGChat/` 设置资源前缀，路由 basename 也随之生效。如果以后改了仓库名，需要同步修改工作流里的这个值。

> 首次发布如果 Actions 无法推送 `static` 分支，请在 Settings → Actions → General → Workflow permissions 里允许 read and write。

## 已知限制

- 需要有效 SaDuck 账号与网络才能读取真实题库/申论内容；未登录时只显示公开分类。
- 申论 `sid` 依赖保存后 `/sl/getMySl` 的匹配结果，偶尔需要手动「刷新记录」再提交批改。
- 会员类型、到期与 `102` 状态以接口返回为准；应用不会购买、续费或绕过限制。
- 本地加密与聊天存储均为同源数据，浏览器配置失守时仍可能被读取；不要在共享设备上勾选「记住密码」。
- 生产构建可能报告单个 chunk 超过 500 kB 的警告；这是提示而非错误，当前未做路由级拆包。
- 官方品牌样式仅供本地个人使用；公开发布前请换成中性样式并完成商标评估。
- 左栏只显示导入的对话。切换到导入对话后，原练习会话仍保存在本机但不会出现在左栏；需要继续时重新发起练习即可。

## 明确不做

支付/会员购买、留言、邀请奖励、OCR、文章/新闻、会员绕过、服务端存储、多用户同步、分析统计。

## 目录结构

```
src/
  api/           # 传输、加密、类型/校验、接口模块、请求去重
  auth/          # 令牌生命周期与本地凭据保险库
  app/           # 应用入口、Provider、路由、快速隐藏装配
  chat/          # 会话模型、命令、练习状态机、持久化、历史导入导出
  components/    # 聊天、设置、登录、弹窗与快速隐藏对话
  decoy/         # 快速隐藏用的导入对话与安全 Markdown 渲染
  features/      # 题库、申论、词语辨析、生词本
  hooks/         # 双击 Esc、弹窗焦点/滚动锁定
  settings/      # 皮肤、主题、接口与快速隐藏设置
  skins/         # 令牌、SkinProvider、Brand、两套皮肤壳
  styles/        # Tailwind 4、共享聊天样式
  test/          # 测试环境初始化
```
