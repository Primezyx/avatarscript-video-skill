// SAPI mouth shapes -> AvatarScript's reduced mouth set. Event times come from audio.
// Microsoft documents the ID table for English; Huihui emits these IDs for Mandarin too.
const SHAPES = [
 ['sil'],['aa'],['aa'],['oh'],['E'],['RR'],['ih'],['ou'],['oh','ou'],
 ['aa','ou'],['oh','ih'],['aa','ih'],['aa'],['RR'],['nn'],['SS'],['CH'],
 ['TH'],['FF'],['nn'],['kk'],['PP']
];
const spoken = c => !/[\s\p{P}\p{S}]/u.test(c);
export const round = n => Math.round(n * 10000) / 10000;
export function mouthEvents(marks, duration) {
 const source = marks.visemes.map((v,i) => ({...v,index:i})).sort((a,b)=>a.time-b.time || a.index-b.index);
 if (!source.some(v=>v.id>0)) throw new Error('This voice returned no mouth timing. Choose a voice with SAPI viseme events; no guessed lip sync was generated.');
 if (source.some(v=>!Number.isFinite(v.time)||!Number.isFinite(v.duration)||v.duration<0||!Number.isInteger(v.id)||!SHAPES[v.id])) throw new Error('Invalid SAPI viseme event');
 const result = [[0,'sil']];
 for (let i=0;i<source.length;) {
  let j=i+1; while(j<source.length && Math.abs(source[j].time-source[i].time)<1e-7) j++;
  const group=source.slice(i,j), start=Math.max(0,source[i].time), next=Math.min(duration,source[j]?.time ?? duration);
  if (start>=duration) break;
  const total=group.reduce((n,v)=>n+Math.max(v.duration,0.001),0);
  let at=start;
  for(const v of group) {
   // Some voices emit consonant and vowel at the same offset. Keep both in order.
   const span=group.length===1 ? next-start : Math.min(total,next-start)*Math.max(v.duration,0.001)/total;
   const shapes=SHAPES[v.id];
   shapes.forEach((shape,k)=>result.push([round(at+span*k/shapes.length),shape]));
   at+=span;
  }
  i=j;
 }
 result.push([round(duration),'sil']);
 const normalized=[];
 for(const event of result.sort((a,b)=>a[0]-b[0])) {
  if(normalized.length && normalized.at(-1)[0]===event[0]) normalized[normalized.length-1]=event;
  else if(normalized.at(-1)?.[1]!==event[1]) normalized.push(event);
 }
 return normalized;
}
export function speechSpans(events) {
 const spans=[]; let start=null;
 for(const [t,shape] of events) {
  if(shape!=='sil' && start===null) start=t;
  if(shape==='sil' && start!==null) { if(t>start) spans.push([start,t]); start=null; }
 }
 return spans;
}
export function characterTimes(text, marks, events, duration) {
 const chars=Array.from(text), times=chars.map(()=>null);
 const words=marks.words.filter(w=>Number.isFinite(w.time)&&Number.isInteger(w.offset)&&Number.isInteger(w.count)).sort((a,b)=>a.time-b.time);
 if(!words.length) throw new Error('This voice returned no word timing');
 for(let i=0;i<words.length;i++) {
  const w=words[i];
  const start=Math.max(0,Math.min(duration,w.time));
  const silence=events.find(e=>e[1]==='sil' && e[0]>start+0.02)?.[0] ?? duration;
  const end=Math.max(start,Math.min(duration,words[i+1]?.time ?? duration,silence));
  // Speech API positions are UTF-16; AvatarScript anchors count Unicode code points.
  const from=Array.from(text.slice(0,w.offset)).length;
  const count=Array.from(text.slice(w.offset,w.offset+w.count)).length;
  for(let k=0;k<count && from+k<times.length;k++) times[from+k]={start:start+(end-start)*k/count,end:start+(end-start)*(k+1)/count};
 }
 for(let i=0;i<times.length;i++) if(!times[i]) {
  const before=times.slice(0,i).findLast(Boolean)?.end ?? 0;
  const after=times.slice(i+1).find(Boolean)?.start ?? duration;
  times[i]={start:before,end:Math.max(before,after)};
 }
 return times;
}
export function captionsFor(text,times,offset) {
 const chars=Array.from(text), captions=[]; let start=0;
 for(let i=0;i<chars.length;i++) {
  if(!/[。！？!?；;\n]/u.test(chars[i]) && i<chars.length-1) continue;
  const indices=[]; for(let k=start;k<=i;k++) if(spoken(chars[k])) indices.push(k);
  const line=chars.slice(start,i+1).join('').trim();
  if(indices.length && line) captions.push({start:round(offset+times[indices[0]].start),end:round(offset+times[indices.at(-1)].end+0.35),text:line});
  start=i+1;
 }
 return captions;
}
export function assembleLocal(script,segments,{lead=0.4,tail=0.8,gap=0.1}={}) {
 const rate=24000, parts=[],visemes=[],speaking=[],cues=[],captions=[],ranges=[],charTimes=new Map();
 let samples=0;
 const silence=seconds=>{const p=new Float32Array(Math.round(seconds*rate));parts.push(p);samples+=p.length;};
 for(let i=0;i<script.segments.length;i++) {
  const segment=script.segments[i], {pcm,marks}=segments[i];
  if(pcm.sampleRate!==rate) throw new Error('Expected resampled 24 kHz audio');
  silence(i===0 ? lead+segment.pauseBefore : segment.pauseBefore || gap);
  const offset=samples/rate,duration=pcm.samples.length/rate;
  const events=mouthEvents(marks,duration),spans=speechSpans(events),times=characterTimes(segment.text,marks,events,duration);
  const ownSpans=spans.map(([a,b])=>[round(a+offset),round(b+offset)]);
  ranges.push({start:ownSpans[0]?.[0] ?? offset,end:ownSpans.at(-1)?.[1] ?? offset+duration});
  times.forEach((t,k)=>charTimes.set(segment.offset+k,{start:t.start+offset,end:t.end+offset}));
  visemes.push(...events.map(([t,v])=>[round(t+offset),v]));
  speaking.push(...ownSpans);
  cues.push({t:round(Math.max(0,ranges[i].start-0.15)),emotion:segment.emotion});
  captions.push(...captionsFor(segment.text,times,offset));
  parts.push(pcm.samples);samples+=pcm.samples.length;
 }
 silence(script.pauseAfter+tail);
 const plain=Array.from(script.plain);
 for(const cue of script.cues) {
  const segment=script.segments[cue.segment]; let t=ranges.at(-1)?.end ?? 0;
  if(segment) {
   t=ranges[cue.segment].end;
   for(let k=Math.max(cue.offset,segment.offset);k<segment.offset+Array.from(segment.text).length;k++) if(spoken(plain[k])&&charTimes.has(k)) {t=charTimes.get(k).start;break;}
  }
  const {offset:_,segment:__,...action}=cue;
  cues.push({t:round(t),...action});
 }
 captions.forEach((c,i)=>c.end=round(Math.min(c.end,captions[i+1]?.start ?? samples/rate)));
 const audio=new Float32Array(samples);let cursor=0;for(const p of parts){audio.set(p,cursor);cursor+=p.length;}
 return {samples:audio,sampleRate:rate,duration:samples/rate,visemes,speaking,cues:cues.sort((a,b)=>a.t-b.t),captions};
}