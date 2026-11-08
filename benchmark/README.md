# Lotus hardware benchmark — base evaluation candidate

Run a real optimized GPU implementation against CPU, CuPy-expression and GPU-BLAS references on the same input. The fixture is deliberately public and independently generated; the protected research operator, full Lotus application, crystal socket and source checkpoints are separate.

## Execute and independently check

Use an existing Python3.11+ environment with NumPy and threadpoolctl. NVIDIA execution additionally requires compatible CuPy/CUDA. No dependencies, drivers or hardware settings are changed automatically.

```text
python verify_package.py
python run_benchmark.py --mode smoke --backend cpu --out ../base-cpu-smoke
python replay_results.py ../base-cpu-smoke
python run_benchmark.py --mode smoke --backend cuda --out ../base-cuda-smoke
python replay_results.py ../base-cuda-smoke
```

The smoke checks512/batch1 and65,536/batch8 with warmup and one saved timing per method. Complete outputs are retained and checked independently. Benchmark mode adds dimensions512/8,192/65,536, batches1/8 and five timings per case; three fresh processes give a more informative spread. CUDA mode fails explicitly if the candidate cannot execute. CPU-only results are labelled baseline-only.

## What is measured

The operation repeats a512-coordinate72-layer complex128 pair map in independent blocks. The package includes a seeded public schedule, coefficients and composed reference operator. `generate_fixture.py` reconstructs those arrays at a fresh output path. It is not an arbitrary dense65,536-dimensional operator or whole-application benchmark.

CPU pair updates/BLAS, CuPy expressions, the compiled candidate and GPU BLAS consume identical values. Device-resident and upload/work/readback boundaries are reported separately. Setup, validation and resident readback remain outside apply timing where stated in the runner. Full-I/O includes complete upload/readback. No power stream is captured; energy stays unavailable.

Native builds are supplied forSM80/86/89/90. Only the architecture actually run in a retained result is runtime-validated. Other hardware must pass its own output checks before a score is used. A finite block-size/buffer condition is not a universal dimensional ceiling.

## Research and distribution

The accompanying evaluation licence covers this benchmark and the three designated central test carriers. Production integration or broader runtime access needs separate permission; third-party terms retain their own scope.

The public fixture can be inspected and reconstructed completely by design. The compiled binary may also be analysed. Evaluation permission is not a secrecy guarantee.

Prior Lotus results retain their original fixtures and baselines. New measurements here belong to this public-fixture edition; do not transplant an earlier speedup or energy figure into them. Zenodo papers/evidence and the GitHub executable delivery remain separate.

Research and development: David Glowalla.
