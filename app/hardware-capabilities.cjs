const os = require('node:os');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const run = promisify(execFile);

// Discovery only: fixed read-only query, no renderer-supplied executable or arguments.
function parseNvidia(text) {
  return text.trim().split(/\r?\n/).filter(Boolean).map(line => {
    const fields = line.split(',').map(x => x.trim());
    const [index, uuid, name, driver, memory] = fields;
    if (fields.length !== 5 || !/^\d+$/.test(index) || !/^GPU-[\da-f-]+$/i.test(uuid) || !Number.isFinite(Number(memory))) {
      throw new Error('Unexpected NVIDIA inventory response');
    }
    return {id:uuid, index:Number(index), name, driver, memoryMiB:Number(memory), vendor:'NVIDIA',
      discovery:'nvidia-smi', compute:'CUDA candidate; runtime admission required'};
  });
}

async function discoverHardware({execute=run, system=os, graphics={}}={}) {
  const cores = system.cpus();
  const result = {schema:'lotus.hardware-capabilities/v1', observedAt:new Date().toISOString(),
    cpu:{name:cores[0]?.model || 'Unavailable', logicalProcessors:cores.length,
      execution:'Host CPU; thread/affinity control is workload-specific'},
    memory:{totalBytes:system.totalmem(), freeBytes:system.freemem()},
    platform:system.platform(), arch:system.arch(), gpus:[],
    tools:{nvidiaSmi:'unavailable', amdUprof:'not probed; optional CPU energy integration', amdSmi:'not integrated'},
    scope:'Read-only inventory. NVIDIA UUID selection is admitted separately at launch for dense-reference; graphics detection alone is not compute support.'};
  try {
    const response = await execute('nvidia-smi', ['--query-gpu=index,uuid,name,driver_version,memory.total', '--format=csv,noheader,nounits'],
      {timeout:4000, maxBuffer:65536, windowsHide:true, encoding:'utf8'});
    result.gpus = parseNvidia(response.stdout);
    result.tools.nvidiaSmi = 'available';
  } catch { result.tools.nvidiaSmi = 'unavailable or query refused'; }
  for (const device of graphics.info?.gpuDevice || []) {
    // Chromium's adapter inventory is a graphics capability, not compute admission.
    if (device.vendorId === 0x10de && result.gpus.length) continue;
    result.gpus.push({id:`graphics:${device.vendorId}:${device.deviceId}`, name:device.deviceString || `Graphics adapter ${device.vendorId}:${device.deviceId}`,
      vendor:device.vendorId === 0x1002 ? 'AMD' : device.vendorId === 0x8086 ? 'Intel' : 'Other',
      discovery:'Electron graphics', compute:'Compute adapter not integrated'});
  }
  result.graphicsAcceleration = graphics.hardwareAccelerationEnabled ?? null;
  return result;
}
module.exports = {discoverHardware, parseNvidia};
