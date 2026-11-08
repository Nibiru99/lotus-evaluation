const fs=require('node:fs'),path=require('node:path');
const FILES=Object.freeze(['index.html','styles.css','hardware.css','socket-evaluation.css','hardware-capabilities-view.mjs','evaluation-view.mjs','hardware-view.mjs','hardware-state.mjs','canonical-circle.mjs','live-scene.mjs','operator-scene.mjs','selected-crystal-view.mjs','benchmark-view.mjs','requirements-view.mjs']);
function createResources(dashboard){
 const prefix='/ui/';
 function asset(url){
  const u=new URL(url);if(u.protocol!=='lotus:'||u.hostname!=='app'||u.search||u.hash)throw Error('Unknown evaluation resource');
  const pathname=decodeURIComponent(u.pathname),name=pathname.startsWith(prefix)?pathname.slice(prefix.length):'';
  if(!FILES.includes(name))throw Error('Unlisted evaluation resource');
  const file=fs.realpathSync(path.join(dashboard,name)),relative=path.relative(fs.realpathSync(dashboard),file);
  if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('Resource escaped evaluation directory');
  return file;
 }
 return {asset,paths:()=>FILES.map(n=>prefix+n)};
}
module.exports={createResources};
