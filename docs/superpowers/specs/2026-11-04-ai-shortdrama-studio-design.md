# AI 短剧工坊（DramaForge）设计规格

- 日期：2026-11-04
- 状态：已确认
- 目标：Windows / macOS 桌面端，本地优先的 AI 短剧一键制作平台

## 1. 产品定位

输入一句话或一段剧本，自动完成「创意扩写 → 角色设定 → 分集大纲 → 分镜脚本 → 关键帧 → 配音 → 视频片段 → 字幕 → 成片合成」，每个阶段可单独重跑，每个镜头可人工修改后重生成。定位不是模型厂商，而是"AI 短剧的拍摄现场"：把多模型、多阶段的生产流程收敛到一个桌面工作台。

## 2. 用户与核心场景

- 短剧/短视频创作者：一句话生成 1–3 分钟竖屏短剧初稿。
- 工作室：批量创建项目，逐镜头精修，导出可发布的 MP4。
- 无 API Key 的新用户：演示模式完整跑通流程，先看到成片再决定接入哪家模型。

## 3. 信息架构

```
项目库
├─ 新建项目（一句话 / 剧本 / 参数）
└─ 项目工作区
   ├─ 概览：流水线阶段、任务、统计、一键生成
   ├─ 剧本角色：logline、分集大纲、角色圣经
   ├─ 分镜：镜头卡片（画面/视频/台词/提示词/时长）
   ├─ 预览：顺序播放、字幕叠加、单镜头替换
   └─ 导出：MP4、字幕、工程包
设置：供应商、密钥、并发、路径
```

## 4. 技术选型

| 层 | 选型 | 理由 |
|---|---|---|
| 桌面壳 | Electron 45 | 跨平台安装包成熟，Node 侧媒体/网络能力强 |
| 构建 | electron-vite 6 + Vite 8 | 主进程/预加载/渲染进程一体化构建与 HMR |
| UI | React 19 + TypeScript 5.9 + Tailwind 4 | 组件化、类型安全、快速迭代 |
| 状态 | Zustand 5 | 轻量，适合项目/任务事件驱动 |
| 校验 | Zod 4 | LLM JSON 输出校验与修复 |
| 媒体 | ffmpeg-static + ffprobe-static | 免安装依赖，随包分发 |
| 测试 | Vitest 5 | 服务层纯 Node，可直接集成测试 |

主进程服务层不依赖 Electron（路径与渲染器注入），保证可测试性。

## 5. 目录结构

```
src/
  main/
    index.ts                 应用生命周期、窗口、协议、菜单
    ipc.ts                   IPC 注册
    bootstrap.ts             服务装配
    smoke.ts                 无界面端到端自检
    services/
      projectStore.ts
      settingsStore.ts
      keyVault.ts
      taskQueue.ts
      pipeline/{engine,prompts,schemas,json,lss}.ts
      providers/{registry,types,openaiText,openaiImage,openaiTts,klingImage,klingVideo,comfyuiImage,comfyuiVideo,systemTts,storyLlm,storyDemo}.ts
      media/{ffmpeg,subtitles,assets}.ts
      render/{imageRenderer,demoTemplates}.ts
  preload/index.ts
  shared/{types,ipc,constants}.ts
  renderer/...
tests/
docs/
```

## 6. 数据模型

```ts
Project {
  schemaVersion: 1
  id, title, idea, genre, style, aspect: '9:16' | '16:9'
  language: 'zh'
  episodesCount, episodeDuration, subtitle: boolean, titleCard: boolean
  bgmPath?: string
  bible?: { logline, synopsis, tone, characters[] }
  episodes: { id, index, title, synopsis, shots[] }[]
  stages: Record<StageKey, { status, progress, message?, error?, updatedAt? }>
  createdAt, updatedAt
}

Character {
  id, name, role, description, appearancePrompt, personality, voice, portraitPath?
}

Shot {
  id, episodeId, no, scene, shotSize, cameraMove
  duration, action, dialogue, narration
  imagePrompt, videoPrompt, negativePrompt
  image?: { path, status: 'done'|'stale'|'failed'|'pending', error? }
  audio?: { path, duration, status, error? }
  video?: { path, status, error? }
}
```

存储：`<userData>/projects/<uuid>/project.json` + `assets/{images,audio,videos,exports}`。原子写入（临时文件 + rename），保留 `.bak`。

## 7. 流水线

阶段顺序：`script → characters → storyboard → images → audio → videos → subtitles → render`。

- 每阶段独立状态与进度，失败不中断其他项目。
- 断点续跑：跳过已 `done` 的产物，`force` 可强制重跑。
- 下游失效：改角色 → 镜头图/视频/字幕/成片 stale；改镜头提示词 → 该镜头下游 stale。
- 配音早于视频，视频时长取 `max(计划时长, 配音时长 + 0.3s)`，保证声画对齐。
- LLM 输出经 Zod 校验；失败自动带错误摘要重试一次。

**一键生成**即从第一个未完成阶段跑到 render；每阶段完成即落盘。

## 8. 供应商适配器

统一接口：`TextProvider / ImageProvider / VideoProvider / TtsProvider`。

V1 实现：

| 能力 | Provider |
|---|---|
| 剧本 | OpenAI 兼容 Chat Completions（JSON）、内置演示编剧 |
| 图像 | OpenAI 兼容 Images、可灵、ComfyUI 工作流、演示渲染器 |
| 视频 | 可灵图生视频、ComfyUI 工作流、演示（关键帧 Ken Burns） |
| 配音 | OpenAI 兼容 TTS、系统语音（Windows SAPI / macOS say）、静音 |

演示模式是完整可用链路：模板编剧 → 离屏浏览器渲染中文关键帧 → ffmpeg 运镜 → 系统语音 → 字幕 → 合成。任何真实供应商失败时可回退演示链路并明确提示。

API Key 通过 Electron `safeStorage`（Windows DPAPI / macOS Keychain）加密写入 `settings.json`；渲染进程只拿到掩码值。

## 9. 媒体处理

- 统一归一化：目标分辨率、30fps、SAR 1:1、yuv420p、48kHz 立体声。
- 拼接：concat demuxer，前置片头卡、后置片尾卡。
- 混音：旁白 + BGM（BGM 音量可调，自动循环/裁剪）。
- 字幕：生成 SRT + ASS；可选烧录或外挂；系统字体（微软雅黑 / 苹方）。
- 导出：H.264 + AAC MP4；支持单集与全剧合并；工程包 zip。

## 10. 安全

- `contextIsolation: true`、`nodeIntegration: false`、sandbox 预加载最小暴露面。
- 资产通过自定义协议 `drama-asset://` 读取，路径限制在项目目录内。
- 渲染进程 CSP 限制；外部链接仅允许 https 且走 `shell.openExternal`。
- ffmpeg 参数全部数组传参，不拼接 shell 字符串。

## 11. 打包分发

- Windows：NSIS 安装包（可选目录、桌面快捷方式），本机构建 `release/AI短剧工坊-Setup-1.0.0.exe`。
- macOS：`dmg` + `zip`（x64/arm64），提供 `scripts/build-mac.sh` 与 GitHub Actions；签名/公证通过环境变量启用。
- ffmpeg/ffprobe 二进制 `asarUnpack`，运行时替换 `app.asar → app.asar.unpacked`。

## 12. 验收标准

1. Windows 安装包可安装、启动，无控制台报错。
2. 新建项目 → 演示模式一键生成 → 得到可播放 MP4，时长/分辨率正确。
3. 分镜中修改单镜头提示词并重生成，下游状态正确失效。
4. 设置页可保存/测试供应商，Key 重启后仍生效且不明文暴露给渲染进程。
5. `npm test` 通过；`npm run smoke` 产出 MP4 并以退出码 0 结束。
6. 同一份代码在 macOS 上可执行构建脚本产出 dmg/zip（未签名时给出打开说明）。

## 13. 非目标（V1 不做）

团队协作、社区广场、云同步、无限画布节点编辑器、模型市场、多语言 UI、复杂多轨时间线。数据模型为画布视图预留节点化扩展空间。
