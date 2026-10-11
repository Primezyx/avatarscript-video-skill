#!/usr/bin/env node
import {readFile,writeFile,mkdir,access,mkdtemp} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve,dirname,join,basename,extname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import {spawnSync} from 'node:child_process';
import {assembleLocal} from './local-timing.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const runtime=join(root,'runtime');
const options=Object.fromEntries(['script','out','avatar','tts','lang','voice','rate','model','size','fps','seed','background','avatar-x','avatar-y','avatar-scale','font','work-dir','browser','emotion'].map(k=>[k,{type:'string'}]));
Object.assign(options,{help:{type:'boolean'},subtitles:{type:'boolean'},force:{type:'boolean'}});
const {values:a,positionals}=parseArgs({options,allowPositionals:true,allowNegative:true});
const command=positionals[0] ?? 'help';
function run(bin,args,extra={}) {
 const r=spawnSync(bin,args,{encoding:'utf8',maxBuffer:20*1024*1024,windowsHide:true,...extra});
 if(r.error) throw r.error;
 if(r.status!==0) throw new Error((r.stderr||r.stdout||`${bin} failed`).trim());
 return r.stdout.trim();
}
function number(name,fallback,min,max) {
 const n=Number(a[name]??fallback);
 if(!Number.isFinite(n)||!Number.isInteger(n)||n<min||n>max) throw new Error(`--${name} must be an integer from ${min} to ${max}`);
 return n;
}
function browserPath(){
 const candidates=[a.browser,process.env.PUPPETEER_EXECUTABLE_PATH];
 if(process.platform==='win32') candidates.push(
  join(process.env.ProgramFiles||'C:/Program Files','Google/Chrome/Application/chrome.exe'),
  join(process.env['ProgramFiles(x86)']||'C:/Program Files (x86)','Microsoft/Edge/Application/msedge.exe'),
  join(process.env.LOCALAPPDATA||'','Google/Chrome/Application/chrome.exe'));
 else if(process.platform==='darwin') candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
 else candidates.push('/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser');
 return candidates.find(p=>p&&existsSync(p));
}
function preflight(){
 const [major,minor]=process.versions.node.split('.').map(Number);
 if(major<22||(major===22&&minor<18)) throw new Error('Node.js 22.18+ is required');
 run('ffmpeg',['-version']);run('ffprobe',['-version']);
 const browser=browserPath();
 if(!browser) throw new Error('Chrome/Edge was not found. Pass --browser with an installed browser path.');
 process.env.PUPPETEER_EXECUTABLE_PATH=browser;
 return browser;
}
async function api(){
 const entry=join(runtime,'node_modules/avatarscript/dist/index.js');
 if(!existsSync(entry)) throw new Error('Dependencies missing. Run: node scripts/avatar.mjs setup');
 return import(pathToFileURL(entry).href);
}
function help(){console.log(`AvatarScript video skill
  node scripts/avatar.mjs doctor
  node scripts/avatar.mjs setup
  node scripts/avatar.mjs voices
  node scripts/avatar.mjs make --script story.avs --out video.mp4 [options]
Options:
  --tts windows|mock|elevenlabs|openai|gemini  (default windows)
  --avatar <folder|URL>     default bundled Ani character
  --lang zh-CN|en-US|ja-JP  default from script/text
  --voice <installed name or provider voice> --rate=-1 (Windows -10..10)
  --emotion happy          override face emotion, useful for plain .txt
  --size 1280x720           use 720x1280 for vertical video
  --fps 30 --seed 7 --background <CSS colour|image|transparent>
  --avatar-x 50% --avatar-y 100% --avatar-scale 90%
  --font <font family> --subtitles / --no-subtitles
  --browser <Chrome/Edge path> --work-dir <scratch folder>
  --force                  replace this output and its sidecars
Chinese uses native Windows speech mouth events. Cloud Chinese alignment is not implemented.
Transparent output uses .webm or .mov. No API keys are accepted as command-line flags.`);}
async function main(){
 if(a.help||command==='help'){help();return;}
 if(command==='voices'){
  if(process.platform!=='win32') throw new Error('Local Windows speech requires Windows');
  console.log(run('powershell.exe',['-NoProfile','-NonInteractive','-Command',"Add-Type -AssemblyName System.Speech; $v = New-Object System.Speech.Synthesis.SpeechSynthesizer; $v.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo | Select-Object Name,Culture,Gender } | ConvertTo-Json"]));return;
 }
 if(command==='setup'){
  preflight();
  let npm=join(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
  if(!existsSync(npm)&&process.env.NPM_CLI_JS) npm=process.env.NPM_CLI_JS;
  if(!existsSync(npm)) throw new Error('npm CLI not found beside Node. Run npm ci --prefix <skill>/runtime --ignore-scripts --omit=optional');
  console.log(run(process.execPath,[npm,'ci','--prefix',runtime,'--ignore-scripts','--omit=optional','--no-audit','--no-fund'],{timeout:300000}));
  await api();console.log('Runtime ready.');return;
 }
 if(command==='doctor'){
  const browser=preflight();await api();
  const pkg=JSON.parse(await readFile(join(runtime,'node_modules/avatarscript/package.json'),'utf8'));
  console.log(JSON.stringify({ready:true,node:process.versions.node,avatarscript:pkg.version,browser,localSpeech:process.platform==='win32',sampleAvatar:existsSync(join(root,'assets/ani/rig.json'))},null,2));return;
 }
 if(command!=='make') throw new Error(`Unknown command ${command}`);
 if(!a.script||!a.out) throw new Error('--script and --out are required');
 const browser=preflight(),lib=await api();
 const scriptPath=resolve(a.script),out=resolve(a.out),stem=out.slice(0,-extname(out).length);
 if(!['.mp4','.webm','.mov'].includes(extname(out).toLowerCase())) throw new Error('Output must end in .mp4, .webm or .mov');
 const files=[out,stem+'.wav',stem+'.score.json',stem+'.report.json'];
 if(!a.force&&files.some(existsSync)) throw new Error('Output or sidecar already exists. Use another filename, or --force to replace it.');
 const size=/^(\d+)x(\d+)$/.exec(a.size??'1280x720');
 if(!size||Number(size[1])<64||Number(size[2])<64||Number(size[1])%2||Number(size[2])%2) throw new Error('--size requires even dimensions of at least 64 pixels');
 const fps=number('fps',30,1,120),seed=number('seed',7,0,2147483647),rate=number('rate',-1,-10,10);
 const text=(await readFile(scriptPath,'utf8')).replace(/^\uFEFF/,'');
 const script=extname(scriptPath).toLowerCase()==='.avs'?lib.parseScript(text):lib.plainScript(text);
 if(!script.segments.length) throw new Error('The script contains no speech');
 if(a.emotion){if(!lib.EMOTIONS.includes(a.emotion))throw new Error('Unsupported emotion');script.segments.forEach(s=>s.emotion=a.emotion);}
 const language=a.lang??script.meta.lang??(/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(script.plain)?'ja-JP':/\p{Script=Han}/u.test(script.plain)?'zh-CN':'en-US');
 const culture=({zh:'zh-CN',en:'en-US',ja:'ja-JP'})[language]??language;
 const provider=a.tts??'windows';
 if(/^zh/i.test(culture)&&!['windows','mock'].includes(provider)) throw new Error('Chinese cloud TTS needs a separate Chinese aligner. Use --tts windows for verified local Chinese mouth timing.');
 const avatar=await lib.loadAvatar(a.avatar?resolveAvatar(a.avatar):join(root,'assets/ani'));
 const scratch=resolve(a['work-dir']??join('work','avatarscript',basename(stem)));
 await mkdir(scratch,{recursive:true});await mkdir(dirname(out),{recursive:true});
 const runDir=await mkdtemp(join(scratch,'run-'));
 let score,audio,voices=[];
 if(provider==='windows'){
  if(process.platform!=='win32')throw new Error('Windows local speech is available on Windows only');
  const result=join(runDir,'speech-events.json');
  const segments=script.segments.map((s,i)=>({text:s.text,wav:join(runDir,`speech-${i}.wav`)}));
  const request=join(runDir,'request.json');
  await writeFile(request,JSON.stringify({culture,voice:a.voice??'',rate,result,segments}));
  console.log(run('powershell.exe',['-NoProfile','-NonInteractive','-File',join(root,'scripts/sapi.ps1'),'-Request',request],{timeout:300000}));
  const marks=JSON.parse((await readFile(result,'utf8')).replace(/^\uFEFF/,''));
  if(marks.length!==segments.length)throw new Error('Speech segment count mismatch');
  const compiled=await assembleLocal(script,await Promise.all(segments.map(async(s,i)=>({pcm:await lib.readAudio(s.wav),marks:marks[i]}))));
  voices=[...new Set(marks.map(m=>m.voice))];
  audio={samples:compiled.samples,sampleRate:compiled.sampleRate};
  score=lib.ScoreSchema.parse({format:'avatarscript-score/1',lang:culture,audio:basename(stem)+'.wav',duration:compiled.duration,visemes:compiled.visemes,speaking:compiled.speaking,cues:compiled.cues,captions:compiled.captions,provenance:{tts:{provider:'windows-sapi',voices,rate,timing:'native word and viseme events',mouthMapping:'sapi-to-avatar-v1'},script:basename(scriptPath)}});
 }else{
  const preset=avatar.manifest.voice?.[provider]??{};
  const tts=lib.createTts({provider,voice:a.voice??preset.voice,model:a.model??preset.model,options:preset.options,cacheDir:join(scratch,'tts-cache')});
  ({score,audio}=await lib.compile(script,tts,{lang:culture.split('-')[0],audioName:basename(stem)+'.wav',baseDir:dirname(scriptPath)}));
  voices=[tts.voice];
 }
 const meta=script.meta;
 const subtitleMap={'subtitle-font':'font','subtitle-size':'size','subtitle-weight':'weight','subtitle-color':'color','subtitle-outline':'outline','subtitle-background':'background','subtitle-position':'position','subtitle-margin':'margin','subtitle-max-width':'maxWidth'};
 const style={font:/^zh/i.test(culture)?'Microsoft YaHei, Noto Sans CJK SC, sans-serif':lib.DEFAULT_SUBTITLE_FONT,size:Math.round(Math.min(Number(size[1]),Number(size[2]))*0.055)+'px',background:'rgba(21,34,56,0.65)',outline:'#152238'};
 for(const [key,value] of Object.entries(meta))if(subtitleMap[key])style[subtitleMap[key]]=value;
 if(a.font)style.font=a.font;
 const subtitles=a.subtitles??!['off','false'].includes(meta.subtitles);
 score.subtitles=subtitles?lib.SubtitleStyleSchema.parse(style):null;
 const fitScale=Math.min(90,98*Number(size[1])/Number(size[2])/lib.avatarAspect(avatar.rig,Math.max(0,avatar.rig.view?.padTop??0)));
 const defaultY=Number(size[2])>Number(size[1]) ? (50+fitScale/2).toFixed(2)+'%' : '100%';
 const view={background:meta.background??'#e9edf2',avatarX:meta['avatar-x']??'50%',avatarY:meta['avatar-y']??defaultY,avatarScale:meta['avatar-scale']??fitScale.toFixed(2)+'%'};
 const viewKeys={background:'background','avatar-x':'avatarX','avatar-y':'avatarY','avatar-scale':'avatarScale'};
 for(const [key,field] of Object.entries(viewKeys))if(a[key]!==undefined)view[field]=a[key];
 if(/\.(png|jpe?g|webp)$/i.test(view.background))view.background=resolve(dirname(scriptPath),view.background);
 score.view=lib.ViewSchema.parse(view);
 score=lib.ScoreSchema.parse(score);
 if(score.view.background==='transparent'&&extname(out).toLowerCase()==='.mp4')throw new Error('Transparent output requires .webm or .mov');
 await writeFile(stem+'.wav',lib.toWav(audio));
 await writeFile(stem+'.score.json',JSON.stringify(score,null,2));
 console.log(`Rendering ${score.duration.toFixed(2)} seconds...`);
 await lib.render({avatar,score,audioPath:stem+'.wav',out,width:Number(size[1]),height:Number(size[2]),fps,seed});
 const probe=JSON.parse(run('ffprobe',['-v','error','-show_entries','format=duration,size:stream=codec_name,codec_type,width,height','-of','json',out]));
 if(!probe.streams.some(s=>s.codec_type==='video')||!probe.streams.some(s=>s.codec_type==='audio')||Math.abs(Number(probe.format.duration)-score.duration)>0.3)throw new Error('Rendered file failed media checks');
 run('ffmpeg',['-v','error','-i',out,'-f','null','-'],{timeout:300000});
 const report={output:out,provider,voices,language:culture,duration:score.duration,width:Number(size[1]),height:Number(size[2]),fps,avatar:avatar.manifest.name,score:stem+'.score.json',audio:stem+'.wav',scratch:runDir,verified:true,warnings:provider==='windows'?['Local desktop voice quality; facial emotion does not change vocal emotion.','Mouth shapes approximate speech using the avatar mouth set.']:provider==='mock'?['Mock buzzing sound; not real speech.']:[]};
 await writeFile(stem+'.report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
function resolveAvatar(value){return /^https?:\/\//i.test(value)?value:resolve(value);}
main().catch(e=>{console.error('avatarscript-video:',e.message);process.exitCode=1;});