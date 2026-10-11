# Operation and dependencies

The runtime is AvatarScript 0.4.0 from https://github.com/receptron/avatarscript; the sample assets come from commit fadfc738274d39869c6c781e3c5e4d8dedb3fb97. No edits to upstream source are required.

## Setup

Run `node scripts/avatar.mjs doctor` and `node scripts/avatar.mjs voices` relative to the skill folder, or use absolute script paths from any workspace. `setup` runs npm ci against the bundled lockfile with --ignore-scripts --omit=optional, reusing an existing browser. If npm is not found beside Node, point NPM_CLI_JS to its npm-cli.js, or run `npm ci --prefix "SKILL_DIR/runtime" --ignore-scripts --omit=optional --no-audit --no-fund` directly. Dependencies and download access are still required on a new machine.

On a machine without a detected Chrome/Edge, pass `--browser` or set PUPPETEER_EXECUTABLE_PATH for the process. A local Windows speech run uses powershell.exe and System.Speech; it does not modify voice installation or execution policy. If Windows blocks the speech script, report the exact error and honor local execution policy.

Output: video, mixed WAV, score.json, and report.json. Intermediate requests, native speech events, and per-segment audio remain under --work-dir for diagnosis. These files include the user's spoken text. `--force` replaces only the selected video and sidecars.

## Providers

- `windows`: default; offline installed Windows voices. zh-CN defaults to a matching installed Chinese voice. Rate is -10..10, default -1. New voices require a real render check.
- `mock`: upstream buzzing sound with artificial timing, only for pipeline tests. It is never a real voice fallback.
- `elevenlabs`: upstream provider for English/Japanese, reads ELEVENLABS_API_KEY. Avatar voice presets apply unless --voice/--model overrides them.
- `openai`, `gemini`: upstream providers for English/Japanese, read OPENAI_API_KEY or GEMINI_API_KEY. They additionally need onnxruntime-node and download the upstream alignment model (about 635 MB) on first use. Add the optional runtime dependency only for a requested provider. These paths have not been exercised by this skill's offline acceptance test.

Do not copy API keys into skill files, command flags, scripts, scores, or packages. The helper reads inherited environment variables and does not automatically scan unrelated .env files. No paid provider is selected as a fallback.

Chinese cloud TTS is deliberately rejected by this helper: upstream Han-character alignment/G2P uses Japanese readings. Supporting a new Chinese voice pipeline requires native mouth timestamps or a Chinese phonetic/alignment adapter, not merely changing the language label.

## Native timing

The SAPI viseme ID reference is Microsoft's SpeechSynthesizer.VisemeReached documentation:
https://learn.microsoft.com/en-us/dotnet/api/system.speech.synthesis.speechsynthesizer.visemereached?view=netframework-4.8.1

Microsoft documents the IDs for US English; the installed Huihui voice also emits these mouth IDs for Chinese. The helper maps the returned mouth categories to AvatarScript's reduced shapes, including transitions for diphthongs. This is a visual approximation, not a claim of phoneme-level accuracy for every SAPI voice. The adapter fails if a voice emits no mouth events.

Speech API text offsets use UTF-16. AvatarScript script anchors use Unicode code points. The adapter converts offsets before scheduling gestures/captions. Native events that share a timestamp are distributed within the next event boundary, preserving short consonants instead of dropping them.

The original avatar package determines the final range of expressions and mouth drawings. This skill does not create or convert Live2D/VRM rigs or produce unconstrained body animation.