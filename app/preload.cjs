const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('lotus',Object.freeze({
 openRequirement:key=>ipcRenderer.invoke('lotus:open-requirement',key),
 benchmarkStatus:()=>ipcRenderer.invoke('lotus:benchmark-status'),
 runBenchmark:options=>ipcRenderer.invoke('lotus:benchmark-run',options),
 graphics:()=>ipcRenderer.invoke('lotus:graphics'),
 hardwareCapabilities:()=>ipcRenderer.invoke('lotus:hardware-capabilities'),
 selectedCrystalStatus:()=>ipcRenderer.invoke('lotus:selected-crystal-status'),
 runSelectedCrystal:key=>ipcRenderer.invoke('lotus:selected-crystal-run',key),
 liveStatus:()=>ipcRenderer.invoke('lotus:live-status'),
 startLive:options=>ipcRenderer.invoke('lotus:live-start',options),
 stopLive:()=>ipcRenderer.invoke('lotus:live-stop')
}));
