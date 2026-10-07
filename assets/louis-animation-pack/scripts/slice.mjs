import fs from 'node:fs';
import path from 'node:path';
import {PNG} from 'pngjs';
const root=path.resolve('assets/louis-animation-pack');
const specs=[['body-grid.png',4,4,['head','torso','pelvis','neck','upper_arm_R','forearm_R','upper_arm_L','forearm_L','thigh_R','shin_R','thigh_L','shin_L','foot_R','foot_L','hand_R_relaxed','hand_L_relaxed']],['face-grid.png',4,5,['eye_R','eye_L','pupil','brow','mouth_sil','mouth_PP','mouth_FF','mouth_TH','mouth_DD','mouth_kk','mouth_CH','mouth_SS','mouth_nn','mouth_RR','mouth_aa','mouth_E','mouth_I','mouth_O','mouth_U','eye_closed']],['hand-prop-grid.png',4,4,['hand_R_relaxed_alt','hand_R_open','hand_R_fist','hand_R_point','hand_R_wave','hand_R_pinch','hand_R_grasp','hand_R_handle','hand_R_support','hand_R_carry','prop_cup','prop_box','prop_laptop','prop_book','prop_phone','prop_fork']]];
specs.push(['surface-grid.png',4,2,['prop_chair','prop_table','prop_stairs','prop_ladder','prop_door','prop_lever','prop_button','prop_pencil']]);
const manifest={};
for(const [file,cols,rows,names] of specs){
 if(!fs.existsSync(`${root}/source/${file}`))continue;
 const im=PNG.sync.read(fs.readFileSync(`${root}/source/${file}`));
 for(let i=0;i<names.length;i++){
  const x0=Math.round((i%cols)*im.width/cols)+5,y0=Math.round(Math.floor(i/cols)*im.height/rows)+5;
  const x1=Math.round((i%cols+1)*im.width/cols)-5,y1=Math.round((Math.floor(i/cols)+1)*im.height/rows)-5;
  let minX=x1,minY=y1,maxX=x0,maxY=y0;
  for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)if(im.data[(y*im.width+x)*4+3]>100){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
  if(maxX<=minX||maxY<=minY)throw new Error(`Empty ${names[i]}`);
  // Slicing only: preserve all source colours/alpha in tight bounds, add 4px transparent joint/export padding.
  const pad=4,w=maxX-minX+1,h=maxY-minY+1,p=new PNG({width:w+pad*2,height:h+pad*2});
  for(let y=0;y<h;y++) im.data.copy(p.data,((y+pad)*p.width+pad)*4,((y+minY)*im.width+minX)*4,((y+minY)*im.width+minX+w)*4);
  fs.writeFileSync(`${root}/parts/${names[i]}.png`,PNG.sync.write(p));
  manifest[names[i]]={file:`parts/${names[i]}.png`,source:file,cell:i,sourceRect:{x:minX,y:minY,width:w,height:h},width:p.width,height:p.height,padding:pad};
 }
}
fs.writeFileSync(`${root}/parts/index.json`,JSON.stringify(manifest,null,2));
console.log(`${Object.keys(manifest).length} sliced alpha parts`);
// Hands are bilaterally symmetric, with no markings/equipment. Mirror ONLY isolated hand drawings
// to create anatomically left variants, never the head/body/facing direction.
for(const pose of ['open','fist','point','wave','pinch','grasp','handle','support','carry']){
 const right='hand_R_'+pose,left='hand_L_'+pose,p=PNG.sync.read(fs.readFileSync(`${root}/parts/${right}.png`));
 const out=new PNG({width:p.width,height:p.height});for(let y=0;y<p.height;y++)for(let x=0;x<p.width;x++)p.data.copy(out.data,(y*p.width+x)*4,(y*p.width+p.width-1-x)*4,(y*p.width+p.width-x)*4);
 fs.writeFileSync(`${root}/parts/${left}.png`,PNG.sync.write(out));manifest[left]={...manifest[right],file:`parts/${left}.png`,derivedFrom:right,operation:'bilaterally symmetric hand reflection'};
}
fs.writeFileSync(`${root}/parts/index.json`,JSON.stringify(manifest,null,2));
const geometry={};
for(const name of ['upper_arm_R','forearm_R','upper_arm_L','forearm_L','thigh_R','shin_R','thigh_L','shin_L']){
 const p=PNG.sync.read(fs.readFileSync(`${root}/parts/${name}.png`));
 const centre=y=>{let min=p.width,max=0;for(let yy=y-2;yy<=y+2;yy++)for(let x=0;x<p.width;x++)if(p.data[(yy*p.width+x)*4+3]>128){min=Math.min(min,x);max=Math.max(max,x)}return (min+max)/2/p.width;};
 geometry[name]={ax:centre(Math.round(p.height*.12)),ay:.12,bx:centre(Math.round(p.height*.9)),by:.9};
}
fs.writeFileSync(`${root}/rig/geometry.mjs`,'export const geometry='+JSON.stringify(geometry)+';\n');
