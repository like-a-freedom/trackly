// Geometry utilities for trackly
// Contains functions for geospatial calculations and WKT parsing

/// Calculates the distance between two points (lat, lon) in meters using the haversine formula
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
