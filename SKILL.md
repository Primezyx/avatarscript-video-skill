---
name: avatarscript-video
description: Create talking-avatar videos with AvatarScript from text or .avs scripts, including Chinese voice, lip sync, emotions, gestures, subtitles, and landscape or portrait output. Use for AvatarScript, 角色口播, 中文数字人配音, or making an existing mesh avatar speak. Character rig creation and general scene-based video editing are separate tasks.
---

# AvatarScript video

Produce a speaking-character video with the bundled AvatarScript 0.4.0 runtime and a prepared mesh avatar. This skill includes the MIT-licensed Ani sample and a Windows speech adapter. Use the scripts here; they resolve assets and dependencies relative to this skill, not to the original development chat.

## Use

Treat `SKILL_DIR` below as this SKILL.md's directory. Run commands from the current task workspace. Put temporary inputs and synthesis data in the task's `work/` directory and final videos/sidecars in its output directory. Always quote paths.

1. Run `node "SKILL_DIR/scripts/avatar.mjs" doctor`. On Windows, `voices` lists local voices. If runtime dependencies are missing, run `setup`, which installs the locked npm dependencies without installation scripts. Node.js 22.18+, ffmpeg, ffprobe, and an installed Chrome/Edge are required. `--browser` can select another existing browser executable. See [operation details](references/operation.md) only for setup issues or non-default providers.
2. Reuse the user's supplied text, avatar, and voice. When unspecified, use the bundled Ani character, Windows local speech, Chinese for Chinese text, 1280x720 at 30 fps, and subtitles. Use 720x1280 for a requested portrait clip. A real character package requires rig.json plus built/ assets, or avatar.json; a single image is not a ready avatar.
3. Save a UTF-8 `.avs` file for direction, or `.txt` for literal speech. Add restrained motions and emotions when the request calls for performance. Keep the user's spoken wording intact unless rewriting was requested.
4. Run the helper, for example:

```powershell
node "SKILL_DIR/scripts/avatar.mjs" make --script "work/story.avs" --out "outputs/avatar.mp4" --tts windows --lang zh-CN --work-dir "work/avatar-render"
```

5. Read the generated `.report.json`, inspect frames during speech and pauses, and show the video. The helper checks codecs, duration, and full decode. For a new avatar, voice, or unusual text, also inspect the resulting mouth movement; a technical pass alone does not establish perceptual lip-sync accuracy. State the chosen voice and any material limitation briefly.

Installed skill invocation example: `$avatarscript-video 让阿妮用中文读这段台词，加字幕，输出竖屏视频。`

## Script and controls

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

- Face emotions: `neutral happy sad angry surprised relaxed`.
- Sample motions: `nod tilt think giggle surprise shy no wink greet`. An arbitrary avatar may have a different motion list; the renderer checks it.
- `<motion>` starts at the next spoken character; a motion after the line's final spoken character starts at its end. `[pause:600ms]` inserts silence.
- `[gaze:left]` and `*emphasis*` are not rendered by the current engine. Do not promise those effects.
- Plain `.txt` is spoken literally. Escape literal markup in `.avs` with a backslash.
- `--size`, `--font`, `--background`, `--avatar-x`, `--avatar-y`, `--avatar-scale`, and `--no-subtitles` control presentation. Script front matter accepts AvatarScript subtitle/view settings. Explicit flags take priority.
- `--rate=-1` controls Windows speech rate, from -10 to 10; `--voice` selects an installed voice. `--emotion` overrides the face emotion for all segments.
- Transparent output requires `.webm` or `.mov`; ordinary output is `.mp4`. Do not use an alpha background with MP4.
- Existing outputs are protected by default. Use a new name unless replacing that output is intended, then pass `--force`.

## Chinese speech and mouth timing

For Mandarin use `--tts windows --lang zh-CN`. The tested voice is Microsoft Huihui Desktop. `sapi.ps1` synthesizes the actual script and captures native word and viseme events. `local-timing.mjs` maps these events to the avatar mouth set, handles repeated timestamps, Unicode offsets, punctuation, pauses, and script cue anchors. It does not route Chinese characters through AvatarScript's Japanese reading code, and contains no hardcoded phrase or word timings.

The result is approximate mouth animation with the available avatar shapes. Word-internal character times are interpolated when the voice reports an entire word. Desktop speech sounds less natural than modern neural voices; face emotion does not change this voice's emotional delivery. Local Windows speech requires installed matching voices and usable mouth events. Fail with an explanation when these are missing; do not silently replace speech with buzzing or fabricated alignment.

The upstream cloud providers remain usable for English/Japanese, with their credentials and alignment dependencies. Chinese cloud speech and arbitrary recorded Chinese audio need their own Chinese alignment adapter; this skill does not claim to support them. See [providers and limitations](references/operation.md).

## Packaging and maintenance

Runtime version and dependencies are pinned in `runtime/package.json` and its lockfile. The zip excludes node_modules; `setup` restores them. The installed local skill can retain its ready runtime. Keep the sample-avatar license in `assets/LICENSE.receptron` and runtime licenses when redistributing.

After changing mouth timing, run `node --test "SKILL_DIR/scripts/local-timing.test.mjs"`, render `assets/chinese-demo.avs`, and inspect speaking and silent frames. Record what was actually tested; do not treat a successful demo as validation of every voice or language.