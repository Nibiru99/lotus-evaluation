const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const pick=(value,keys)=>Object.fromEntries(keys.filter(k=>value?.[k]!==undefined).map(k=>[k,value[k]]));
const META=['schema','session','sequence','host_seconds','kind','job','producer','dimension','batch','rank','jobs_limit','interval_seconds','scope','timing_scope','device_name','requested_gpu_uuid','device_pci_bus_id','source_sha256','runtime_source_sha256'];
const EVENTS=['schema','session','sequence','host_seconds','kind','job','source','target','bytes','device_ms','passed','stopped','completed_jobs','chart','buffer_chart','buffer_name','buffer_shape','copy_sha256','input_sha256','operator_input_sha256','output_sha256','packet_id','center_sha256','layout','coordinate_axes','geometry','gpu_uuid','device_pci_bus_id','gpu_temperature_c','gpu_power_w','gpu_utilization_percent','gpu_memory_mib','cpu_process_seconds','host_rss_bytes'];
function validateOptions(options={}){
 if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>!['producer','gpuUuid'].includes(k)))throw Error('Only workload and detected GPU selection are accepted');
 const producer=options.producer??'dense-reference';
 if(!['dense-reference'].includes(producer))throw Error('Producer is excluded from evaluation');
 if(options.gpuUuid!==undefined&&!/^GPU-[\da-f-]+$/i.test(options.gpuUuid))throw Error('Detected GPU UUID required');
 return {producer,...(options.gpuUuid?{gpuUuid:options.gpuUuid}:{})};
}
function executionIntegrity(root,manifest){
 for(const [name,hash] of Object.entries(manifest.files)){
  const file=path.resolve(root,name);
  if(!file.startsWith(root+path.sep)||crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==hash)throw Error('Installed execution source changed; review required');
 }
}
function reducedSnapshot(state,manifest){
 const metadata=state.metadata;
 if(metadata&&(metadata.source_sha256!==manifest.mapSha256||metadata.runtime_source_sha256!==manifest.producers[metadata.producer??'dense-reference']))throw Error('Execution identity mismatch');
 return {status:state.status,pid:state.pid,integrity:'passed',error:state.error?'Observed workload failed; private run log retained.':null,
  metadata:metadata?pick(metadata,META):null,
  events:state.events.map(event=>event.kind==='session-start'?pick(event,META):pick(event,EVENTS)),
  scope:'Instrumented evaluation process; complete logs retained locally'};
}
module.exports={validateOptions,executionIntegrity,reducedSnapshot};
