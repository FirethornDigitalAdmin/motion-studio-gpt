import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {projectSchema,layerSchema} from '../../../src/model.ts';
import {clips,sample,W,H,FPS} from '../rig/runtime.mjs';
const root=path.resolve('assets/louis-animation-pack');const parts=JSON.parse(fs.readFileSync(root+'/parts/index.json'));
const assets=Object.entries(parts).map(([id,p])=>{const bytes=fs.readFileSync(root+'/'+p.file),hash=crypto.createHash('sha256').update(bytes).digest('hex');return{id,originalName:id+'.png',relativePath:'assets/'+hash+'.png',type:'image',hash};});
function scene(c,start=0,scale=1,ox=0,oy=0){
 const samples=[];for(let i=0;i<=Math.ceil(c.duration*FPS);i++)samples.push(sample(c.id,Math.min(c.duration,i/FPS)));
 const names=[...new Set(samples.flatMap(p=>p.parts.map(a=>a.name)))];
 const layers=names.map(name=>{
  const base=samples.find(s=>s.parts.some(p=>p.name===name)).parts.find(p=>p.name===name);
  const keys={};for(const prop of ['x','y','rotation','width','height','anchorX','anchorY','assetId','opacity']){
   keys[prop]=samples.map(s=>{const p=s.parts.find(p=>p.name===name);let value=p?(prop==='assetId'?p.asset:prop==='anchorX'?p.anchor.x:prop==='anchorY'?p.anchor.y:prop==='opacity'?1:p[prop]):prop==='opacity'?0:prop==='assetId'?base.asset:prop==='anchorX'?base.anchor.x:prop==='anchorY'?base.anchor.y:base[prop];
    if(prop==='x')value=value*scale+ox;if(prop==='y')value=value*scale+oy;if(prop==='width'||prop==='height')value*=scale;return{time:s.time,value,easing:'linear'};
   });
   // Keep switches keyed; numeric constants need only one key.
   if(keys[prop].every(k=>k.value===keys[prop][0].value))delete keys[prop];
  }
  return layerSchema.parse({id:c.id+'-'+name,type:'image',name,visible:true,locked:false,start:0,duration:c.duration,x:base.x*scale+ox,y:base.y*scale+oy,scale:1,rotation:base.rotation,opacity:1,anchor:base.anchor,keyframes:keys,props:{width:base.width*scale,height:base.height*scale,assetId:base.asset,actor:'Louis'}});
 });
 // Native ordering follows rest sampler; absent pupil layers remain in their original facial group.
 const order=['upper_arm_L','forearm_L','pelvis','shin_L','thigh_L','foot_L','shin_R','thigh_R','foot_R','neck','torso','head','eye_R','pupil_R','brow_R','eye_L','pupil_L','brow_L','mouth','upper_arm_R','forearm_R','prop','hand_L','hand_R'];layers.sort((a,b)=>(a.name.startsWith('environment_')?-1:order.indexOf(a.name))-(b.name.startsWith('environment_')?-1:order.indexOf(b.name)));
 return{id:c.id,name:c.label,start,duration:c.duration,layers,shots:[]};
}
function save(folder,p){fs.mkdirSync(folder+'/assets',{recursive:true});const used=new Set(p.scenes.flatMap(s=>s.layers.flatMap(l=>[l.props.assetId,...(l.keyframes.assetId||[]).map(k=>k.value)])));p.assets=assets.filter(a=>used.has(a.id));projectSchema.parse(p);
 for(const a of p.assets){const dest=folder+'/'+a.relativePath;if(!fs.existsSync(dest))fs.copyFileSync(root+'/'+parts[a.id].file,dest);}
 fs.writeFileSync(folder+'/project.json',JSON.stringify(p));
}
fs.mkdirSync(root+'/native',{recursive:true});
for(const c of clips){const p={version:1,name:'Louis - '+c.label,settings:{durationSec:c.duration,aspect:'custom',width:W,height:H,fps:FPS,background:'rgba(0,0,0,0)'},assets:[],scenes:[scene(c)]};save(root+'/native/'+c.id+'.motion',p);}
let start=0;const scenes=clips.filter(c=>c.group==='Combinations').map(c=>{const s=scene(c,start,1.5,768,130);start+=c.duration;return s;});
const demo={version:1,name:'Louis - Animation Pack Review',settings:{durationSec:start,aspect:'16:9',width:3840,height:2160,fps:FPS,background:'#e9eeea'},assets:[],scenes};save(path.resolve('projects/Louis - Animation Pack Review.motion'),demo);save(root+'/native/review.motion',demo);
fs.writeFileSync(root+'/clips/library.json',JSON.stringify(clips,null,2));
for(const c of clips)fs.writeFileSync(root+'/clips/'+c.id+'.json',JSON.stringify({format:'louis-cutout-clip-v1',...c,fps:FPS,view:'three-quarter-right',frameCount:Math.ceil(c.duration*FPS),rootMotion:{mode:'in-place',pixelsPerSecond:c.speed||0,stridePixels:c.stride||0},channels:c.group==='Locomotion'?['posture','locomotion','arm-swing']:['posture','upper-body','hands-props','expression-cues'],events:c.events||[],native:'../native/'+c.id+'.motion/project.json',generator:'../rig/runtime.mjs#sample'},null,2));
console.log('Schema validated '+clips.length+' native projects and 4K combination review.');
