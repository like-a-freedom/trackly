# ADR 0010: Remove Dead Metric Labels and --health-check Flag

## Status
Accepted

## Context
The metrics module registered label values for `kml`, `fit`, and `github` exporters that were never incremented. The `--health-check` CLI flag opened a TCP connection to `127.0.0.1:8080` instead of calling the actual `GET /health` endpoint.

## Decision
Remove dead label registrations (`kml`, `fit` from `TRACK_EXPORTS_TOTAL`; `github` from `AUTH_LOGIN_ATTEMPTS_TOTAL` and `AUTH_USER_REGISTRATIONS_TOTAL`). Remove the `--health-check` CLI flag from `main.rs`.

## Consequences
- YAGNI: metric labels for non-existent exporters removed
- Health check now requires calling `GET /health` (the standard endpoint)
- No behavior change for running systems
