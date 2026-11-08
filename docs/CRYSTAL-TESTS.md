# Central crystal tests

The desktop central-test page selects one of three mathematical carriers. Each runs four declared inputs through the native numerical worker, with a serialized midpoint restore and two matching continuation cases. Input/output host-buffer identities and answers are checked independently. No other carrier, arbitrary recipe or checkpoint import is accepted.

| Carrier | Inputs and check |
|---|---|
| Probability Transport | Four normalized72-bin inputs; discrete circular diffusion, conserved probability mass and buffer hashes |
| Travelling Wave | Declared one/two/three-step continuations;72-bin angular harmonic, source clock, phase law and buffer hashes |
| Word/Subtraction | Four unsigned64-bit subtraction pairs including underflow, maximum word and a value beyond binary64 exact-integer range; borrow and retained readout |

The worker operates on selected source geometry using ordinary host buffers. It performs no GPU dispatch and supplies no crystal speedup or power estimate. The observation and matched benchmark pages have separate execution paths and numerical checks.

The selected saved JSON samples can also be inspected independently with samples/check_samples.py. Saved-density readout, issued boundary, native numerical continuation and physical material performance are distinct. These are finite mathematical models, not measured physical crystals. No decay/copy-expiry mechanism is included. Broader durability/noise/depth results are research records with their own specimens and conditions, not guarantees attached to these three samples.

The native port was compared with the existing JS numerical state on12 cases under a fixed1e-12 absolute+relative gate; observed maximum residual4.44e-16. This admits those cases on the tested Windows x64 stack. No general theorem or other grower modes follow from that gate.
