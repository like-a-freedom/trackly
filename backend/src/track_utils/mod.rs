//! Track utilities module
//! This mod.rs wires up submodules for track parsing and metrics

pub mod geometry;
pub mod gpx_parser;
pub mod hash;
pub mod kml_parser;
pub mod metrics;
pub mod optimized_gpx_parser;
pub mod simplification;
pub mod time_utils;
pub mod types;
pub mod zoom_adaptation;

pub use geometry::{haversine_distance, parse_linestring_wkt};
pub use gpx_parser::parse_gpx;
pub use hash::calculate_file_hash;
pub use kml_parser::parse_kml;
pub use optimized_gpx_parser::{parse_gpx_full, parse_gpx_minimal};
pub use simplification::{
    get_simplification_stats, get_tolerance_for_zoom, simplify_json_array,
    simplify_profile_array_adaptive, simplify_profile_data, simplify_track,
    simplify_track_for_zoom,
};
pub use zoom_adaptation::{get_simplification_params, tolerance_for_zoom, SimplificationParams};

#[cfg(test)]
mod tests {
    use super::*;
    use assert_approx_eq::assert_approx_eq;

    #[test]
    fn test_haversine_distance_zero() {
        let a = (55.0, 37.0);
        let b = (55.0, 37.0);
        assert_approx_eq!(haversine_distance(a, b), 0.0, 1e-6);
    }

    #[test]
    fn test_haversine_distance_known() {
        let a = (55.0, 37.0);
        let b = (55.1, 37.0);
        let d = haversine_distance(a, b);
        assert!((d - 11119.5).abs() < 100.0); // ~11.1km
    }

    #[test]
    fn test_parse_linestring_wkt() {
        let wkt = "LINESTRING(37.0 55.0, 38.0 56.0)";
        let pts = parse_linestring_wkt(wkt).unwrap();
        assert_eq!(pts, vec![(55.0, 37.0), (56.0, 38.0)]);
    }
}
