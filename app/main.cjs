const fs=require('node:fs'),path=require('node:path');
const {app,BrowserWindow,protocol,ipcMain,session,shell}=require('electron');
const {createResources}=require('./resources.cjs');
const {createLiveProbe}=require('./live-probe.cjs');
const {createSelectedCrystalEvaluation}=require('./selected-crystal-evaluation.cjs');
const {createBenchmark}=require('./benchmark-controller.cjs');
const {discoverHardware}=require('./hardware-capabilities.cjs');
const {validateOptions,executionIntegrity,reducedSnapshot}=require('./evaluation-policy.cjs');
const dashboard=__dirname,root=path.dirname(dashboard);
const data=path.resolve(process.env.LOTUS_DATA_DIR||path.join(root,'..','lotus-evaluation-data'));process.env.LOTUS_DATA_DIR=data;
const runtime=path.join(data,'desktop');
const smoke=process.argv.includes('--lotus-device-smoke')||process.argv.includes('--lotus-reduction-smoke');
const entry='lotus://app/ui/index.html';
const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'execution-manifest.json'),'utf8'));
fs.mkdirSync(runtime,{recursive:true});
app.setName('Lotus Evaluation');app.setPath('userData',path.join(runtime,smoke?'smoke-profile':'profile'));
app.setPath('sessionData',path.join(runtime,smoke?'smoke-session':'session'));
protocol.registerSchemesAsPrivileged([{scheme:'lotus',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
let window,denialTest=false;const errors=[],handlers=[];
if(!app.requestSingleInstanceLock())app.quit();else{
 app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore();window.show();window.focus();}});
 app.whenReady().then(async()=>{
  const resources=createResources(dashboard),probe=createLiveProbe(dashboard,{jobs:smoke?2:60}),selected=createSelectedCrystalEvaluation(dashboard),benchmark=createBenchmark(dashboard);
  app.on('before-quit',()=>{probe.close();selected.stop();benchmark.close();});
  session.defaultSession.setPermissionRequestHandler((_w,_p,callback)=>callback(false));session.defaultSession.setPermissionCheckHandler(()=>false);
  session.defaultSession.webRequest.onBeforeRequest((d,callback)=>callback({cancel:!d.url.startsWith('lotus://app/')&&d.url!=='about:blank'}));
  protocol.handle('lotus',request=>{try{
   const file=resources.asset(request.url),type={'.html':'text/html','.css':'text/css','.mjs':'text/javascript'}[path.extname(file)];
   return new Response(fs.readFileSync(file),{headers:{'Content-Type':type+'; charset=utf-8','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'"}});
  }catch{return new Response('Unlisted evaluation resource',{status:404});}});
  const handle=(name,fn)=>{handlers.push(name);ipcMain.handle(name,(event,...args)=>{if(event.senderFrame?.url.split('#')[0]!==entry)throw Error('Untrusted evaluation sender');return fn(...args);});};
  async function graphics(){return {hardwareAccelerationEnabled:app.isHardwareAccelerationEnabled(),features:app.getGPUFeatureStatus(),info:await app.getGPUInfo('basic')};}
  handle('lotus:open-requirement',key=>{const urls={'cuda-installation':'https://docs.nvidia.com/cuda/cuda-installation-guide-microsoft-windows/','nvidia-telemetry':'https://docs.nvidia.com/deploy/nvidia-smi/index.html','amd-uprof':'https://www.amd.com/en/developer/uprof.html','amd-smi':'https://rocm.docs.amd.com/projects/amdsmi/en/latest/install/install.html'};if(!Object.hasOwn(urls,key))throw Error('Only listed vendor setup links can be opened');return shell.openExternal(urls[key]);});
  handle('lotus:graphics',graphics);
  handle('lotus:hardware-capabilities',async()=>discoverHardware({graphics:await graphics()}));
  handle('lotus:live-status',()=>{executionIntegrity(root,manifest);return reducedSnapshot(probe.snapshot(),manifest);});
  handle('lotus:benchmark-status',()=>benchmark.snapshot());
  handle('lotus:benchmark-run',async options=>{executionIntegrity(root,manifest);if(probe.snapshot().pid)throw Error('Finish the observed workload first');if(options?.gpuUuid){const found=await discoverHardware();if(!found.gpus.some(d=>d.id===options.gpuUuid&&d.discovery==='nvidia-smi'))throw Error('Selected GPU unavailable');}return benchmark.start(options);});
  handle('lotus:live-start',async options=>{if(['running','verifying'].includes(benchmark.snapshot().status))throw Error('Finish the benchmark first');
   options=validateOptions(options);executionIntegrity(root,manifest);
   if(smoke&&!process.argv.includes('--lotus-live-admission'))throw Error('Live smoke admission is required');
   if(options.gpuUuid){const found=await discoverHardware();if(!found.gpus.some(d=>d.id===options.gpuUuid&&d.discovery==='nvidia-smi'))throw Error('Selected device is unavailable');}
   return reducedSnapshot(probe.start(options),manifest);
  });
  handle('lotus:live-stop',()=>reducedSnapshot(probe.stop(),manifest));
  handle('lotus:selected-crystal-status',()=>selected.snapshot());
  handle('lotus:selected-crystal-run',key=>selected.start(key));
  window=new BrowserWindow({width:1500,height:1000,minWidth:1040,minHeight:720,show:!smoke,title:'Lotus · Evaluation',backgroundColor:'#0d131d',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('will-navigate',(event,url)=>{if(url.split('#')[0]!==entry)event.preventDefault();});
  window.webContents.on('console-message',(event,...legacy)=>{if(!denialTest&&(event.level==='error'||legacy[0]===3))errors.push(event.message??legacy[1]);});
  await window.loadURL(entry);
  if(smoke){
   window.showInactive();
   const interaction=await window.webContents.executeJavaScript(`(async()=>{
    const until=async predicate=>{const deadline=performance.now()+45000;while(!predicate()){if(performance.now()>deadline)throw Error('Evaluation UI timeout');await new Promise(r=>setTimeout(r,100));}};
    await until(()=>!!window.lotusEvaluation);await window.lotusEvaluation.ready;
    const gpu=document.querySelector('[data-hardware-gpu]');await until(()=>!gpu.disabled&&gpu.options.length>0);
    document.getElementById('eval-run').click();let state;const deadline=performance.now()+45000;
    do{await new Promise(r=>setTimeout(r,150));state=await window.lotus.liveStatus();if(state.status==='failed')throw Error(state.error);if(performance.now()>deadline)throw Error('Evaluation workload timeout');}while(state.status!=='complete'||state.pid!==null);
    await window.lotusEvaluation.refresh();
    return {passed:state.events.filter(e=>e.kind==='validated'&&e.passed).length===2,api:Object.keys(window.lotus).sort(),views:[...document.querySelectorAll('[data-view]')].map(e=>e.dataset.view),scripts:[...document.scripts].map(e=>e.src),modelPresent:typeof window.LOTUS_MODEL!=='undefined',catalogPresent:typeof window.LAB_CATALOG!=='undefined',sourceBrowser:!!document.getElementById('source-dialog'),status:document.getElementById('eval-status').textContent,metadata:state.metadata,power:state.events.filter(e=>e.kind==='hardware-sample'),canvasPresent:!!document.getElementById('hw-composition')};
   })()`);
   const socketInteraction=await window.webContents.executeJavaScript(`(async()=>{
    document.querySelector('[data-view="evaluation"]').click();
    const root=document.getElementById('selected-crystal-evaluation'),select=root.querySelector('[data-crystal]'),button=root.querySelector('[data-run-selected]');
    const runs=[];
    for(const key of ['probability','wave','word64']){
     select.value=key;select.dispatchEvent(new Event('change'));button.click();let state;const deadline=performance.now()+45000;
     do{await new Promise(r=>setTimeout(r,200));state=await window.lotus.selectedCrystalStatus();if(state.status==='failed')throw Error(state.error);if(performance.now()>deadline)throw Error('Central test timeout');}while(state.status!=='complete'||state.key!==key);
     await new Promise(r=>setTimeout(r,350));
     const rows=root.querySelectorAll('tbody tr').length;if(rows!==4)throw Error('Central results did not render');runs.push({key,rows,summary:state.summary});
    }
    document.querySelector('[data-view="observatory"]').click();return {passed:runs.length===3,runs};
   })()`);
   await selected.completion();
   const benchmarkInteraction=process.argv.includes('--lotus-benchmark-smoke')?await window.webContents.executeJavaScript(`(async()=>{
    document.querySelector('[data-view="benchmark"]').click();
    const panel=document.getElementById('benchmark-panel');panel.querySelector('[data-benchmark-backend]').value='cuda';panel.querySelector('[data-benchmark-mode]').value='smoke';panel.querySelector('[data-benchmark-run]').click();
    let state;const deadline=performance.now()+240000;do{await new Promise(r=>setTimeout(r,250));state=await window.lotus.benchmarkStatus();if(state.status==='failed')throw Error(state.error);if(performance.now()>deadline)throw Error('Benchmark UI timeout');}while(state.status!=='complete');
    await new Promise(r=>setTimeout(r,600));return state;
   })()`):null;
   denialTest=true;
   const denied=await window.webContents.executeJavaScript(`(async()=>{const prefix='lotus://app/ui/';const names=['data.js','lotus-model.js','source-documents.json','visual-asset-manifest.json','composition-view.mjs','electron/execution-manifest.json','electron/preload.cjs','../dashboard/data.js'];const allowed=(await fetch(prefix+'operator-scene.mjs')).status;const denied=[];for(const name of names)denied.push({name,status:(await fetch(prefix+name)).status});let excludedProducer=false;try{await window.lotus.startLive({producer:'ics-checkpoint'});}catch{excludedProducer=true;}return {allowed,denied,excludedProducer};})()`);
   denialTest=false;
   const state=probe.snapshot();
   const passed=interaction.passed&&socketInteraction.passed&&interaction.views.join(',')==='observatory,evaluation,benchmark'&&!interaction.modelPresent&&!interaction.catalogPresent&&!interaction.sourceBrowser&&denied.allowed===200&&denied.denied.every(x=>x.status===404)&&denied.excludedProducer&&errors.length===0;
   const benchmarkPassed=!benchmarkInteraction||(benchmarkInteraction.metrics.candidate_executed===true&&benchmarkInteraction.replay.status==='passed');
   const result={passed:passed&&benchmarkPassed,interaction,socketInteraction,benchmarkInteraction,denied,handlers,resourceCount:resources.paths().length,run:state.run,errors};
   fs.writeFileSync(path.join(runtime,'smoke-reduction.json'),JSON.stringify(result,null,2));
   await new Promise(r=>setTimeout(r,200));fs.writeFileSync(path.join(runtime,'smoke-reduction.png'),(await window.webContents.capturePage()).toPNG());
   await window.webContents.executeJavaScript('document.querySelector("[data-view=observatory]").click()');await new Promise(r=>setTimeout(r,250));fs.writeFileSync(path.join(runtime,'smoke-live.png'),(await window.webContents.capturePage()).toPNG());
   await window.webContents.executeJavaScript('document.querySelector("[data-view=evaluation]").click()');await new Promise(r=>setTimeout(r,250));fs.writeFileSync(path.join(runtime,'smoke-center.png'),(await window.webContents.capturePage()).toPNG());
   app.exit(result.passed?0:1);
  }
 }).catch(error=>{fs.writeFileSync(path.join(runtime,'startup-error.txt'),error.stack||String(error));app.exit(1);});
}
app.on('window-all-closed',()=>app.quit());
