import fs from 'node:fs';import path from 'node:path';import {chromium} from 'playwright';import {PNG} from 'pngjs';import {clips,FPS} from '../rig/runtime.mjs';
const root=path.resolve('assets/louis-animation-pack'),scale=.5,fw=768,fh=704,pad=3,cols=5,rows=3,pageMax=cols*rows;
const browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(process.env.LOUIS_PACK_VIEWER_URL||'http://127.0.0.1:4173/assets/louis-animation-pack/viewer/');await page.waitForFunction(()=>window.__character);
const selected=process.argv.slice(2);const exportClips=selected.length?clips.filter(c=>selected.includes(c.id)):clips;
for(const c of exportClips){
 fs.mkdirSync(root+'/frames/'+c.id,{recursive:true});fs.mkdirSync(root+'/atlases/'+c.id,{recursive:true});
 const count=Math.ceil(c.duration*FPS);let atlas=null;const meta={format:'louis-fixed-atlas-v1',clip:c.id,duration:c.duration,loop:c.loop,fps:FPS,view:'three-quarter-right',alpha:'straight',filter:'linear',padding:pad,extrusion:2,canvas:{width:fw,height:fh},pivot:{x:384,y:613.5},events:c.events||[],rootMotion:{mode:'in-place',speed:(c.speed||0)*scale},pages:[],frames:[]};
 for(let i=0;i<count;i++){
  const data=await page.evaluate(({id,t,fw,fh})=>{const {sample,draw,images}=window.__character;const pose=sample(id,t);const cv=document.createElement('canvas');cv.width=fw;cv.height=fh;const ctx=cv.getContext('2d');ctx.scale(.5,.5);draw(ctx,pose,images);return{png:cv.toDataURL('image/png').split(',')[1],attachments:pose.attachments,ikError:pose.ikError};},{id:c.id,t:i/FPS,fw,fh});
  const bytes=Buffer.from(data.png,'base64');fs.writeFileSync(root+'/frames/'+c.id+'/'+String(i).padStart(4,'0')+'.png',bytes);const im=PNG.sync.read(bytes);
  const pageIndex=Math.floor(i/pageMax),cell=i%pageMax;if(cell===0){atlas=new PNG({width:cols*(fw+pad*2),height:rows*(fh+pad*2)});meta.pages.push({file:'page-'+String(pageIndex).padStart(2,'0')+'.png',width:atlas.width,height:atlas.height});}
  const x=(cell%cols)*(fw+pad*2)+pad,y=Math.floor(cell/cols)*(fh+pad*2)+pad;
  // Fixed canvases (no per-frame recentring/trim). Extrude canvas edges two pixels into padding.
  for(let yy=-2;yy<fh+2;yy++)for(let xx=-2;xx<fw+2;xx++){const sx=Math.max(0,Math.min(fw-1,xx)),sy=Math.max(0,Math.min(fh-1,yy)),dst=((y+yy)*atlas.width+x+xx)*4,src=(sy*fw+sx)*4;im.data.copy(atlas.data,dst,src,src+4);}
  const attachments=Object.fromEntries(Object.entries(data.attachments).map(([k,v])=>[k,v?{x:v.x*scale,y:v.y*scale}:null]));
  meta.frames.push({name:c.id+'/'+String(i).padStart(4,'0'),page:pageIndex,rect:{x,y,width:fw,height:fh},sourceSize:{width:fw,height:fh},trimOffset:{x:0,y:0},pivot:meta.pivot,durationMs:1000/FPS,time:i/FPS,attachments});
  if(cell===pageMax-1||i===count-1)fs.writeFileSync(root+'/atlases/'+c.id+'/'+meta.pages[pageIndex].file,PNG.sync.write(atlas));
 }
 fs.writeFileSync(root+'/atlases/'+c.id+'/atlas.json',JSON.stringify(meta,null,2));console.log(c.id+': '+count+' alpha frames, '+meta.pages.length+' atlas pages');
}
// Editable layered SVG rest assembly embeds the exact production PNGs, rather than external links.
const pose=await page.evaluate(()=>window.__character.sample('rest',0));const parts=JSON.parse(fs.readFileSync(root+'/parts/index.json'));const groups=pose.parts.map(p=>{const image=fs.readFileSync(root+'/'+parts[p.asset].file).toString('base64');return `<g id="${p.name}" transform="translate(${p.x} ${p.y}) rotate(${p.rotation})"><image x="${-p.width*p.anchor.x}" y="${-p.height*p.anchor.y}" width="${p.width}" height="${p.height}" href="data:image/png;base64,${image}"/></g>`;});fs.writeFileSync(root+'/source/louis-layered.svg',`<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1408" viewBox="0 0 1536 1408"><title>Louis editable named raster cutout layers</title>${groups.join('\n')}</svg>`);
await browser.close();
