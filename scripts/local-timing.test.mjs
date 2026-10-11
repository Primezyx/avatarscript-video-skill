import test from 'node:test';
import assert from 'node:assert/strict';
import {mouthEvents,speechSpans,characterTimes,assembleLocal} from './local-timing.mjs';

test('preserves consonant and vowel when the speech engine shares timestamps',()=>{
 const events=mouthEvents({visemes:[{time:0.1,duration:0.04,id:19},{time:0.1,duration:0.06,id:6},{time:0.3,duration:0.2,id:0}]},0.6);
 assert.ok(events.some(([t,v])=>t===0.1&&v==='nn'));
 assert.ok(events.some(([t,v])=>Math.abs(t-0.14)<0.001&&v==='ih'));
 assert.deepEqual(speechSpans(events),[[0.1,0.3]]);
 for(let i=1;i<events.length;i++)assert.ok(events[i][0]>events[i-1][0]);
});
test('does not invent mouth timing for a voice without viseme events',()=>{
 assert.throws(()=>mouthEvents({visemes:[]},1),/no mouth timing/);
});
test('converts UTF-16 word offsets to code points without shifting later Chinese text',()=>{
 const text='A😀你！';
 const times=characterTimes(text,{words:[{time:0.1,offset:0,count:1},{time:0.4,offset:3,count:1}]},[[0,'sil'],[0.1,'ih'],[0.7,'sil']],1);
 assert.equal(times.length,4);assert.equal(times[2].start,0.4);assert.equal(times[2].end,0.7);
});
test('arbitrary words keep script cue anchors, explicit silence and PCM length aligned',()=>{
 const script={plain:'苹果再见',segments:[{text:'苹果',offset:0,emotion:'neutral',pauseBefore:0},{text:'再见',offset:2,emotion:'happy',pauseBefore:0.7}],cues:[{motion:'nod',offset:2,segment:1}],pauseAfter:0.2};
 const part=()=>({pcm:{samples:new Float32Array(19200),sampleRate:24000},marks:{words:[{time:0.1,offset:0,count:2}],visemes:[{time:0.1,duration:0.4,id:6},{time:0.5,duration:0.3,id:0}]}});
 const result=assembleLocal(script,[part(),part()]);
 assert.equal(result.duration,3.7);
 assert.equal(result.samples.length,3.7*24000);
 assert.deepEqual(result.speaking,[[0.5,0.9],[2,2.4]]);
 assert.ok(result.cues.some(c=>c.motion==='nod'&&c.t===2));
 assert.ok(result.samples.slice(28800,45600).every(v=>v===0));
 assert.deepEqual(result.captions.map(c=>c.text),['苹果','再见']);
});