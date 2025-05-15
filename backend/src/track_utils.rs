use gpx::{read, Gpx};
use sha2::{Digest, Sha256};
use std::io::Cursor;
use std::str;
use std::str::FromStr;

// Calculates the distance between two points (lat, lon) in meters using the haversine formula
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
            let nums: Vec<_> = pair.trim().split_whitespace().collect();
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

/// Parsing GPX file, returns tuple (geom_wkt, length_km, elevation_up, elevation_down, avg_speed, avg_hr, duration_seconds, hash)
pub fn parse_gpx(
    bytes: &[u8],
) -> Result<
    (
        String,
        f64,
        Option<f64>,
        Option<f64>,
        Option<f64>,
        Option<i32>,
        Option<i32>,
        String,
    ),
    String,
> {
    let mut cursor = Cursor::new(bytes);
    let gpx: Gpx = read(&mut cursor).map_err(|e| format!("gpx parse error: {e}"))?;
    let mut points = Vec::new();
    for track in &gpx.tracks {
        for seg in &track.segments {
            for wp in &seg.points {
                let lat = wp.point().y();
                let lon = wp.point().x();
                points.push((lat, lon));
            }
        }
    }
    if points.is_empty() {
        return Err("No points in GPX".to_string());
    }
    let geom_wkt = format!(
        "LINESTRING({})",
        points
            .iter()
            .map(|(lat, lon)| format!("{} {}", lon, lat))
            .collect::<Vec<_>>()
            .join(", ")
    );
    let mut length_km = 0.0;
    for w in points.windows(2) {
        length_km += haversine_distance(w[0], w[1]);
    }
    length_km /= 1000.0;
    let hash = {
        let mut hasher = Sha256::new();
        hasher.update(bytes);
        format!("{:x}", hasher.finalize())
    };
    Ok((geom_wkt, length_km, None, None, None, None, None, hash))
}

/// Parsing a KML file, returns tuple (geom_wkt, length_km, elevation_up, elevation_down, avg_speed, avg_hr, duration_seconds, hash)
pub fn parse_kml(
    bytes: &[u8],
) -> Result<
    (
        String,
        f64,
        Option<f64>,
        Option<f64>,
        Option<f64>,
        Option<i32>,
        Option<i32>,
        String,
    ),
    String,
> {
    use kml::types::Kml;
    let s = std::str::from_utf8(bytes).map_err(|e| format!("utf8 error: {e}"))?;
    let kml = Kml::from_str(s).map_err(|e| format!("kml parse error: {e}"))?;
    let mut points = Vec::new();
    fn extract_linestrings(kml: &Kml, points: &mut Vec<(f64, f64)>) {
        use kml::types::{Geometry, Kml};
        match kml {
            Kml::Placemark(pm) => {
                if let Some(geom) = &pm.geometry {
                    match geom {
                        Geometry::LineString(ls) => {
                            for coord in &ls.coords {
                                points.push((coord.y, coord.x));
                            }
                        }
                        Geometry::MultiGeometry(mg) => {
                            for g in &mg.geometries {
                                match g {
                                    Geometry::LineString(ls) => {
                                        for coord in &ls.coords {
                                            points.push((coord.y, coord.x));
                                        }
                                    }
                                    Geometry::MultiGeometry(_) => {
                                        // Recursively handle nested MultiGeometry
                                        extract_linestrings(
                                            &Kml::Placemark(kml::types::Placemark {
                                                geometry: Some(g.clone()),
                                                ..Default::default()
                                            }),
                                            points,
                                        );
                                    }
                                    _ => {}
                                }
                            }
                        }
                        _ => {}
                    }
                }
            }
            Kml::Document { elements, .. } => {
                for el in elements {
                    extract_linestrings(el, points);
                }
            }
            Kml::Folder { elements, .. } => {
                for el in elements {
                    extract_linestrings(el, points);
                }
            }
            _ => {}
        }
    }
    extract_linestrings(&kml, &mut points);
    if points.is_empty() {
        return Err("No points in KML".to_string());
    }
    let geom_wkt = format!(
        "LINESTRING({})",
        points
            .iter()
            .map(|(lat, lon)| format!("{} {}", lon, lat))
            .collect::<Vec<_>>()
            .join(", ")
    );
    let mut length_km = 0.0;
    for w in points.windows(2) {
        length_km += haversine_distance(w[0], w[1]);
    }
    length_km /= 1000.0;
    let hash = {
        let mut hasher = sha2::Sha256::new();
        hasher.update(bytes);
        format!("{:x}", hasher.finalize())
    };
    Ok((geom_wkt, length_km, None, None, None, None, None, hash))
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
