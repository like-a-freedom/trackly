//! Prometheus metrics.
//!
//! Split by responsibility (ADR 0039):
//!
//! - [`registry`] — the collector registry, static labels, DB-pool handles and
//!   the startup baseline.
//! - [`definitions`] — the collector definitions themselves.
//! - [`recorders`] — the recording functions production code calls.
//! - [`http`] — request instrumentation and the `/metrics` endpoint.
//!
//! The public surface is the `pub use` block below and is deliberately identical
//! to the pre-split single-file module, so every `crate::metrics::…` call site is
//! unaffected.

mod definitions;
mod http;
mod recorders;
mod registry;

#[cfg(test)]
mod tests;

pub use http::{HttpMetricsLayer, HttpMetricsMiddleware, serve_metrics};
pub use recorders::*;
pub use registry::initialize_metrics_baseline;
