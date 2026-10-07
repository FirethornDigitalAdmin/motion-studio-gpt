import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';import{clips,sample,FPS}from'../rig/runtime.mjs';import{PNG}from'pngjs';
const root=path.resolve('assets/louis-animation-pack'),manifest=JSON.parse(fs.readFileSync(root+'/parts/index.json'));const report={date:'2026-10-06',parts:Object.keys(manifest).length,clips:clips.length,checks:[],studies:[],clipMetrics:{}};
for(const [id,a] of Object.entries(manifest)){const p=PNG.sync.read(fs.readFileSync(root+'/'+a.file));assert.equal(p.width,a.width);assert.equal(p.height,a.height);assert(p.data.some((v,i)=>i%4===3&&v===0));assert(p.data.some((v,i)=>i%4===3&&v>128));}
report.checks.push('All production PNGs decode, have opaque artwork and actual zero-alpha pixels.');
for(const c of clips){let maxIK=0,outOfBounds=0;for(let i=0;i<Math.ceil(c.duration*FPS);i++){
 const s=sample(c.id,i/FPS);for(const p of s.parts){assert(manifest[p.asset],c.id+': missing '+p.asset);for(const n of ['x','y','width','height','rotation'])assert(Number.isFinite(p[n]),c.id+': '+n);}
 maxIK=Math.max(maxIK,...Object.values(s.ikError));
 }report.clipMetrics[c.id]={maxTargetReachError:Number(maxIK.toFixed(3)),frames:Math.ceil(c.duration*FPS)};if(maxIK>1)report.studies.push({id:c.id,reason:'Target outside IK reach by '+maxIK.toFixed(2)+' px; contact/pose cleanup required.'});
}
report.checks.push('Every frame has finite transforms and resolves to supplied artwork.');
for(const id of ['walk','run','carry_walk','carry_run','combo_walk_cup','combo_run_box','combo_walk_talk']){
 const c=clips.find(c=>c.id===id),period=id.includes('run')||id==='run'?2/3:1,speed=id.includes('run')||id==='run'?330:150;
 let maxSlip=0,maxHeight=0;for(let i=0;i<5;i++){const t=.04+i*.035,s=sample(id,t,{rootMotion:true}),next=sample(id,t+.001,{rootMotion:true});maxSlip=Math.max(maxSlip,Math.abs(s.attachments.foot_R.x-next.attachments.foot_R.x));maxHeight=Math.max(maxHeight,Math.abs(s.attachments.foot_R.y-1166));}
 assert(maxSlip<.01,id+': foot slides '+maxSlip);assert(maxHeight<.02,id+': foot height '+maxHeight);report.clipMetrics[id].stanceSlipPerMillisecond=maxSlip;
}
report.checks.push('Root-motion stance contacts in walk/run and carrying combinations remain planted (<0.01 px change per 1 ms sample).');
for(const [id,event]of[['pickup',1.3],['combo_pickup',1.3],['place',1.8],['pass',2.05],['drop',.75]]){
 const before=sample(id,event-.00001),after=sample(id,event+.00001),d=Math.hypot(before.attachments.prop.x-after.attachments.prop.x,before.attachments.prop.y-after.attachments.prop.y);report.clipMetrics[id].propEventJump=d;assert(d<3,id+' prop jump '+d);
}
report.checks.push('Prop attachment/release transitions tested within 3 px at explicit event times.');
const neutral=sample('walk',.2,{speech:true,expression:'neutral'}),angry=sample('walk',.2,{speech:true,expression:'angry'});assert.equal(neutral.mouth,angry.mouth);assert.notEqual(neutral.parts.find(p=>p.name==='brow_R').rotation,angry.parts.find(p=>p.name==='brow_R').rotation);
const held=sample('walk',.2,{action:'hold_two',speech:true});assert.equal(held.mouth,neutral.mouth);assert.deepEqual(held.attachments.foot_R,neutral.attachments.foot_R);assert.equal(held.prop,'box');
report.checks.push('Speech retains ownership during emotional changes; upper-body carrying preserves locomotion and speech.');
for(const c of clips){const f=root+'/atlases/'+c.id+'/atlas.json';if(!fs.existsSync(f))continue;const m=JSON.parse(fs.readFileSync(f));assert.equal(m.frames.length,Math.ceil(c.duration*FPS));let edgeFrames=0;for(const frame of m.frames){const png=PNG.sync.read(fs.readFileSync(root+'/frames/'+c.id+'/'+frame.name.split('/')[1]+'.png'));const at=(x,y)=>png.data[(y*png.width+x)*4+3];let hits=0;for(let x=0;x<png.width;x++)hits+=at(x,0)>50||at(x,png.height-1)>50;for(let y=0;y<png.height;y++)hits+=at(0,y)>50||at(png.width-1,y)>50;if(hits)edgeFrames++;}
 report.clipMetrics[c.id].croppedEdgeFrames=edgeFrames;if(edgeFrames)report.studies.push({id:c.id,reason:edgeFrames+' rendered frames touch canvas edges.'});
 for(const pg of m.pages){const p=PNG.sync.read(fs.readFileSync(root+'/atlases/'+c.id+'/'+pg.file));assert.equal(p.width,pg.width);assert.equal(p.height,pg.height);assert(p.width<=4096&&p.height<=4096);}
}
report.checks.push('Available atlases checked for frame counts, dimensions, page limits, decoding and transparent-frame edge cropping.');
fs.writeFileSync(root+'/validation/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({checks:report.checks,studies:report.studies},null,2));
