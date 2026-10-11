# AvatarScript Video Skill

让 AI 助手使用 [AvatarScript](https://github.com/receptron/avatarscript) 制作角色口播视频，附带 Windows 中文配音和口型适配。

这是基于 AvatarScript 0.4.0 的独立技能封装，包含操作指引、命令行助手、中文语音适配器和 Ani 示例角色。视频渲染仍由原项目完成，不是上游官方发布。

## 可以做什么

- 从中文文本或 `.avs` 脚本生成角色口播视频。
- 使用已安装的 Windows 中文语音，默认无需付费 API。
- 根据实际配音产生的嘴型事件驱动角色口型，并保留停顿、动作和表情提示。
- 生成中文字幕，支持横屏、竖屏和自定义角色包。
- 输出视频、配音 WAV、时间轴和检查报告。

中文默认音色为系统匹配的中文语音；已实际测试 **Microsoft Huihui Desktop（慧慧）**。中文配音目前仅验证了 Windows 本地语音路径。

## 环境要求

- Windows，已安装中文桌面语音。
- Node.js **22.18 或更新版本**，以及 npm。
- FFmpeg、ffprobe，可以从命令行调用。
- 已安装 Chrome 或 Edge。

首次安装需要联网下载锁定版本的 npm 依赖。安装完成后，本地中文配音不需要云端 API 密钥。仓库不包含 `node_modules`、浏览器或语音引擎。

## 安装到 Codex

在 PowerShell 中运行，目标文件夹需要尚不存在：

```powershell
$skillDir = Join-Path $env:USERPROFILE '.codex\skills\avatarscript-video'
git clone https://github.com/Primezyx/avatarscript-video-skill.git "$skillDir"
node "$skillDir/scripts/avatar.mjs" setup
node "$skillDir/scripts/avatar.mjs" doctor
node "$skillDir/scripts/avatar.mjs" voices
```

重新打开或新建 Codex 会话后，可以这样使用：

```text
$avatarscript-video 让阿妮用中文说“你好！很高兴认识你。”，加字幕，输出竖屏视频。
```

也可以直接在对话中说明要使用 AvatarScript 制作中文角色口播。若你的客户端采用其他技能目录，把整个仓库放进该客户端支持的技能目录，并保留 `SKILL.md` 和相邻文件的结构。

## 直接生成示例

在任意工作目录运行：

```powershell
$skillDir = Join-Path $env:USERPROFILE '.codex\skills\avatarscript-video'
node "$skillDir/scripts/avatar.mjs" make --script "$skillDir/assets/chinese-demo.avs" --out "outputs/chinese-demo.mp4" --tts windows --lang zh-CN --work-dir "work/chinese-demo"
```

竖屏加上 `--size 720x1280`；指定音色使用 `--voice "Microsoft Huihui Desktop"`。已有输出默认不会被覆盖，需要替换时添加 `--force`。

自己的脚本可以写成 UTF-8 `.avs` 文件：

```text
---
lang: zh-CN
subtitles: on
subtitle-font: Microsoft YaHei
---
[emotion:happy] <greet>你好！很高兴认识你。
[pause:600ms]
[emotion:relaxed] <nod>我们下次再见！
```

纯文字也可以保存为 UTF-8 `.txt`。完整指引见 [SKILL.md](SKILL.md)，依赖、语音服务和故障处理见 [operation.md](references/operation.md)。

## 中文口型的实现与边界

适配器从 Windows `System.Speech` 读取真实语音的字词和嘴型事件，映射到 AvatarScript 的角色嘴型，避免将中文汉字送入上游的日语读音流程。时间轴根据每次实际合成的语音生成，没有写死“你好”等示例词的时间。

这是受角色嘴型数量限制的近似口型动画，不能保证所有音色都达到逐音素精度；词内字符时刻会在必要时插值。桌面语音的自然度有限，角色的表情指令不会改变声音的情绪。缺少匹配音色或嘴型事件时会报告错误。

中文云端配音、任意中文录音的自动对齐尚未支持。上游英语/日语云端服务入口保留，需要自行配置对应环境变量和依赖，这些路径未纳入本技能的离线验收。

自定义角色需要已有的 `rig.json` 和 `built/` 素材，或 `avatar.json`。本技能不会把单张图片直接转换为可驱动角色，也不负责制作 Live2D/VRM 模型。

## 检查

```powershell
node --test scripts/local-timing.test.mjs
node --check scripts/avatar.mjs
```

时间轴测试覆盖重复时间戳、缺少嘴型事件、Unicode 字符偏移和显式停顿。已在 Windows 实际验证中文横屏、竖屏输出以及解压后安装运行；更换角色或音色后仍应检查视频中的口型效果。

## 来源和许可证

- 原项目：[receptron/avatarscript](https://github.com/receptron/avatarscript)，运行时固定为 npm `avatarscript@0.4.0`，遵循其 MIT 许可证。
- Ani 示例角色取自上游提交 `fadfc738274d39869c6c781e3c5e4d8dedb3fb97`；原作者版权声明保留在 [assets/LICENSE.receptron](assets/LICENSE.receptron)。
- 本仓库新增的技能指引和适配代码采用 [MIT 许可证](LICENSE)。第三方依赖遵循各自许可证。
