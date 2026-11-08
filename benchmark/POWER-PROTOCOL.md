# Energy follow-up boundary

This kit's timing output leaves `energy_j` null. A separately agreed sustained-work energy campaign is required.

- Use the same case, candidate, baseline, precision and complete-output contract.
- Compare at least four alternating baseline/candidate windows of 15 seconds or longer per fresh process; reverse the starting order between processes. Recompute complete batches rather than repeatedly returning an answer cache. Verify complete outputs before and after every window.
- Record high-resolution workload start/end timestamps and completed vector counts. Match them to an uninterrupted power trace on the same host clock. Preserve timestamp convention/timezone, sample interval, query duration and instrument accuracy/averaging metadata.
- Require endpoint bracketing, at least five interior samples and a maximum two-second gap for this proposed sustained GPU-board protocol. Retain the fixed admission criteria before starting; do not tune gaps after seeing a failed trace.
- Integrate power piecewise over the exact window: joules = integral of watts over seconds. Report gross J/vector and W; label any idle subtraction separately.
- NVIDIA board power is a device-wide component measurement including other GPU activity. CPU-package counters, GPU-board data and wall-meter readings are different domains. Do not call their unmatched sum total wall electricity.
- Capture whole-server wall energy for a facility comparison, then apply the facility's actual PUE and tariff. A fixed-work/time comparison can proceed independently, but monetary energy savings need a measured or explicitly assumed energy input.
- Retain background activity, clocks, temperature, errors, failed samples, boundary shifts and instrument sensitivity. No overclocking or driver changes are part of this protocol.

This is preparation for a separate energy campaign, not a claim that the external timing kit has already measured electricity.
