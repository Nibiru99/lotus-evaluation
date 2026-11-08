# Synthetic hardware environment check

This runner generates a seeded QR-unitary fixture and compares CPU BLAS with optional GPU resident and full upload/readback execution. It checks numerical output and norm preservation. The fixture is synthetic and independent of the protected Lotus operator.

Requires an existing Python 3.11+ environment with NumPy. GPU execution additionally requires a compatible CuPy/NVIDIA environment. No dependencies or drivers are installed automatically.

```text
python verify_package.py
python preflight.py --backend cpu --dimension 512 --trials 1 --out ../../lotus-preflight-cpu
python preflight.py --backend cuda --dimension 65536 --trials 3 --out ../../lotus-preflight-cuda
```

Use a fresh output path. Valid dimensions are 512, 8192 and 65,536; trials range from 1 to 5. CUDA mode fails explicitly when unavailable. Process-local scratch/cache folders and a 120-second timeout bound this calibration run. Hardware clocks, voltage and power limits are unchanged.

Outputs include metrics JSON, timing CSV, numerical arrays, an ASCII projection, logs and hashes. No power stream is captured, so energy is unavailable. Resident and full-I/O timings have separate boundaries. The protected candidate is not executed; its historical speedups are not scores of this synthetic test.

Results remain local. Review any returned logs for identifying paths. The complete connected-socket evaluation is described separately in the companion's crystal-test protocol.
