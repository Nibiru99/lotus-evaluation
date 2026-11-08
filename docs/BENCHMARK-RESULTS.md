# Public-fixture GPU benchmark — 7 November 2026

The optimized candidate completed the same complex128 pair-map operation as the GPU-BLAS reference on an RTX 4060 Ti (SM89). Native ISA job 1656 recorded the execution; job 1657 verified the revised independent replayer against the unchanged retained outputs and rejected a numerically altered output even after its file hash was updated.

| Coordinates / batch | Method | Recorded time (ms) |
|---|---|---|
| 512 / 1 | gpu_candidate_resident | 1.1225 |
| 512 / 1 | gpu_candidate_full_io | 1.3962 |
| 512 / 1 | gpu_blas_full_io | 0.3393 |
| 512 / 1 | gpu_blas_resident | 0.0871 |
| 65536 / 8 | gpu_blas_full_io | 11.9039 |
| 65536 / 8 | gpu_candidate_resident | 2.0087 |
| 65536 / 8 | gpu_blas_resident | 8.1058 |
| 65536 / 8 | gpu_candidate_full_io | 5.6252 |

At 65,536 coordinates / batch 8, the candidate was 4.04× faster than GPU BLAS for device-resident application, and 2.12× with full upload/work/readback. At 512 / batch 1 it was slower than GPU BLAS; both outcomes are retained above.

These are one timing per method/case after warmup, demonstrating functional admission and a preliminary workload-specific comparison. They do not estimate a stable performance distribution. The runner supports repeated benchmark mode for the evaluator's own machine. The CPU reference used one BLAS thread; it is not a fully tuned multicore comparison. No power stream was captured, so this run supplies no energy or electricity-saving figure.

Across CPU and CUDA runs, 20 complete timed outputs / 90 vectors were independently replayed. All 59 numerical checks passed; maximum absolute error was 2.154e-14 against a 1e-12 gate. The operation uses 72 layers of independent 512-coordinate blocks. This result does not establish cross-block mixing, dimensional nesting, crystal-derived acceleration or whole-application speedup. Those remain separate experiments with their own records.

The public fixture is reproducible from its included seed/generator. Its map is intentionally inspectable. Compiled binary delivery still exposes the included optimization to analysis; a licence defines permitted use, not technical secrecy. Other supplied SM builds require their own hardware validation.

See [Base benchmark](../benchmark/README.md) for exact commands and timing boundaries. Historical Lotus research results belong to their original fixtures and are not substituted for this test's results.
