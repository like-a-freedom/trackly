// Integration tests for track_utils public API (parsing, etc.)
// These tests exercise the public interface as a black box.
// Unit tests for internal logic are now in their respective modules.

use assert_approx_eq::assert_approx_eq;
use backend::track_utils::{haversine_distance, parse_gpx, parse_kml, parse_linestring_wkt};

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
    // assert!(parsed_data.geom_wkt.starts_with("LINESTRING("));
    assert_eq!(parsed_data.geom_geojson["type"], "LineString");
    assert!(parsed_data.length_km > 0.0);
    assert!(parsed_data.elevation_profile.is_some());
    assert!(parsed_data.elevation_up.is_some());
    assert!(parsed_data.elevation_down.is_some());
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
    // assert!(parsed_data.geom_wkt.starts_with("LINESTRING("));
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
    assert!(parsed_data.elevation_up.is_some());
    assert!(parsed_data.elevation_down.is_some());
    assert!(!parsed_data.hash.is_empty());
}

#[test]
fn test_parse_gpx_with_missing_hr_data_points() {
    let gpx_missing_hr = r#"<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
  <trk>
    <name>Test with missing HR</name>
    <trkseg>
      <trkpt lat="55.0" lon="37.0">
        <ele>200.0</ele>
        <extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>100</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions>
      </trkpt>
      <trkpt lat="55.1" lon="37.0">
        <ele>210.0</ele>
        </trkpt> // No HR data for this point
      <trkpt lat="55.2" lon="37.0">
        <ele>220.0</ele>
        <extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>120</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions>
      </trkpt>
    </trkseg>
  </trk>
</gpx>"#;
    let res = parse_gpx(gpx_missing_hr.as_bytes());
    assert!(
        res.is_ok(),
        "Parsing GPX with missing HR failed: {:?}",
        res.err()
    );
    let parsed_data = res.unwrap();
    assert!(parsed_data.hr_data.is_some(), "hr_data should be Some");
    let hr_values = parsed_data.hr_data.unwrap();
    assert_eq!(hr_values.len(), 3);
    assert_eq!(hr_values[0], Some(100));
    assert_eq!(hr_values[1], None); // Missing HR should be None
    assert_eq!(hr_values[2], Some(120));
    assert!(parsed_data.avg_hr.is_some(), "avg_hr should be Some");
    assert_eq!(parsed_data.avg_hr.unwrap(), 110); // (100+120)/2 = 110
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
    assert!(parsed_data.elevation_up.is_some());
    assert!(parsed_data.elevation_down.is_some());
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
    // assert!(parsed_data.geom_wkt.starts_with("LINESTRING("));
    assert_eq!(parsed_data.geom_geojson["type"], "LineString");
    assert!(parsed_data.length_km > 0.0);
    assert!(parsed_data.elevation_profile.is_some());
    assert!(parsed_data.elevation_up.is_some());
    assert!(parsed_data.elevation_down.is_some());
    assert!(!parsed_data.hash.is_empty());
}

#[test]
fn test_parse_gpx_moving_stats() {
    // GPX with 3 points: 2 moving, 1 pause
    let gpx = r#"<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test">
  <trk><name>Test</name><trkseg>
    <trkpt lat="55.0" lon="37.0"><ele>200.0</ele><time>2024-01-01T10:00:00Z</time></trkpt>
    <trkpt lat="55.1" lon="37.0"><ele>210.0</ele><time>2024-01-01T10:10:00Z</time></trkpt>
    <trkpt lat="55.1" lon="37.0"><ele>210.0</ele><time>2024-01-01T10:30:00Z</time></trkpt>
  </trkseg></trk>
</gpx>"#;
    let res = parse_gpx(gpx.as_bytes());
    assert!(res.is_ok());
    let parsed = res.unwrap();
    // There should be moving and pause time
    assert!(parsed.moving_time.is_some());
    assert!(parsed.pause_time.is_some());
    assert!(parsed.moving_avg_speed.is_some());
    assert!(parsed.moving_avg_pace.is_some());
    // Moving time should be less than total duration
    assert!(parsed.moving_time.unwrap() < parsed.duration_seconds.unwrap());
    // Pause time should be > 0
    assert!(parsed.pause_time.unwrap() > 0);
}

#[test]
fn test_parse_gpx_hr_min_max() {
    let gpx = r#"<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test">
  <trk><name>Test</name><trkseg>
    <trkpt lat="55.0" lon="37.0"><ele>200.0</ele><time>2024-01-01T10:00:00Z</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>100</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>
    <trkpt lat="55.1" lon="37.0"><ele>210.0</ele><time>2024-01-01T10:10:00Z</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>150</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>
    <trkpt lat="55.1" lon="37.0"><ele>210.0</ele><time>2024-01-01T10:30:00Z</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>120</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>
  </trkseg></trk>
</gpx>"#;
    let res = parse_gpx(gpx.as_bytes());
    assert!(res.is_ok());
    let parsed = res.unwrap();
    assert_eq!(parsed.hr_min, Some(100));
    assert_eq!(parsed.hr_max, Some(150));
    assert_eq!(parsed.avg_hr, Some(123));
}

#[test]
fn test_parse_gpx_with_time_data() {
    let gpx_with_time = r#"<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test">
  <trk>
    <n>Test with Time</n>
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
