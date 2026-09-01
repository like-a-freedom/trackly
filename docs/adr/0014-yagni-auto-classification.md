# ADR 0014: YAGNI on Auto-Classification

## Status
Accepted

## Context
The 13-variant `TrackClassification` enum and `classify_track()` function wrote to `auto_classifications` column, which was never displayed, queried, or filtered. Zero observable effect.

## Decision
Delete `track_classifier.rs` entirely. Parsers write empty `auto_classifications` Vec. The DB column is kept for schema backward compatibility. `pace_filter.rs` retains a simplified `TrackClassification` enum for internal use with always-default config.

## Consequences
- 282 LOC deleted
- `auto_classifications` column kept in schema (no migration needed)
- Parsers no longer call the classifier
- Pace filter always uses distance-based defaults
