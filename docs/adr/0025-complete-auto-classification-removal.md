# Complete ADR 0014: remove `auto_classifications` field from all structs and queries

ADR 0014 deleted `track_classifier.rs` and the auto-classification feature, but the `auto_classifications: Vec<String>` field persisted in 3 model structs, ~15 DB query sites, and 4 service modules. The field is always `vec![]` — dead data flowing through the entire stack. We remove it from Rust structs and queries. The PostgreSQL column stays (no migration) for backward compatibility; Rust simply ignores it.
