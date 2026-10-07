import {geometry} from './geometry.mjs';
// Pure, deterministic cutout rig. Coordinates: pixels, +x right, +y down, degrees clockwise.
export const W=1536,H=1408,FLOOR=1227,FPS=24;
export const visemes=['sil','PP','FF','TH','DD','kk','CH','SS','nn','RR','aa','E','I','O','U'];
export const expressions={
 neutral:[0,0,1,'sil',0],relaxed:[0,0,.9,'sil',0],happy:[-8,8,.92,'E',-2],delighted:[-14,14,1.1,'E',-4],laughing:[-12,12,.35,'aa',-5],amused:[-6,8,.8,'E',2],sad:[-17,17,.85,'PP',5],upset:[-23,23,.65,'PP',8],angry:[23,-23,.68,'SS',-4],frustrated:[17,-17,.65,'CH',3],afraid:[-18,18,1.15,'O',-4],worried:[-14,14,1.05,'RR',3],surprised:[0,0,1.2,'O',-6],shocked:[0,0,1.25,'aa',-8],disgusted:[-12,15,.6,'FF',8],confused:[16,0,.95,'RR',8],curious:[10,-5,1,'sil',-6],sceptical:[14,-6,.7,'PP',4],unimpressed:[0,0,.55,'sil',2],focused:[12,-12,.82,'sil',-3],determined:[17,-17,.78,'PP',-5],tired:[0,0,.5,'sil',8],sleepy:[0,0,.2,'sil',9],bored:[0,0,.6,'sil',5],embarrassed:[12,-12,.8,'PP',9],proud:[-7,7,.95,'E',-7],confident:[-9,4,.9,'E',-5],pained:[-22,22,.3,'CH',7]};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const mix=(a,b,t)=>a+(b-a)*t;
const smooth=x=>{x=clamp(x,0,1);return x*x*(3-2*x)};
const pulse=(p,a=.18,b=.38,c=.7,d=.92)=>smooth((p-a)/(b-a))*(1-smooth((p-c)/(d-c)));
const rad=x=>x*Math.PI/180;
const point=(x,y,angle,dx,dy)=>({x:x+dx*Math.cos(rad(angle))-dy*Math.sin(rad(angle)),y:y+dx*Math.sin(rad(angle))+dy*Math.cos(rad(angle))});
export function ik(a,target,l1,l2,bend=1){
 let dx=target.x-a.x,dy=target.y-a.y,d=Math.hypot(dx,dy),q=clamp(d,Math.abs(l1-l2)+.01,l1+l2-.01);let ux=d?dx/d:0,uy=d?dy/d:1;
 const along=(l1*l1-l2*l2+q*q)/(2*q),perp=Math.sqrt(Math.max(0,l1*l1-along*along));
 const elbow={x:a.x+along*ux-bend*perp*uy,y:a.y+along*uy+bend*perp*ux};
 const end={x:a.x+ux*q,y:a.y+uy*q};
 return {elbow,end,a1:-Math.atan2(elbow.x-a.x,elbow.y-a.y)*180/Math.PI,a2:-Math.atan2(end.x-elbow.x,end.y-elbow.y)*180/Math.PI,error:Math.max(0,d-q)};
}
const C=(id,label,duration,loop=false,group='Body',options={})=>({id,label,duration,loop,group,...options});
export const clips=[
 C('desk_work','Desk · typing',4,true,'Production'),C('desk_stand','Desk · stand up',2,false,'Production'),C('tea_press','Tea · switch kettle on',2,false,'Production'),C('tea_pickup','Tea · pick up mug',2,false,'Production'),C('tea_pour','Tea · pour and settle',4,false,'Production'),C('tea_hold','Tea · hold mug',3,true,'Production'),C('tea_sip','Tea · take a sip',3,false,'Production'),
 C('rest','Rig / reset',1,true),C('idle','Neutral idle',4,true),C('look','Look and weight shift',4,true),
 C('walk','Walk',1,true,'Locomotion',{speed:150,stride:150}),C('run','Run',2/3,true,'Locomotion',{speed:330,stride:220}),
 C('start','Start walking',1.5,false,'Locomotion'),C('stop','Stop and settle',1.5,false,'Locomotion'),C('speed','Walk to run to walk',4,false,'Locomotion'),
 C('backward','Walk backwards',1.25,true,'Locomotion',{speed:-110,stride:137.5}),C('sidestep','Side step / small depth shift',2,false,'Locomotion'),
 C('turn_head','Turn head / limited view',2),C('crouch','Crouch and rise',3),C('crouch_idle','Crouched idle',3,true),C('kneel','Kneel and rise',4),C('jump','Anticipation / jump / land',2),C('sit','Sit / seated / stand',4),C('seated_idle','Seated idle',4,true),
 C('talk','Standing conversation',4,true,'Social'),C('seated_talk','Seated conversation',4,true,'Social'),C('listen','Listening',3,true,'Social'),C('gesture_small','Small conversation gesture',3,false,'Social'),C('gesture_big','Expressive gesture',3,false,'Social'),C('wave_hello','Wave hello',2.5,false,'Social'),C('wave_goodbye','Wave goodbye',3,false,'Social'),C('point_forward','Point forward',2.5,false,'Social'),C('point_up','Point overhead',2.5,false,'Social'),C('point_down','Point below',2.5,false,'Social'),C('nod','Nod',2,false,'Social'),C('shake','Shake head / stylised tilt',2,false,'Social'),C('shrug','Shrug',2.5,false,'Social'),C('think','Think',3,false,'Social'),C('surprise','Surprise reaction',2,false,'Social'),C('celebrate','Celebrate',3,false,'Social'),C('laugh','Laugh',3,false,'Social'),C('disappointment','Disappointment',3,false,'Social'),
 ...['low','waist','shoulder'].map(h=>C('reach_'+h,'Reach at '+h,2.5,false,'Interaction')),
 C('pickup','Pick up / hold / inspect / place',6,false,'Interaction',{events:[{time:1.3,type:'attach',prop:'cup',hand:'R'},{time:4.8,type:'release',prop:'cup'}]}),
 C('hold_one','One-handed hold',3,true,'Interaction'),C('hold_two','Two-handed carry',3,true,'Interaction'),C('carry_walk','Walk carrying cup',1,true,'Interaction',{speed:150,stride:150}),C('carry_run','Run carrying box',2/3,true,'Interaction',{speed:330,stride:220}),
 C('lift_light','Lift and lower / light',3,false,'Interaction'),C('lift_heavy','Lift and lower / heavy',5,false,'Interaction'),C('inspect','Inspect object',3,false,'Interaction'),C('pass','Pass object',3,false,'Interaction',{events:[{time:2.05,type:'release',prop:'cup'}]}),C('place','Place object',3,false,'Interaction',{events:[{time:1.8,type:'release',prop:'cup'}]}),C('drop','Release / drop',2,false,'Interaction',{events:[{time:.75,type:'release',prop:'cup'}]}),
 C('push','Push',3,false,'Interaction'),C('pull','Pull',3,false,'Interaction'),C('button','Button press / study',2,false,'Interaction'),C('lever','Lever pull / study',2.5,false,'Interaction'),C('door','Door handle pull / study',3,false,'Interaction'),C('drink','Drink from cup',4,false,'Interaction'),C('eat','Eat forkful',4,false,'Interaction'),C('read','Read book',4,true,'Interaction'),C('phone','Use phone',4,true,'Interaction'),C('type','Type on laptop',4,true,'Interaction'),C('write','Writing gesture / tool unsupplied',4,true,'Interaction'),
 C('stairs','Climb a stair / contact study',2,false,'Extended'),C('ladder','Ladder step / contact study',3,false,'Extended'),C('crawl','Crawl cycle',2,true,'Extended'),C('lean','Lean against surface',3,false,'Extended'),C('bend','Bend / reach',3,false,'Extended'),C('overhead','Reach overhead',3,false,'Extended'),C('floor_sit','Sit on floor / rise',4,false,'Extended'),C('lie','Lie down / rise',5,false,'Extended'),C('sleep','Sleeping breath',4,true,'Extended'),C('wake','Wake / rise',4,false,'Extended'),C('stretch','Stretch',3,false,'Extended'),C('yawn','Yawn',3,false,'Extended'),C('stumble','Stumble and recover',3,false,'Extended'),C('fall','Fall / recover study',4,false,'Extended'),C('dance','Playful dance',3,true,'Extended'),C('awkward','Awkward heavy carry',4,true,'Extended'),
 C('combo_walk_talk','1 · Walk / talk / blink',4,true,'Combinations',{speed:150,stride:150}),C('combo_walk_cup','2 · Walk / carry cup',2,true,'Combinations',{speed:150,stride:150}),C('combo_run_box','3 · Run / two-hand box',2,true,'Combinations',{speed:330,stride:220}),C('combo_sit_talk','4 · Seated / speech / gesture',4,true,'Combinations'),C('combo_pickup','5 · Pick / inspect / place',6,false,'Combinations',{events:[{time:1.3,type:'attach',prop:'cup',hand:'R'},{time:4.8,type:'release',prop:'cup'}]}),C('combo_expression','6 · Expression during speech',6,true,'Combinations'),C('viseme_demo','Timed viseme demo / no audio',6.4,true,'Face')
];
export function sample(clipId,t,controls={}){
 const clip=clips.find(c=>c.id===clipId)||clips[0];t=clamp(t,0,clip.duration);const p=t/clip.duration,a=pulse(p),tau=Math.PI*2;
 let x=384,y=665,lean=0,headAngle=0,lf={x:438,y:1038},rf={x:332,y:1038},L={x:470,y:645},R={x:287,y:645},handL='relaxed',handR='relaxed',prop=controls.prop||'none',expression=controls.expression||'neutral',speech=!!controls.speech,walk=false,run=false,contact={L:true,R:true},propState='held',propAt=null,bodyAngle=0;
 const id=clipId;
 walk=['walk','carry_walk','combo_walk_talk','combo_walk_cup','backward','start','stop','speed'].includes(id);run=['run','carry_run','combo_run_box'].includes(id);
 let locomotionGain=1,period=run?2/3:id==='backward'?1.25:1;
 if(id==='start')locomotionGain=smooth(t/.6);if(id==='stop')locomotionGain=1-smooth(t/.7);if(id==='speed'){const g=pulse(p,.15,.4,.6,.9);period=1-g/3;}
 if(walk||run){const phase=t/period;const stride=id==='backward'?-137.5:run?220:150;const cycle=(shift,base)=>{const q=(phase+shift)%1; if(q<.5)return {x:base+stride*(.25-q)*locomotionGain,y:1038};const s=(q-.5)*2;return {x:base+mix(-stride*.25,stride*.25,s)*locomotionGain,y:1038-Math.sin(Math.PI*s)*(run?115:50)*locomotionGain};};rf=cycle(0,332);lf=cycle(.5,438);contact.R=phase%1<.5;contact.L=(phase+.5)%1<.5;y-=Math.abs(Math.sin(phase*tau))*(run?22:8)*locomotionGain;lean=run?8:2;if(run)R.x+=20;R.x+=Math.sin(phase*tau)*(run?32:45)*locomotionGain;L.x-=Math.sin(phase*tau)*(run?70:45)*locomotionGain;}
 if(id!=='rest'&&!walk&&!run){const breathPeriod=clip.loop?clip.duration:4;y+=Math.sin(t*tau/breathPeriod)*2;headAngle+=Math.sin(t*tau/breathPeriod)*.6;}
 if(id==='look'){x+=Math.sin(t*tau/4)*12;headAngle=Math.sin(t*tau/4)*7;}
 if(id==='sidestep'){x+=Math.sin(p*Math.PI)*65;rf.x+=Math.sin(p*Math.PI)*65;lf.x+=Math.sin(p*Math.PI)*90;}
 if(['crouch','crouch_idle','kneel','jump','bend','pickup','combo_pickup'].includes(id)){let depth=id==='crouch_idle'?130:id==='kneel'?200:130*a;if(id==='jump'){depth=t<.45?55*Math.sin(t/.45*Math.PI):t<1.15?-160*Math.sin((t-.45)/.7*Math.PI):40*Math.sin((t-1.15)/.5*Math.PI);depth=t>1.65?0:depth;rf.y+=Math.min(0,depth);lf.y+=Math.min(0,depth);contact.L=contact.R=depth>=0;}if(id==='kneel'){depth*=a;lf.y=mix(1038,950,a);lf.x=mix(438,510,a);}if(['pickup','combo_pickup'].includes(id)){depth=230*(pulse(p,.03,.17,.24,.32)+pulse(p,.69,.78,.84,.95));}y+=depth;lean-=a*(id==='bend'?22:8);}
 let seated=['seated_idle','seated_talk','combo_sit_talk'].includes(id)?1:id==='sit'?a:id==='floor_sit'?a:0;
 if(seated){y+=seated*(id==='floor_sit'?310:200);lf={x:520,y:1038};rf={x:415,y:1038};lean=-3*seated;}
 if(['lie','sleep','wake','fall'].includes(id)){let q=id==='sleep'?1:id==='wake'?1-smooth(p):a;bodyAngle=-78*q;y+=350*q;x-=70*q;lf={x:560,y:1038-100*q};rf={x:495,y:1038-85*q};expression=id==='sleep'?'sleepy':expression;}
 if(id==='crawl'){y=1015;lean=65;rf.y=1020;lf.y=1000;R={x:615+Math.sin(p*tau)*25,y:1035};L={x:695-Math.sin(p*tau)*25,y:1035};handR=handL='open';}
 if(id==='stairs'){rf.y-=100*a;rf.x+=100*a;const follow=pulse(p,.35,.55,.75,.95);lf.y-=100*follow;lf.x+=100*follow;y-=70*Math.min(a,follow);x+=100*Math.min(a,follow);contact.R=a===0;}
 if(id==='ladder'){rf.y-=150*a;lf.y-=40*a;y-=70*a;L={x:470,y:295+Math.sin(p*tau)*30};R={x:355,y:245-Math.sin(p*tau)*30};handR=handL='grasp';}
 if(id==='lean'){lean=-12*a;x+=25*a;R={x:260,y:460};handR='support';}
 if(id==='stumble'){lean=-18*Math.sin(p*tau)*a;y+=25*a;rf.x+=60*a;}
 if(id==='dance'){x+=Math.sin(p*tau)*18;y-=Math.abs(Math.sin(p*tau*2))*18;R={x:265,y:460+Math.sin(p*tau)*60};L={x:500,y:460-Math.sin(p*tau)*60};headAngle=Math.sin(p*tau)*8;handR=handL='open';}
 if(id==='turn_head')headAngle+=12*Math.sin(p*tau);
 if(['talk','seated_talk','combo_sit_talk','combo_walk_talk','combo_expression','viseme_demo'].includes(id))speech=true;
 if(['talk','seated_talk','gesture_small','combo_sit_talk'].includes(id)){R={x:285+Math.sin(p*tau)*20,y:470+Math.sin(p*tau*2)*15};handR='open';}
 if(['gesture_big','shrug'].includes(id)){R={x:mix(287,250,a),y:mix(645,425,a)};L={x:mix(470,530,a),y:mix(645,420,a)};handR=handL=a>.15?'support':'relaxed';y-=a*8;}
 if(['wave_hello','wave_goodbye'].includes(id)){R={x:mix(287,240+Math.sin(t*12)*22,a),y:mix(645,310,a)};handR=a>.15?'wave':'relaxed';}
 if(id.startsWith('point_')){R={x:mix(287,id==='point_up'?300:id==='point_down'?445:530,a),y:mix(645,id==='point_up'?200:id==='point_down'?600:440,a)};handR=a>.2?'point':'relaxed';}
 if(id==='nod'||id==='listen')headAngle+=Math.sin(p*tau*2)*(id==='nod'?8:3)*a;
 if(id==='shake')headAngle+=Math.sin(p*tau*3)*8*a;
 if(id==='think'){R={x:mix(287,400,a),y:mix(645,327,a)};handR='pinch';expression='curious';}
 if(id==='surprise'){R={x:mix(287,245,a),y:mix(645,405,a)};L={x:mix(470,525,a),y:mix(645,405,a)};handR=handL='open';expression='shocked';}
 if(['celebrate','overhead','stretch'].includes(id)){R={x:mix(287,280,a),y:mix(645,220,a)};L={x:mix(470,480,a),y:mix(645,220,a)};handR=handL='fist';if(id==='celebrate')expression='delighted';}
 if(id==='laugh'){expression='laughing';y+=Math.sin(t*18)*4*a;headAngle-=8*a;}if(id==='disappointment'){expression='sad';headAngle+=12*a;}if(id==='yawn'){expression='sleepy';R={x:mix(287,420,a),y:mix(645,315,a)};handR='open';}
 if(id==='reach_waist')lean=10*a;
 if(id==='reach_low'){y+=190*a;lean=20*a;L.y+=190*a;}
 if(id==='place'){y+=115*a;lean=20*a;L.y+=115*a;}
 if(id.startsWith('reach_')){R={x:mix(287,id==='reach_low'?485:510,a),y:mix(645,id==='reach_low'?820:id==='reach_shoulder'?370:570,a)};handR=a>.2?'grasp':'relaxed';}
 if(['hold_one','carry_walk','combo_walk_cup','drink','inspect','pass','place','drop','pickup','combo_pickup'].includes(id)){prop='cup';handR='handle';R={x:350,y:515};}
 if(['hold_two','carry_run','combo_run_box','lift_light','lift_heavy','awkward'].includes(id)){prop='box';handR=handL='carry';R={x:345,y:535};L={x:485,y:535};if(id.startsWith('lift_')){const heavy=id==='lift_heavy';R.y=L.y=650-(heavy?110:150)*a;y+=(heavy?65:15)*(1-a)*pulse(p,.01,.12,.8,.98);lean-=heavy?8*a:3*a;}if(id==='awkward'){y+=15;lean=-10;R.y=L.y=565;}}
 if(['pickup','combo_pickup'].includes(id)){const reach=pulse(p,.01,.18,.22,.36),place=pulse(p,.65,.79,.85,.96);R={x:mix(350,485,Math.max(reach,place)),y:mix(515,815,Math.max(reach,place))};if(t<1.3){propState='ground';propAt={x:530,y:780};handR='grasp';}else if(t>=4.8){propState='ground';propAt={x:485,y:815};handR='relaxed';}else if(t>2.5&&t<3.8){R={x:390,y:440};headAngle=5;}}
 if(id==='inspect'){R={x:mix(350,405,a),y:mix(515,430,a)};headAngle=6*a;}
 if(id==='pass'){R={x:mix(350,530,a),y:mix(515,470,a)};if(t>=2.05){propState='released';propAt={x:575+(t-2.05)*90,y:435};}}
 if(id==='place'){R={x:mix(350,505,a),y:mix(515,710,a)};if(t>=1.8){propState='ground';propAt={x:550,y:675};handR='relaxed';}}
 if(id==='drop'&&t>=.75){propState='released';propAt={x:395,y:Math.min(1063,480+550*(t-.75)**2)};handR='open';}
 if(['push','pull','button','lever','door'].includes(id)){R={x:mix(287,id==='pull'?520-70*a:530,a),y:mix(645,id==='lever'?410+80*a:450,a)};handR=id==='button'?'point':id==='push'?'open':'grasp';if(id==='push'||id==='pull'){L={x:mix(470,R.x+15,a),y:mix(645,R.y+30,a)};handL=handR;lean=(id==='push'?10:-10)*a;}}
 if(id==='drink'){R={x:mix(350,420,a),y:mix(515,335,a)};headAngle=-8*a;}
 if(id==='eat'){prop='fork';handR='pinch';R={x:mix(350,420,a),y:mix(515,330,a)};}
 if(id==='read'){prop='book';handR=handL='carry';R={x:350,y:505};L={x:480,y:505};headAngle=6;}
 if(id==='phone'){prop='phone';handR='grasp';R={x:390,y:480};L={x:425+Math.sin(t*6)*3,y:470};handL='point';headAngle=6;}
 if(id==='type'){prop='laptop';handL='support';handR='point';L={x:480,y:560};R={x:400+Math.sin(t*10)*3,y:580+Math.sin(t*8)*4};headAngle=5;}
 if(id==='write'){prop='pencil';R={x:440+Math.sin(t*8)*5,y:565};handR='pinch';}
 if(id==='combo_expression')expression=['neutral','happy','worried','angry','surprised','relaxed'][Math.min(5,Math.floor(t))];
 if(controls.action){const upper=sample(controls.action,t%((clips.find(c=>c.id===controls.action)||clip).duration),{expression,prop});return mergeAction(sample(id,t,{...controls,action:undefined}),upper,controls.action);}
 if(controls.prop&&controls.prop!=='none')prop=controls.prop;
 if(controls.hand&&controls.hand!=='auto')handR=handL=controls.hand;
 if(['lie','wake','fall'].includes(id))y+=8*Math.sin(p*Math.PI);
 if(['lie','sleep','wake','fall','stumble'].includes(id)){R=point(x,y,bodyAngle+lean,-95,-20);L=point(x,y,bodyAngle+lean,90,-20);}
 const world=controls.rootMotion?(clip.speed||0)*t:0;x+=world;rf.x+=world;lf.x+=world;R.x+=world;L.x+=world;
 // Whole torso follows pelvis; arm targets follow root/pelvis breathing and lean locally.
 if(['pickup','combo_pickup'].includes(id))lean=10*(pulse(p,.03,.17,.24,.32)+pulse(p,.69,.78,.84,.95));
 // Production desk/tea actions use reachable targets and a planted floor.
 if(id==='desk_work'){
   y=865+Math.sin(t*tau/4)*1.3;lean=-3;headAngle=4;rf={x:415,y:1038};lf={x:520,y:1038};
   R={x:388+Math.sin(t*15)*2,y:625+Math.sin(t*19)*2};L={x:436+Math.sin(t*13)*2,y:625+Math.sin(t*17)*2};handR=handL=controls.rigVersion===2?'typing':'point';
 }
 if(id==='desk_stand'){
   const q=smooth(p);y=865-200*q;lean=-3+8*Math.sin(p*Math.PI);headAngle=4*(1-q);
   rf={x:mix(415,332,q),y:1038};lf={x:mix(520,438,q),y:1038};
   R={x:mix(388,287,q),y:mix(625,645,q)};L={x:mix(436,470,q),y:mix(625,645,q)};handR=handL=q<.18?(controls.rigVersion===2?'typing':'point'):'relaxed';
 }
 if(id==='tea_press'){
   const q=pulse(p,.05,.4,.55,.95);R={x:mix(287,490,q),y:mix(645,510,q)};handR=q>.18?'point':'relaxed';headAngle=4*q;
 }
 if(['tea_pour','tea_hold','tea_sip'].includes(id)){
   prop='cup';handR='handle';R={x:430,y:550};L={x:470,y:645};
   if(id==='tea_pour'){const q=pulse(p,.06,.3,.62,.93);L={x:mix(470,650,q),y:mix(645,447,q)};handL=q>.12?'kettle':'relaxed';headAngle=4*q;}
   if(id==='tea_sip'){const q=pulse(p,.04,.3,.58,.94);R={x:mix(430,420,q),y:mix(550,335,q)};headAngle=-7*q;}
 }
 if(id==='tea_pickup'){
   prop='cup';const reach=smooth(t/.8),settle=smooth((t-.8)/1.1);
   R={x:t<.8?mix(287,457,reach):mix(457,430,settle),y:mix(645,550,reach)};
   if(t<.8){propAt={x:502,y:515};propState='ground';handR=reach>.3?'grasp':'relaxed';}else handR='handle';headAngle=4*(1-settle);
 }
 // Authored controls and contact targets are solved before creating any drawings.
 if(controls.pose){const q=controls.pose;x=q.pelvisX-384;y=q.pelvisY-128;bodyAngle=0;lean=q.bodyLean;headAngle=0;
   R={x:q.handRX-384,y:q.handRY-128};L={x:q.handLX-384,y:q.handLY-128};
   rf={x:q.footRX-384,y:q.footRY-128};lf={x:q.footLX-384,y:q.footLY-128};
   handR=controls.rightHand||'relaxed';handL=controls.leftHand||'relaxed';prop=controls.prop||'none';propAt=null;
 }
 for(const [name,q]of Object.entries(controls.targets||{})){
   const value={x:q.x-384,y:q.y-128};
   if(name==='hand_R')R=value;if(name==='hand_L')L=value;if(name==='foot_R')rf=value;if(name==='foot_L')lf=value;
 }
 headAngle+=controls.headOffset||0;
 const chest=point(x,y,bodyAngle+lean,0,-265);const neck=point(chest.x,chest.y,bodyAngle+lean,16,-43);
 const shoulderR=point(chest.x,chest.y,bodyAngle+lean,-86,4),shoulderL=point(chest.x,chest.y,bodyAngle+lean,77,9);
 if(!controls.pose&&!controls.targets?.hand_R&&!controls.targets?.hand_L&&['rest','idle','look','walk','run','backward','start','stop','speed','crouch','crouch_idle','kneel','jump','sit','seated_idle','seated_talk','combo_sit_talk','floor_sit','stumble','stairs'].includes(id)){R.y+=y-665;L.y+=y-665;}
 if(!controls.pose&&(controls.targets?.hand_R||controls.targets?.hand_L)&&['rest','idle','walk','start','stop','seated_idle'].includes(id)){if(!controls.targets.hand_R)R.y+=y-665;if(!controls.targets.hand_L)L.y+=y-665;}
 if(['pickup','combo_pickup'].includes(id))L.y+=y-665;
 const hipR=point(x,y,bodyAngle,-48,0),hipL=point(x,y,bodyAngle,47,0);
 const productionLegs=controls.rigVersion===2&&(id.startsWith('desk_')||id.startsWith('tea_')||id==='idle'); const thighLength=controls.pose?.thighLength||controls.dimensions?.thighLength||(productionLegs?188:200),shinLength=controls.pose?.shinLength||controls.dimensions?.shinLength||(productionLegs?188:202),upperArmLength=controls.pose?.upperArmLength||controls.dimensions?.upperArmLength||135,forearmLength=controls.pose?.forearmLength||controls.dimensions?.forearmLength||125;
 const legs={R:ik(hipR,rf,thighLength,shinLength,Math.sign(controls.pose?.rightLegBend||-1)),L:ik(hipL,lf,thighLength,shinLength,Math.sign(controls.pose?.leftLegBend||-1))};
 const arms={R:ik(shoulderR,R,upperArmLength,forearmLength,Math.sign(controls.pose?.rightArmBend||1)),L:ik(shoulderL,L,upperArmLength,forearmLength,Math.sign(controls.pose?.leftArmBend||-1))};
 const parts=[];const add=(asset,name,pos,w,h,angle=0,ax=.5,ay=.08,extra={})=>parts.push({asset,name,x:pos.x,y:pos.y,width:w,height:h,rotation:angle,anchor:{x:ax,y:ay},...extra});
 const limb=(asset,name,start,end,w,len,angle)=>{const g=controls.rigVersion===2?{ax:.5,ay:.1,bx:.5,by:.9}:geometry[asset],dx=(g.bx-g.ax)*w,h=Math.sqrt(Math.max(1,len*len-dx*dx))/(g.by-g.ay);add(asset,name,start,w,h,angle+Math.atan2(dx,(g.by-g.ay)*h)*180/Math.PI,g.ax,g.ay);};
 // Back limbs, legs, pelvis, body, head, then front arm: explicit ordering.
 limb('upper_arm_L','upper_arm_L',shoulderL,arms.L.elbow,68,upperArmLength,arms.L.a1);limb('forearm_L','forearm_L',arms.L.elbow,arms.L.end,48,forearmLength,arms.L.a2);
 add('pelvis','pelvis',{x,y:y-25},184,95,bodyAngle,.5,.18);
 for(const side of ['L','R']){const hip=side==='R'?hipR:hipL,q=legs[side];limb('shin_'+side,'shin_'+side,q.elbow,q.end,67,shinLength,q.a2);limb('thigh_'+side,'thigh_'+side,hip,q.elbow,91,thighLength,q.a1);add('foot_'+side,'foot_'+side,{x:q.end.x+24,y:q.end.y+4},116,67,0,.5,.15);}
 
 add('neck','neck',neck,66,74,bodyAngle+lean,.5,.18);
 add('torso','torso',chest,244,290,bodyAngle+lean,.5,.1);
 const targetEx=expressions[expression]||expressions.neutral;const emotionWeight=['think','surprise','celebrate','laugh','disappointment','yawn'].includes(id)?a:1;let ex=targetEx.map((v,i)=>i===3?(emotionWeight>.18?v:'sil'):mix(expressions.neutral[i],v,emotionWeight));if(id==='combo_expression'){const seq=['neutral','happy','worried','angry','surprised','relaxed'];const step=Math.min(5,Math.floor(t)),f=smooth((t%1)/.2),prev=expressions[seq[Math.max(0,step-1)]];ex=ex.map((v,i)=>i===3?v:mix(prev[i],v,f));if(t>5.65){const q=smooth((t-5.65)/.35);ex=ex.map((v,i)=>i===3?v:mix(v,expressions.neutral[i],q));}};const headRotation=bodyAngle+lean+headAngle+ex[4];
 add('head','head',neck,238,302,headRotation,.5,.94);
 const hp=(dx,dy)=>point(neck.x,neck.y,headRotation,dx,dy);
 const blink=id==='sleep'||controls.blink==='closed'||(controls.blink!=='open'&&((t+1.4)%3.7<.115));const wink=controls.blink||'auto';
 const gazeX=clamp(controls.gazeX||0,-1,1),gazeY=clamp(controls.gazeY||0,-1,1);
 for(const [side,dx,dy,size] of [['R',25,-150,60],['L',88,-157,49]]){
  const shut=blink||wink==='wink_'+side,eyeScale=clamp(ex[2],.2,1.22);add(shut?'eye_closed':'eye_'+side,'eye_'+side,hp(dx,dy),size,shut?10:size*eyeScale,headRotation,.5,.5);
  if(!shut){const px=clamp(gazeX*size*.18+8,-size/2+7,size/2-7),ry=Math.max(1,size*eyeScale/2-6),py=clamp(gazeY*size*.15,-ry,ry)*Math.sqrt(Math.max(0,1-(px/(size/2-5))**2));add('pupil','pupil_'+side,hp(dx+px,dy+py),10,Math.min(10,size*eyeScale*.65),headRotation,.5,.5);}
  add('brow','brow_'+side,hp(dx,dy-45-(ex[2]-1)*20),side==='R'?53:44,14,headRotation+(side==='R'?ex[0]:ex[1]),.5,.5);
 }
 let mouth=controls.mouth||'auto';if(mouth==='auto')mouth=speech?visemes[Math.floor(t/.4)%visemes.length]:id==='yawn'&&a>.3?'aa':ex[3];
 // Demonstration has a sil closure between utterances; no supplied audio / no claimed lip sync.
 if(speech&&((id!=='viseme_demo'&&t%2.4>1.95)||t>clip.duration-.25))mouth='sil';
 const mouthWidth=mouth==='O'||mouth==='U'?35:62;const mouthHeight=['sil','PP','SS','CH'].includes(mouth)?12:['aa','O'].includes(mouth)?34:23;
 add('mouth_'+mouth,'mouth',hp(67,-76),mouthWidth,mouthHeight,headRotation,.5,.5);
 limb('upper_arm_R','upper_arm_R',shoulderR,arms.R.elbow,76,upperArmLength,arms.R.a1);limb('forearm_R','forearm_R',arms.R.elbow,arms.R.end,54,forearmLength,arms.R.a2);
 const hands={R:arms.R.end,L:arms.L.end};let propDraw=null;
 if(prop!=='none'){
  let pos=propAt||{x:hands.R.x+(prop==='cup'?45:35),y:hands.R.y-(prop==='cup'?35:20)};let w=prop==='box'?168:prop==='book'?156:prop==='laptop'?208:prop==='phone'?45:prop==='fork'?90:prop==='pencil'?65:66,h=prop==='box'?135:prop==='book'?115:prop==='laptop'?142:prop==='phone'?85:prop==='fork'?100:prop==='pencil'?65:72;
  if(['box','book'].includes(prop)&&!propAt)pos={x:(hands.R.x+hands.L.x)/2,y:(hands.R.y+hands.L.y)/2-45};if(prop==='laptop')pos={x:hands.L.x-70,y:hands.L.y-64};if(prop==='fork'){w=64;h=75;pos={x:hands.R.x+15,y:hands.R.y-12};}if(prop==='pencil')pos={x:hands.R.x+28,y:hands.R.y+10};
  add('prop_'+prop,'prop',pos,w,h,controls.pose?controls.pose.propAngle:id==='drink'||id==='tea_sip'?-18*a:0,.5,.5);propDraw=parts.at(-1);
 }
 for(const side of ['L','R']){let h=side==='R'?handR:handL;let asset=h==='relaxed'?'hand_'+side+'_relaxed':'hand_'+side+'_'+h;
  // Right/left alternatives are separate files; no runtime reflection of character or hands.
  const handOffset=controls.pose?(side==='R'?controls.pose.rightHandAngle:controls.pose.leftHandAngle):0;
  if(h==='typing'){add(asset,'hand_'+side,hands[side],38,32,handOffset,.5,.1);continue;}
  if(h==='kettle'){add(asset,'hand_'+side,hands[side],38,58,handOffset,.5,.9);continue;}
  let angle=arms[side].a2+(h==='relaxed'?0:180);if(h==='support'||h==='carry'||h==='handle'||(h==='grasp'&&prop==='phone'))angle=0;
  add(asset,'hand_'+side,hands[side],h==='carry'||h==='support'?73:51,h==='carry'||h==='support'?48:76,angle+handOffset,h==='carry'||h==='support'?(side==='R'?.12:.88):h==='handle'&&prop==='cup'?.3:.5,h==='relaxed'?.08:h==='carry'||h==='support'?.65:.9);
 }
 const surface=(asset,name,x,y,width,height,ax=.5,ay=.5)=>parts.unshift({asset,name,x,y,width,height,rotation:0,anchor:{x:ax,y:ay}});
 if(['sit','seated_idle','seated_talk','combo_sit_talk'].includes(id))surface('prop_chair','environment_chair',400,895,248,378,.55,.46);
 if(['pickup','combo_pickup'].includes(id))surface('prop_table','environment_table',530,816,380,301,.5,.06);
 if(id==='place')surface('prop_table','environment_table',550,711,410,413,.5,.06);
 if(id==='write')surface('prop_table','environment_table',485,602,440,529,.5,.06);
 if(id==='button')surface('prop_button','environment_button',540,450,90,85,.5,.28);
 if(id==='lever')surface('prop_lever','environment_lever',535,460,100,220,.5,.15);
 if(id==='door')surface('prop_door','environment_door',530,490,315,880,.23,.51);
 if(id==='stairs')surface('prop_stairs','environment_stairs',570,1000,285,200,.5,.5);
 if(id==='ladder')surface('prop_ladder','environment_ladder',470,600,260,990,.5,.5);
 for(const part of parts){part.x+=384;part.y+=128;}
 const result={clip:clip.id,time:t,parts,attachments:{world:{x:384+world,y:FLOOR-128},pelvis:{x,y},head:neck,hand_R:hands.R,hand_L:hands.L,foot_R:legs.R.end,foot_L:legs.L.end,seat:{x,y:y+30},prop:propDraw?{x:propDraw.x,y:propDraw.y}:null},contacts:contact,expression,mouth,prop,propState,ikError:{arm_R:arms.R.error,arm_L:arms.L.error,leg_R:legs.R.error,leg_L:legs.L.error}};
 for(const p of Object.values(result.attachments))if(p){p.x+=384;p.y+=128;}return result;
}
function mergeAction(base,upper,action){
 const owned=['upper_arm_','forearm_','hand_','prop'];const root=base.attachments.pelvis,origin=upper.attachments.pelvis;
 const theta=base.parts.find(p=>p.name==='torso').rotation-upper.parts.find(p=>p.name==='torso').rotation;
 const transform=p=>point(root.x,root.y,theta,p.x-origin.x,p.y-origin.y);
 base.parts=base.parts.filter(p=>!owned.some(n=>p.name.startsWith(n)));
 for(const p of upper.parts.filter(p=>owned.some(n=>p.name.startsWith(n))))base.parts.push({...p,...transform(p),rotation:p.rotation+theta});
 for(const name of ['hand_R','hand_L','prop'])base.attachments[name]=upper.attachments[name]?transform(upper.attachments[name]):null;
 base.prop=upper.prop;base.propState=upper.propState;
 const order=['upper_arm_L','forearm_L','pelvis','shin_L','thigh_L','foot_L','shin_R','thigh_R','foot_R','neck','torso','head','eye_R','pupil_R','brow_R','eye_L','pupil_L','brow_L','mouth','upper_arm_R','forearm_R','prop','hand_L','hand_R'];
 base.parts.sort((a,b)=>order.indexOf(a.name)-order.indexOf(b.name));return base;
}
export async function loadImages(base='../'){
 const manifest=await (await fetch(base+'parts/index.json')).json();const images={};await Promise.all(Object.entries(manifest).map(async([id,p])=>{const im=new Image();im.src=base+p.file;await im.decode();images[id]=im;}));return images;
}
export function draw(ctx,pose,images,{overlays=false,floor=false}={}){
 for(const p of pose.parts){const im=images[p.asset];if(!im)throw new Error('Missing artwork '+p.asset);ctx.save();ctx.translate(p.x,p.y);ctx.rotate(rad(p.rotation));ctx.drawImage(im,-p.width*p.anchor.x,-p.height*p.anchor.y,p.width,p.height);ctx.restore();}
 if(floor){ctx.strokeStyle='#72808b';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,FLOOR);ctx.lineTo(W,FLOOR);ctx.stroke();}
 if(overlays){ctx.font='14px monospace';for(const [name,p]of Object.entries(pose.attachments)){if(!p)continue;ctx.fillStyle=name.includes('foot')?'#28d8a1':'#ff5279';ctx.beginPath();ctx.arc(p.x,p.y,4,0,Math.PI*2);ctx.fill();ctx.fillText(name,p.x+7,p.y);}}
}
