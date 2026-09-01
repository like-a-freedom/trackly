# ADR 0019: Cap bboxCache with LRU eviction

## Status
Accepted

## Context
`useTracks.bboxCache` and `heatmapCache` are unbounded `Map`s that grow without eviction. In production with many map movements, this causes unbounded memory growth.

## Decision
Add a 100-entry max-size cap on both caches. When the cache exceeds 100 entries, the oldest entry (by insertion order) is evicted. This is applied after TTL-based cleanup.

The cap is shared between bbox and heatmap caches (each has its own `Map` but shares the `BBOX_CACHE_MAX_SIZE = 100` constant). The eviction helper `evictIfNeeded()` is reused.

## Consequences
- Memory bounded: max 100 entries × (data + overhead) per cache
- TTL cleanup still runs first (entries older than 30s are removed)
- LRU eviction only triggers if TTL cleanup didn't reduce below cap
- 100 entries covers ~100 different zoom levels / bboxes, which is more than enough for typical usage
