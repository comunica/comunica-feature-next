# LATERAL evaluation tests

These are the [Apache Jena `LATERAL` evaluation tests](https://github.com/apache/jena/tree/main/jena-arq/testing/ARQ/Lateral)
for [SEP-0006](https://github.com/w3c-cg/sparql-dev/blob/main/SEP/SEP-0006/sep-0006.md),
vendored here so the `spec:lateral` script can run them against the engine.

The `spec:lateral` script points `rdf-test-suite` at the original Jena manifest URL but uses its
`-m` URL-to-file mapping to serve the files from this directory, so the suite is hermetic and needs
no network access.

## Local modifications to the upstream files

- **`manifest.ttl`** — the manifest resource was changed from `<#manifest>` to `<>` so that
  `rdf-test-suite` resolves it against the document URL (it looks the manifest node up by the exact
  URL it was given). No tests were added, removed, or altered.
- **`lateral-4.srj` / `lateral-5.srj`** — the upstream result files contain an unquoted JSON key
  (`z:` instead of `"z":`) and, for `lateral-5.srj`, an unquoted `z` in the `vars` array. These are
  invalid JSON that Jena's lenient reader accepts but a strict SPARQL-JSON parser rejects. The keys
  were quoted; the expected values are unchanged.

## Skipped tests

Two tests are skipped via `--skip "(lateral-1|lateral-6)"`. Both concern `LIMIT` inside `LATERAL`,
which is implementation-defined:

- **`lateral-1` (`LATERAL - LIMIT 2`)** — the inner `SELECT * { ?s :label ?label } ORDER BY ?s
  LIMIT 2` orders only by the (per-binding constant) `?s`, so which two `?label` values survive the
  `LIMIT` is non-deterministic. Jena keeps a different pair than Comunica does.
- **`lateral-6` (`LATERAL - LATERAL inside OPTIONAL`)** — Jena applies the sub-`SELECT`'s `LIMIT`
  globally before correlating `?s`, whereas Comunica follows the SEP-0006 substitution semantics and
  applies the `LIMIT` per left-hand-side binding. Both are defensible readings of an under-specified
  case.
