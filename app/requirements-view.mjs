const links=new Map([
 ['https://docs.nvidia.com/cuda/cuda-installation-guide-microsoft-windows/','cuda-installation'],
 ['https://docs.nvidia.com/deploy/nvidia-smi/index.html','nvidia-telemetry'],
 ['https://www.amd.com/en/developer/uprof.html','amd-uprof'],
 ['https://rocm.docs.amd.com/projects/amdsmi/en/latest/install/install.html','amd-smi']
]);
for(const link of document.querySelectorAll('#hardware-capabilities a')){
 const key=links.get(link.href);if(key)link.onclick=event=>{event.preventDefault();window.lotus.openRequirement(key).catch(error=>{document.querySelector('[data-hardware-status]').textContent=error.message;});};
}
