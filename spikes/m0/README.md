# M0 feasibility probes

Run the isolated prototypes with:

```sh
node --test spikes/m0/prototypes.test.mjs
```

These are throwaway, standard-library-only experiments. They do not alter the
server, database, local reference instance, or VPS. The S1, S5, S6, and S7
experiments use in-memory fixtures; they establish that small policy shapes
are feasible, not that production routes, adapters, or persisted settings
enforce them. S3 checks for local sandbox executables and refuses an
uncontained fallback. S4 creates a temporary Git mirror, clone, and bundle.
The S4 timing is for a tiny fixture and is not evidence for the 1 GB / 30 s
gate. Full §3.3 pass conditions are assessed in the companion evidence report.
