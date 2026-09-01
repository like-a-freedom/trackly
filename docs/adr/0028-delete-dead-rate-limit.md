# Delete dead rate-limit module (YAGNI)

`handlers/rate_limit.rs` (172 LOC) contains 8 functions all marked `#[allow(dead_code)]`. Zero production callers — every function is only exercised by its own `#[cfg(test)]` module. The upload handler does not use rate limiting. YAGNI says: delete the entire module.
