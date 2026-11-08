const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');const {spawn}=require('node:child_process');
function createBenchmark(app){
 const root=path.dirname(app),data=path.resolve(process.env.LOTUS_DATA_DIR);let child=null,state={status:'idle',rows:[],error:null},run=null;
 function snapshot(){
  if(run&&fs.existsSync(path.join(run,'timings.csv'))){const lines=fs.readFileSync(path.join(run,'timings.csv'),'utf8').trim().split(/\r?\n/),head=lines.shift().split(',');state.rows=lines.filter(x=>x.split(',').length===head.length).slice(-512).map(line=>Object.fromEntries(line.split(',').map((v,i)=>[head[i],v])));}
  return structuredClone(state);
 }
 function execute(args,timeout,logFile=path.join(run,'worker.log')){return new Promise((resolve,reject)=>{
  const scratch=path.join(run,'scratch');fs.mkdirSync(scratch,{recursive:true});
  const env={...process.env,TEMP:scratch,TMP:scratch,CUPY_CACHE_DIR:path.join(scratch,'cupy'),PYTHONIOENCODING:'utf-8',PYTHONDONTWRITEBYTECODE:'1'};
  if(state.gpuUuid){env.CUDA_VISIBLE_DEVICES=state.gpuUuid;env.LOTUS_GPU_UUID=state.gpuUuid;}
  const p=spawn(process.env.LOTUS_PYTHON||'python',['-B',...args],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});child=p;
  const timer=setTimeout(()=>p.kill(),timeout);let out='';p.stdout.on('data',b=>{out=(out+b).slice(-65536);fs.appendFileSync(logFile,b);});p.stderr.on('data',b=>fs.appendFileSync(logFile,b));
  p.on('error',e=>{clearTimeout(timer);child=null;reject(e);});p.on('close',code=>{clearTimeout(timer);child=null;code===0?resolve(out):reject(Error('Benchmark/check failed; results retained'));});
 });}
 function start(options){
  if(!options||Object.keys(options).some(k=>!['backend','mode','gpuUuid'].includes(k))||!['cpu','cuda'].includes(options.backend)||!['smoke','benchmark'].includes(options.mode))throw Error('Choose the declared benchmark/backend');
  if(child)return snapshot();
  run=path.join(data,'benchmarks','benchmark-'+Date.now());fs.mkdirSync(run,{recursive:true});state={status:'running',rows:[],error:null,backend:options.backend,mode:options.mode,gpuUuid:options.gpuUuid||null};
  (async()=>{
   await execute([path.join(root,'benchmark/run_benchmark.py'),'--worker','--backend',options.backend,'--mode',options.mode,'--out',run],185000);
   const hashes=Object.fromEntries(fs.readdirSync(run).filter(n=>fs.statSync(path.join(run,n)).isFile()).map(n=>[n,crypto.createHash('sha256').update(fs.readFileSync(path.join(run,n))).digest('hex')]));
   fs.writeFileSync(path.join(run,'ARTIFACT-HASHES.json'),JSON.stringify(hashes,null,2));state.status='verifying';
   // Independent replay output/log is outside the hashed result folder.
   const verifyLog=path.join(path.dirname(run),path.basename(run)+'-replay.log');
   const result=await execute([path.join(root,'benchmark/replay_results.py'),run],180000,verifyLog);
   // Replay's only output is numerical receipt JSON; it is also retained alongside results.
   state.replay=JSON.parse(result);state.metrics=JSON.parse(fs.readFileSync(path.join(run,'metrics.json'),'utf8'));state.status='complete';
  })().catch(()=>{state.status='failed';state.error='Benchmark or independent replay failed; inspect local results.';}).finally(()=>fs.writeFileSync(path.join(run,'desktop-status.json'),JSON.stringify(state,null,2)));
  return snapshot();
 }
 return {start,snapshot,close:()=>child?.kill()};
}module.exports={createBenchmark};
