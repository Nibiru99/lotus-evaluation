# Lotus — hardware and crystal evaluation

Run real CPU/GPU work through the original-derived Lotus hardware view, compare the compiled GPU candidate with references, and check three selected mathematical carriers in one central socket. The research library, private corner crystals and general grower are excluded.

## Start

Read [requirements](REQUIREMENTS.md), verify the package with `python -B verify_release.py`, set LOTUS_ELECTRON_EXE to an installed Electron executable, then open **Start Lotus.cmd**. No installation is automatic. Python checks and the benchmark can also run headlessly; see [benchmark](benchmark/README.md) and [selected samples](samples/README.md).

## Three independent test paths

- **Operator observation:** paced65,536D/batch16 simplex work with actual CPU/staging/upload/GPU/readback/check events. The scene uses96 plotted coordinates; full-array numerical checks and the last input/output packet are retained. Watt readings are sparse observations, not integrated energy.
- **Matched benchmarks:** the compiled public512-block/72-layer complex128 fixture, with CPU/CuPy/GPU-BLAS references, resident/full-I/O timings and independent full-output replay. Short admission has one measured trial; benchmark mode repeats each case5 times. Use3 fresh process replicates before assessing sustained performance. This is a separate operation from the simplex observation.
- **Central tests:** Probability Transport, Travelling Wave and64-bit Word/Subtraction, four fixed cases each. A native worker uses selected specimen geometry and the numerical carrier. It checks a midpoint serialized restore. The independent checker verifies each answer and host-buffer identity. These tests do not dispatch the GPU or measure crystal speedup.

Results and profiles are written to the local data folder outside this package. Numerical output, timings, board power and deployment savings have different scopes. Existing [recorded benchmark results](docs/BENCHMARK-RESULTS.md) remain dated to their original fixture; no universal acceleration of arbitrary applications is claimed.

See [visual tour](docs/VISUAL-TOUR.md), [research records](docs/RESEARCH.md) and [third-party notices](notices/README.md). The native numerical port was checked against the existing JS carrier on12 cases with maximum observed state residual4.44e-16 under a predeclared1e-12 absolute+relative gate. This is a finite software/model validation, not a physical material claim. Evaluation rights accompany the reviewed release; production use needs a separate agreement.
