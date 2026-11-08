export function mountHardwareCapabilities({root,api}) {
  const status=root.querySelector('[data-hardware-status]'), gpu=root.querySelector('[data-hardware-gpu]');
  const cpu=root.querySelector('[data-hardware-cpu]'), refresh=root.querySelector('[data-hardware-refresh]');
  const detail=root.querySelector('[data-hardware-detail]');
  let inventory;
  function showDevice() {
    const device=inventory?.gpus.find(x=>x.id===gpu.value);
    detail.textContent=device ? `${device.vendor} · ${device.discovery} · ${device.compute}${device.memoryMiB ? ` · ${device.memoryMiB} MiB` : ''}. Selection applies to the next Dense reference observation; an active run keeps its device. The matched benchmark has a separate control.` : 'No GPU inventory available. CPU checks remain a separate execution path.';
  }
  async function update() {
    refresh.disabled=true;
    try {
      if(!api?.hardwareCapabilities)throw Error('Open the original Lotus Electron application to inspect local devices.');
      const previous=gpu.value;
      inventory=await api.hardwareCapabilities();
      cpu.textContent=`${inventory.cpu.name} · ${inventory.cpu.logicalProcessors} logical processors`;
      gpu.replaceChildren();
      for(const device of inventory.gpus) {
        const option=document.createElement('option');option.value=device.id;option.textContent=device.name;gpu.append(option);
      }
      if(inventory.gpus.some(x=>x.id===previous))gpu.value=previous;
      gpu.disabled=!inventory.gpus.length;
      status.textContent=`RAM ${(inventory.memory.totalBytes/2**30).toFixed(1)} GiB · NVIDIA query: ${inventory.tools.nvidiaSmi} · graphics acceleration: ${inventory.graphicsAcceleration ?? 'unknown'}`;
      showDevice();
    } catch(error) {status.textContent=error.message;gpu.disabled=true;}
    finally {refresh.disabled=false;}
  }
  gpu.onchange=showDevice;refresh.onclick=update;
  return {ready:update(),refresh:update};
}
const root=typeof document==='undefined'?null:document.getElementById('hardware-capabilities');
if(root)mountHardwareCapabilities({root,api:window.lotus});
