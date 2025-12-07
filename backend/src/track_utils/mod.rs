//! Track utilities module
//! This mod.rs wires up submodules for track parsing and metrics

pub mod elevation;
pub mod elevation_enrichment;
pub mod geometry;
pub mod gpx_parser;
pub mod hash;
pub mod kml_parser;
pub mod metrics;
pub mod optimized_gpx_parser;
pub mod pace_filter;
pub mod simplification;
pub mod slope;
pub mod time_utils;
pub mod zoom_adaptation;

pub use elevation::{
    calculate_elevation_metrics, extract_elevations_from_track_points, has_elevation_data,
    smooth_elevation_data, ElevationMetrics,
};
pub use elevation_enrichment::{ElevationEnrichmentService, EnrichmentResult};
pub use geometry::{
  extract_coordinates_from_geojson, extract_segments_from_geojson, geojson_from_segments,
  haversine_distance, length_km_for_segments, parse_linestring_wkt, split_points_by_gap,
};
pub use gpx_parser::parse_gpx;
pub use hash::calculate_file_hash;
pub use kml_parser::parse_kml;
pub use optimized_gpx_parser::{parse_gpx_full, parse_gpx_minimal};
pub use pace_filter::{
    detect_cycling_and_get_config, filter_pace_data, get_pace_filter_config, PaceFilterConfig,
};
pub use simplification::{
    get_simplification_stats, get_tolerance_for_zoom, simplify_json_array,
    simplify_profile_array_adaptive, simplify_profile_data, simplify_track,
    simplify_track_for_zoom,
};
pub use slope::{
    calculate_slope_metrics, can_calculate_slopes, recalculate_slope_metrics, SlopeMetrics,
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

    // Integration tests for track parsing
    #[test]
    fn test_parse_gpx_minimal() {
        let gpx = r#"<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test">
  <trk><name>Test</name><trkseg>
    <trkpt lat="55.0" lon="37.0"><ele>200.0</ele></trkpt>
    <trkpt lat="55.1" lon="37.0"><ele>210.0</ele></trkpt>
  </trkseg></trk>
</gpx>"#;
        let res = parse_gpx(gpx.as_bytes());
        assert!(res.is_ok());
        let parsed_data = res.unwrap();
        assert_eq!(parsed_data.geom_geojson["type"], "LineString");
        assert!(parsed_data.length_km > 0.0);
        assert!(parsed_data.elevation_profile.is_some());
        assert!(parsed_data.elevation_gain.is_some());
        assert!(parsed_data.elevation_loss.is_some());
        assert!(!parsed_data.hash.is_empty());
    }

    #[test]
    fn test_parse_gpx_with_hr_data() {
        let gpx_with_hr = r#"<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
  <trk>
    <name>Test with HR</name>
    <trkseg>
      <trkpt lat="55.0" lon="37.0">
        <ele>200.0</ele>
        <extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>100</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions>
      </trkpt>
      <trkpt lat="55.1" lon="37.0">
        <ele>210.0</ele>
        <extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>110</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions>
      </trkpt>
      <trkpt lat="55.2" lon="37.0">
        <ele>220.0</ele>
        <extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>120</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions>
      </trkpt>
    </trkseg>
  </trk>
</gpx>"#;
        let res = parse_gpx(gpx_with_hr.as_bytes());
        assert!(res.is_ok(), "Parsing GPX with HR failed: {:?}", res.err());
        let parsed_data = res.unwrap();
        assert_eq!(parsed_data.geom_geojson["type"], "LineString");
        assert!(parsed_data.length_km > 0.0);
        assert!(parsed_data.elevation_profile.is_some());
        assert!(parsed_data.hr_data.is_some(), "hr_data should be Some");
        let hr_values = parsed_data.hr_data.unwrap();
        assert_eq!(hr_values.len(), 3);
        assert_eq!(hr_values[0], Some(100));
        assert_eq!(hr_values[1], Some(110));
        assert_eq!(hr_values[2], Some(120));
        assert!(parsed_data.avg_hr.is_some(), "avg_hr should be Some");
        assert_eq!(parsed_data.avg_hr.unwrap(), 110); // (100+110+120)/3 = 110
        assert!(parsed_data.elevation_gain.is_some());
        assert!(parsed_data.elevation_loss.is_some());
        assert!(!parsed_data.hash.is_empty());
    }

    #[test]
    fn test_parse_gpx_no_hr_data() {
        let gpx_no_hr = r#"<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test">
  <trk><name>Test No HR</name><trkseg>
    <trkpt lat="55.0" lon="37.0"><ele>200.0</ele></trkpt>
    <trkpt lat="55.1" lon="37.0"><ele>210.0</ele></trkpt>
  </trkseg></trk>
</gpx>"#;
        let res = parse_gpx(gpx_no_hr.as_bytes());
        assert!(
            res.is_ok(),
            "Parsing GPX with no HR failed: {:?}",
            res.err()
        );
        let parsed_data = res.unwrap();
        assert!(parsed_data.hr_data.is_none(), "hr_data should be None");
        assert!(parsed_data.avg_hr.is_none(), "avg_hr should be None");
    }

    #[test]
    fn test_parse_kml_minimal() {
        let kml = r#"<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
<Placemark><LineString><coordinates>37.0,55.0,200 37.0,55.1,210</coordinates></LineString></Placemark>
</Document>
</kml>"#;
        let res = parse_kml(kml.as_bytes());
        if let Err(e) = &res {
            println!("KML parse error: {e:?}");
        }
        assert!(res.is_ok());
        let parsed_data = res.unwrap();
        assert_eq!(parsed_data.geom_geojson["type"], "LineString");
        assert!(parsed_data.length_km > 0.0);
        assert!(parsed_data.elevation_profile.is_some());
        assert!(parsed_data.elevation_gain.is_some());
        assert!(parsed_data.elevation_loss.is_some());
        assert!(!parsed_data.hash.is_empty());
    }

    #[test]
    fn test_parse_kml_with_track() {
        let kml_track = r#"<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
<Placemark>
<name>Test Track</name>
<Track>
<when>2024-01-01T10:00:00Z</when>
<when>2024-01-01T10:01:00Z</when>
<coord>37.0 55.0 200</coord>
<coord>37.1 55.1 210</coord>
</Track>
</Placemark>
</Document>
</kml>"#;
        let res = parse_kml(kml_track.as_bytes());
        if let Err(e) = &res {
            println!("KML Track parse error: {e:?}");
        }
        assert!(res.is_ok());
        let parsed_data = res.unwrap();
        assert_eq!(parsed_data.geom_geojson["type"], "LineString");
        assert!(parsed_data.length_km > 0.0);
        assert!(parsed_data.time_data.is_some());
        let time_data = parsed_data.time_data.unwrap();
        assert_eq!(time_data.len(), 2);
        assert!(time_data[0].is_some());
        assert!(time_data[1].is_some());
        assert!(!parsed_data.hash.is_empty());
    }

    #[test]
    fn test_parse_gpx_route_only() {
        let gpx_route = r#"<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test">
  <rte><name>Test Route</name>
    <rtept lat="55.0" lon="37.0"><ele>200.0</ele></rtept>
    <rtept lat="55.1" lon="37.0"><ele>210.0</ele></rtept>
    <rtept lat="55.2" lon="37.0"><ele>220.0</ele></rtept>
  </rte>
</gpx>"#;
        let res = parse_gpx(gpx_route.as_bytes());
        assert!(res.is_ok(), "Parsing GPX route failed: {:?}", res.err());
        let parsed_data = res.unwrap();
        assert_eq!(parsed_data.geom_geojson["type"], "LineString");
        assert!(parsed_data.length_km > 0.0);
        assert!(parsed_data.elevation_profile.is_some());
        assert!(parsed_data.elevation_gain.is_some());
        assert!(parsed_data.elevation_loss.is_some());
        assert!(!parsed_data.hash.is_empty());
    }

    #[test]
    fn test_parse_gpx_with_time_data() {
        let gpx_with_time = r#"<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test">
  <trk>
    <name>Test with Time</name>
    <trkseg>
      <trkpt lat="55.0" lon="37.0">
        <ele>200.0</ele>
        <time>2024-01-01T10:00:00Z</time>
      </trkpt>
      <trkpt lat="55.1" lon="37.0">
        <ele>210.0</ele>
        <time>2024-01-01T10:01:00Z</time>
      </trkpt>
      <trkpt lat="55.2" lon="37.0">
        <ele>220.0</ele>
        <time>2024-01-01T10:02:00Z</time>
      </trkpt>
    </trkseg>
  </trk>
</gpx>"#;
        let res = parse_gpx(gpx_with_time.as_bytes());
        assert!(res.is_ok(), "Parsing GPX with time failed: {:?}", res.err());
        let parsed_data = res.unwrap();

        assert_eq!(parsed_data.geom_geojson["type"], "LineString");
        assert!(parsed_data.length_km > 0.0);
        assert!(parsed_data.time_data.is_some(), "time_data should be Some");

        let time_values = parsed_data.time_data.unwrap();
        assert_eq!(time_values.len(), 3);

        // Check that times are correctly parsed
        assert!(time_values[0].is_some(), "First time should be Some");
        assert!(time_values[1].is_some(), "Second time should be Some");
        assert!(time_values[2].is_some(), "Third time should be Some");

        // Compare ISO strings
        assert_eq!(
            time_values[0].unwrap().to_rfc3339(),
            "2024-01-01T10:00:00+00:00"
        );
        assert_eq!(
            time_values[1].unwrap().to_rfc3339(),
            "2024-01-01T10:01:00+00:00"
        );
        assert_eq!(
            time_values[2].unwrap().to_rfc3339(),
            "2024-01-01T10:02:00+00:00"
        );

        assert!(parsed_data.elevation_profile.is_some());
        assert!(!parsed_data.hash.is_empty());
    }

    // Performance and optimization tests
    #[test]
    fn test_zoom_tolerance_calculation() {
        // Test that different zoom levels result in different tolerance values

        // Lower zoom should have higher tolerance (more simplification)
        let low_zoom_tolerance = tolerance_for_zoom(5.0); // World view
        let mid_zoom_tolerance = tolerance_for_zoom(12.0); // City view
        let high_zoom_tolerance = tolerance_for_zoom(18.0); // Street view

        assert!(low_zoom_tolerance > mid_zoom_tolerance);
        assert!(mid_zoom_tolerance > high_zoom_tolerance);

        // Specific expected values
        assert_eq!(low_zoom_tolerance, 100.0); // ~100m for world view
        assert_eq!(mid_zoom_tolerance, 25.0); // ~25m for city view
        assert_eq!(high_zoom_tolerance, 2.0); // ~2m for street view
    }

    #[test]
    fn test_performance_expectations() {
        use crate::models::TrackMode;

        // Simulate a large track with many points
        let large_track_points = 20000;

        // Overview mode should be more aggressive
        let overview_params =
            get_simplification_params(TrackMode::Overview, Some(10.0), large_track_points);

        // Detail mode should preserve more data
        let detail_params =
            get_simplification_params(TrackMode::Detail, Some(10.0), large_track_points);

        // Overview should have higher tolerance (more simplification)
        assert!(overview_params.tolerance_meters > detail_params.tolerance_meters);

        // Overview should have lower max points
        assert!(overview_params.max_points < detail_params.max_points);

        // Both should require simplification for huge tracks
        assert!(overview_params.should_simplify(large_track_points));
        assert!(detail_params.should_simplify(large_track_points));
    }
}
