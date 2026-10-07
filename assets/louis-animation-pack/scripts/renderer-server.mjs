import http from'node:http';import fs from'node:fs';import path from'node:path';
const workspace=path.resolve('.'),dist=workspace+'/dist';
http.createServer((req,res)=>{const url=new URL(req.url,'http://127.0.0.1');let file;
 if(url.pathname==='/api/asset'){const folder=url.searchParams.get('folder'),asset=url.searchParams.get('path');if(folder!=='Louis - Animation Pack Review.motion'||!/^assets\/[a-f0-9]{64}\.png$/.test(asset||'')){res.writeHead(403).end();return}file=path.join(workspace,'projects',folder,asset);}
 else{file=url.pathname==='/render'?dist+'/index.html':path.resolve(dist,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(dist+'/')){res.writeHead(403).end();return}}
 try{const ext=path.extname(file);res.setHeader('Content-Type',ext==='.html'?'text/html':ext==='.js'?'text/javascript':ext==='.css'?'text/css':ext==='.png'?'image/png':'application/octet-stream');fs.createReadStream(file).on('error',()=>{res.writeHead(404).end()}).pipe(res);}catch{res.writeHead(404).end()}
}).listen(4177,'127.0.0.1',()=>console.log('Built Motion Studio renderer: http://127.0.0.1:4177/render'));
