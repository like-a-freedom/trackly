use assert_approx_eq::assert_approx_eq;
use backend::track_utils::{haversine_distance, parse_linestring_wkt};

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
