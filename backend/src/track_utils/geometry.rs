// Geometry utilities for trackly
// Contains functions for geospatial calculations and WKT parsing

use serde_json::Value;

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
