// A small local static server. No install, build step, or map service is needed.
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname,sep} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)),port=Number(process.env.BIRDWAY_PORT||8000);
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.bin':'application/octet-stream','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.txt':'text/plain','.md':'text/plain'};
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');let path=resolve(root,'.'+decodeURIComponent(url.pathname));
  if(path!==resolve(root)&&!path.startsWith(resolve(root)+sep)){res.writeHead(403);res.end('Forbidden');return;}
  if((await stat(path)).isDirectory())path=resolve(path,'index.html');
  const data=await readFile(path);res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:data);
 }catch{res.writeHead(404,{'Content-Type':'text/plain'});res.end('Not found');}
});
server.on('error',error=>{console.error(error.code==='EADDRINUSE'?`Port ${port} is in use. Try BIRDWAY_PORT=8002 npm start.`:error.message);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>console.log(`Birdway is ready: http://localhost:${port}\nPress Ctrl+C to stop.`));
