//! Track handler sub-modules.
//!
//! Splits the monolithic track handler into focused modules:
//! - upload: GPX/KML file upload
//! - list: GeoJSON listing, heatmap, account tracks
//! - detail: single track detail (adaptive + simplified)
//! - search: track search
//! - update: name/description/categories/visibility/bulk operations + delete
//! - export: GPX export
//! - elevation: elevation enrichment + preview
//! - slope: slope profile + recalculation
//! - geometry: simplification preview
//! - editor: create/update/duplicate from the track editor
//! - debug: debug endpoints

mod detail;
mod editor;
mod elevation;
mod export;
mod geometry;
mod list;
mod search;
mod slope;
mod update;
mod upload;

// Debug endpoint - intentionally not #[cfg(debug)] since it's guarded by feature flags
mod debug;

// Re-export everything from sub-modules so `pub use tracks::*` in the parent mod.rs works.
pub use debug::*;
pub use detail::*;
pub use editor::*;
pub use elevation::*;
pub use export::*;
pub use geometry::*;
pub use list::*;
pub use search::*;
pub use slope::*;
pub use update::*;
pub use upload::*;
