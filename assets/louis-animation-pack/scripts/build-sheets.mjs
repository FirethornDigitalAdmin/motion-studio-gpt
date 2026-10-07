import fs from 'node:fs';import{chromium}from'playwright';import{expressions,visemes,clips}from'../rig/runtime.mjs';
const root='assets/louis-animation-pack',browser=await chromium.launch({headless:true}),page=await browser.newPage();await page.goto(process.env.LOUIS_PACK_VIEWER_URL||'http://127.0.0.1:4173/assets/louis-animation-pack/viewer/');await page.waitForFunction(()=>window.__character);
async function make(file,kind,items,cols,tw,th){const data=await page.evaluate(({kind,items,cols,tw,th})=>{
 const {sample,draw,images}=window.__character,cv=document.createElement('canvas');cv.width=cols*tw;cv.height=Math.ceil(items.length/cols)*th;const ctx=cv.getContext('2d');ctx.fillStyle='#f2f3ec';ctx.fillRect(0,0,cv.width,cv.height);
 items.forEach((item,i)=>{const x=(i%cols)*tw,y=Math.floor(i/cols)*th;ctx.save();ctx.translate(x,y);ctx.strokeStyle='#d6ddd6';ctx.strokeRect(0,0,tw,th);ctx.fillStyle='#26383b';ctx.font='14px system-ui';ctx.fillText(item.label,12,24);
  if(kind==='face'){const scene=document.createElement('canvas');scene.width=1536;scene.height=1408;draw(scene.getContext('2d'),sample('rest',0,{expression:item.id,blink:'open'}),images);ctx.drawImage(scene,620,163,365,390,8,36,tw-16,th-44);}
  else if(kind==='part'){const im=images[item.id],maxW=tw-35,maxH=th-52,scale=Math.min(maxW/im.width,maxH/im.height);ctx.drawImage(im,(tw-im.width*scale)/2,42+(maxH-im.height*scale)/2,im.width*scale,im.height*scale);}
  else{ctx.translate(0,34);ctx.scale(tw/1536,(th-38)/1408);draw(ctx,sample(item.id,item.time??.5),images,{floor:true});}
  ctx.restore();});return cv.toDataURL('image/png').split(',')[1];},{kind,items,cols,tw,th});fs.writeFileSync(root+'/sheets/'+file,Buffer.from(data,'base64'));}
await make('expressions.png','face',Object.keys(expressions).map(id=>({id,label:id})),7,240,300);
await make('visemes.png','part',visemes.map(id=>({id:'mouth_'+id,label:id})),5,210,150);
await make('hands.png','part',['R','L'].flatMap(side=>['relaxed','open','fist','point','wave','pinch','grasp','handle','support','carry'].map(p=>({id:'hand_'+side+'_'+p,label:side+' · '+p}))),5,210,230);
await make('combinations.png','clip',clips.filter(c=>c.group==='Combinations').map(c=>({id:c.id,label:c.label,time:c.id==='combo_pickup'?3:c.id==='combo_sit_talk'?1.5:.5})),3,512,430);
await make('core-key-poses.png','clip',['rest','walk','run','crouch','kneel','jump','sit','wave_hello','point_forward','reach_low','pickup','drink'].map(id=>({id,label:id,time:['crouch','kneel','sit'].includes(id)?1.5:id==='pickup'?1.3:id==='jump'?.8:1})),4,384,330);
console.log('Five reference sheets assembled from production assets.');await browser.close();
