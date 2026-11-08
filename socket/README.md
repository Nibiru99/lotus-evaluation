# Archived six-case source-bound socket receipt

This is the retained earlier six-case evidence record. For the current native three-carrier/four-case controls, use the desktop page and [central test protocol](../docs/CRYSTAL-TESTS.md).

The test operation is subtraction of unsigned 64-bit integers modulo 2^64. Six fixed cases cover zero, ordinary subtraction, underflow, the maximum word, an integer above exact binary64 integer precision, and equal maximum words.

The recorded run used the existing private Lotus five-site route and three saved source fields. It performed arithmetic through their paired densities, retained each answer after a source step, and compared an uninterrupted path against a restore after job 3. Each primary job admitted five symbol occurrences: operand, subtraction operator, operand, equality gate and result.

## Check the retained result

From the repository root, with Python's standard library:

```text
python socket/check_socket.py --receipt examples/host-socket-receipt.json
```

Expected summary: six cases and thirty primary site visits passed. The checker independently calculates the exact answers and borrow bits, checks the retained post-source answers and checks ordered state/time continuity. It also requires the declared resume-control result. Hashes and recorded assertions are not a digital signature or independent authentication of execution.

## Execute with a separately approved backend

An evaluator who receives the private runtime can supply its trusted Node.js adapter:

```text
python socket/check_socket.py --adapter PATH-TO-APPROVED-ADAPTER.mjs --out socket-result.json
```

This launches local code supplied separately by the owner; inspect and trust that adapter before running it. Node.js is required for this mode. The checker sends the fixed fixture over standard input, accepts a reduced JSON receipt and verifies it. The adapter has a 120-second timeout and results are written to a fresh output file. Nothing is uploaded automatically.

The shipped package contains no private adapter, source checkpoint, ISA kernel or growth engine. The recorded operation was host-side computation. GPU transport, dimensional-capacity sweeps, decay lifetime and acceleration are separate tests; their scores are not inferred from these six results. The companion's preflight remains a separate synthetic hardware calibration.
