// Geometry utilities for trackly
// Contains functions for geospatial calculations and WKT parsing

use serde_json::{json, Value};

/// Maximum allowed gap between consecutive points before starting a new segment (meters)
/// Keep generous to avoid over-splitting normal tracks; still cuts obvious teleports.
const DEFAULT_MAX_GAP_METERS: f64 = 100_000.0; // 100 km

/// Calculates the distance between two points (lat, lon) in meters using the haversine formula
/// TODO: maybe switch to https://github.com/georust/geo?tab=readme-ov-file
pub fn haversine_distance(a: (f64, f64), b: (f64, f64)) -> f64 {
    let (lat1, lon1) = a;
    let (lat2, lon2) = b;
    let r = 6_371_000.0_f64;
    let dlat = (lat2 - lat1).to_radians();
    let dlon = (lon2 - lon1).to_radians();
    let lat1 = lat1.to_radians();
    let lat2 = lat2.to_radians();
    let a = (dlat / 2.0).sin().powi(2) + lat1.cos() * lat2.cos() * (dlon / 2.0).sin().powi(2);
    let c = 2.0 * a.sqrt().atan2((1.0 - a).sqrt());
    r * c
}

/// Parses WKT string LINESTRING to vector (lat, lon)
pub fn parse_linestring_wkt(wkt: &str) -> Option<Vec<(f64, f64)>> {
    let wkt = wkt.trim();
    if !wkt.starts_with("LINESTRING(") || !wkt.ends_with(")") {
        return None;
    }
    let coords = &wkt[11..wkt.len() - 1];
    let pts = coords
        .split(',')
        .map(|pair| {
            let nums: Vec<_> = pair.split_whitespace().collect();
            if nums.len() != 2 {
                return None;
            }
            let lon = nums[0].parse::<f64>().ok()?;
            let lat = nums[1].parse::<f64>().ok()?;
            Some((lat, lon))
        })
        .collect::<Option<Vec<_>>>();
    pts
}

/// Extract coordinates from GeoJSON LineString
pub fn extract_coordinates_from_geojson(geom_geojson: &Value) -> Result<Vec<(f64, f64)>, String> {
    match geom_geojson.get("type").and_then(|t| t.as_str()) {
        Some("LineString") => extract_linestring_coords(geom_geojson),
        Some("MultiLineString") => {
            let mut merged = Vec::new();
            for segment in extract_multiline_segments(geom_geojson)? {
                merged.extend(segment);
            }
            Ok(merged)
        }
        _ => Err("Unsupported geometry type".to_string()),
    }
}

/// Extract segments from a LineString or MultiLineString GeoJSON as (lat, lon) pairs.
pub fn extract_segments_from_geojson(geom_geojson: &Value) -> Result<Vec<Vec<(f64, f64)>>, String> {
    match geom_geojson.get("type").and_then(|t| t.as_str()) {
        Some("LineString") => Ok(vec![extract_linestring_coords(geom_geojson)?]),
        Some("MultiLineString") => extract_multiline_segments(geom_geojson),
        _ => Err("Unsupported geometry type".to_string()),
    }
}

/// Split a sequence of points into segments whenever the gap exceeds `max_gap_meters`.
/// Points are (lat, lon).
pub fn split_points_by_gap(
    points: &[(f64, f64)],
    max_gap_meters: Option<f64>,
) -> Vec<Vec<(f64, f64)>> {
    if points.is_empty() {
        return Vec::new();
    }

    let threshold = max_gap_meters.unwrap_or(DEFAULT_MAX_GAP_METERS);
    let mut segments: Vec<Vec<(f64, f64)>> = Vec::new();
    let mut current: Vec<(f64, f64)> = vec![points[0]];

    for next in points.iter().skip(1) {
        let prev = *current.last().unwrap();
        let gap = haversine_distance(prev, *next);

        if gap > threshold {
            if !current.is_empty() {
                segments.push(current);
            }
            current = vec![*next];
        } else {
            current.push(*next);
        }
    }

    if !current.is_empty() {
        segments.push(current);
    }

    segments
}

/// Calculate total length in km for multiple segments (lat, lon) skipping jumps.
pub fn length_km_for_segments(segments: &[Vec<(f64, f64)>]) -> f64 {
    let mut length_m = 0.0;
    for segment in segments {
        for w in segment.windows(2) {
            length_m += haversine_distance(w[0], w[1]);
        }
    }
    length_m / 1000.0
}

/// Build GeoJSON from segments. Single segment => LineString, otherwise MultiLineString.
pub fn geojson_from_segments(segments: &[Vec<(f64, f64)>]) -> Value {
    if segments.len() <= 1 {
        let coords: Vec<Value> = segments
            .first()
            .unwrap_or(&Vec::new())
            .iter()
            .map(|(lat, lon)| json!([*lon, *lat]))
            .collect();
        return json!({
            "type": "LineString",
            "coordinates": coords,
        });
    }

    let coords: Vec<Value> = segments
        .iter()
        .map(|segment| {
            Value::Array(
                segment
                    .iter()
                    .map(|(lat, lon)| json!([*lon, *lat]))
                    .collect(),
            )
        })
        .collect();

    json!({
        "type": "MultiLineString",
        "coordinates": coords,
    })
}

fn extract_linestring_coords(geom_geojson: &Value) -> Result<Vec<(f64, f64)>, String> {
    let coordinates = geom_geojson
        .get("coordinates")
        .ok_or("Missing coordinates in geometry")?
        .as_array()
        .ok_or("Coordinates is not an array")?;

    let mut result = Vec::new();
    for coord in coordinates {
        let coord_array = coord.as_array().ok_or("Coordinate is not an array")?;
        if coord_array.len() < 2 {
            return Err("Coordinate must have at least 2 elements".to_string());
        }

        let lon = coord_array[0].as_f64().ok_or("Longitude is not a number")?;
        let lat = coord_array[1].as_f64().ok_or("Latitude is not a number")?;

        result.push((lat, lon));
    }

    Ok(result)
}

fn extract_multiline_segments(geom_geojson: &Value) -> Result<Vec<Vec<(f64, f64)>>, String> {
    let coordinates = geom_geojson
        .get("coordinates")
        .ok_or("Missing coordinates in geometry")?
        .as_array()
        .ok_or("Coordinates is not an array")?;

    let mut segments = Vec::new();
    for segment in coordinates {
        let seg_coords = segment
            .as_array()
            .ok_or("Segment is not an array")?
            .iter()
            .map(|coord| {
                let coord_array = coord.as_array().ok_or("Coordinate is not an array")?;
                if coord_array.len() < 2 {
                    return Err("Coordinate must have at least 2 elements".to_string());
                }
                let lon = coord_array[0].as_f64().ok_or("Longitude is not a number")?;
                let lat = coord_array[1].as_f64().ok_or("Latitude is not a number")?;
                Ok((lat, lon))
            })
            .collect::<Result<Vec<(f64, f64)>, String>>()?;
        segments.push(seg_coords);
    }

    Ok(segments)
}

#[cfg(test)]
mod tests {
    use super::*;
    use assert_approx_eq::assert_approx_eq;
    use serde_json::json;

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
    fn test_extract_coordinates_from_geojson_valid() {
        let geojson = json!({
            "type": "LineString",
            "coordinates": [[37.0, 55.0], [37.1, 55.1]]
        });
        let result = extract_coordinates_from_geojson(&geojson).unwrap();
        assert_eq!(result, vec![(55.0, 37.0), (55.1, 37.1)]);
    }

    #[test]
    fn test_extract_coordinates_from_geojson_invalid() {
        let invalid_geojson = json!({"type": "LineString"});
        assert!(extract_coordinates_from_geojson(&invalid_geojson).is_err());
    }

    #[test]
    fn test_extract_coordinates_from_geojson_empty() {
        let empty_geojson = json!({
            "type": "LineString",
            "coordinates": []
        });

        let result = extract_coordinates_from_geojson(&empty_geojson).unwrap();
        assert!(result.is_empty());
    }
}
