// Optimized GPX parser for trackly
// This version separates fast parsing from expensive metric calculations

use crate::models::ParsedTrackData;
use crate::track_utils::time_utils::parse_gpx_time;
use quick_xml::Reader;
use quick_xml::events::Event;
use sha2::{Digest, Sha256};

/// Fast minimal GPX data for duplicate checking
#[derive(Debug)]
pub struct MinimalGpxData {
    pub hash: String,
    pub points: Vec<(f64, f64)>, // (lat, lon)
    pub recorded_at: Option<chrono::DateTime<chrono::Utc>>,
}

/// Parse GPX file quickly for duplicate checking (minimal processing)
/// This is much faster than full parsing for large files
pub fn parse_gpx_minimal(bytes: &[u8]) -> Result<MinimalGpxData, String> {
    let mut reader = Reader::from_reader(bytes);
    reader.config_mut().trim_text(true);
    let mut buf = Vec::new();

    let mut points = Vec::new();
    let mut recorded_at: Option<String> = None;

    // State variables (simplified for minimal parsing)
    let mut lat: Option<f64> = None;
    let mut lon: Option<f64> = None;
    let mut element_stack: Vec<String> = Vec::new();
    let mut capture_text = false;
    let mut text_target: Option<String> = None;
    let mut found_metadata_time = false;

    // Fallback: store points from rtept if no trkpt found
    let mut rte_points = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => {
                let tag = String::from_utf8_lossy(e.name().as_ref()).to_string();
                let tag_stripped = tag.split(':').next_back().unwrap_or(&tag);
                element_stack.push(tag_stripped.to_string());

                match tag_stripped {
                    "trkpt" => {
                        lat = e.attributes().find_map(|a| {
                            a.ok().and_then(|attr| {
                                if attr.key.as_ref() == b"lat" {
                                    std::str::from_utf8(&attr.value).ok()?.parse::<f64>().ok()
                                } else {
                                    None
                                }
                            })
                        });
                        lon = e.attributes().find_map(|a| {
                            a.ok().and_then(|attr| {
                                if attr.key.as_ref() == b"lon" {
                                    std::str::from_utf8(&attr.value).ok()?.parse::<f64>().ok()
                                } else {
                                    None
                                }
                            })
                        });
                    }
                    "rtept" => {
                        lat = e.attributes().find_map(|a| {
                            a.ok().and_then(|attr| {
                                if attr.key.as_ref() == b"lat" {
                                    std::str::from_utf8(&attr.value).ok()?.parse::<f64>().ok()
                                } else {
                                    None
                                }
                            })
                        });
                        lon = e.attributes().find_map(|a| {
                            a.ok().and_then(|attr| {
                                if attr.key.as_ref() == b"lon" {
                                    std::str::from_utf8(&attr.value).ok()?.parse::<f64>().ok()
                                } else {
                                    None
                                }
                            })
                        });
                    }
                    "time" => {
                        // If inside <metadata>, prefer this as recorded_at
                        if element_stack.len() >= 2
                            && element_stack[element_stack.len() - 2] == "metadata"
                            && !found_metadata_time
                        {
                            capture_text = true;
                            text_target = Some("metadata_time".to_string());
                        }
                    }
                    _ => {}
                }
            }
            Ok(Event::Text(e)) => {
                if capture_text {
                    if let Some(target) = &text_target
                        && target.as_str() == "metadata_time"
                        && !found_metadata_time
                    {
                        let text = std::str::from_utf8(&e).unwrap_or_default();
                        recorded_at = Some(text.to_string());
                        found_metadata_time = true;
                    }
                    capture_text = false;
                    text_target = None;
                }
            }
            Ok(Event::End(ref e)) => {
                let tag = String::from_utf8_lossy(e.name().as_ref()).to_string();
                let tag_stripped = tag.split(':').next_back().unwrap_or(&tag);
                if let Some(last) = element_stack.pop() {
                    // Defensive: ensure stack matches
                    if last != tag_stripped {
                        // Mismatched tag, ignore
                    }
                }
                match tag_stripped {
                    "trkpt" => {
                        if let (Some(lat), Some(lon)) = (lat, lon) {
                            points.push((lat, lon));
                        }
                        lat = None;
                        lon = None;
                    }
                    "rtept" => {
                        if let (Some(lat), Some(lon)) = (lat, lon) {
                            rte_points.push((lat, lon));
                        }
                        lat = None;
                        lon = None;
                    }
                    _ => {}
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(format!("Error parsing GPX: {e}")),
            _ => {}
        }
        buf.clear();
    }

    // If no track points, but route points exist, use them
    let final_points = if points.is_empty() && !rte_points.is_empty() {
        rte_points
    } else {
        points
    };

    if final_points.is_empty() {
        return Err("No points in GPX".to_string());
    }

    // Calculate hash from original file content
    let hash = {
        let mut hasher = Sha256::new();
        hasher.update(bytes);
        format!("{:x}", hasher.finalize())
    };

    let recorded_at_parsed = if let Some(time_str) = recorded_at {
        parse_gpx_time(&time_str)
    } else {
        None
    };

    Ok(MinimalGpxData {
        hash,
        points: final_points,
        recorded_at: recorded_at_parsed,
    })
}

/// Parse full GPX data with all metrics (expensive operation)
/// Should only be called after duplicate check passes
pub fn parse_gpx_full(bytes: &[u8]) -> Result<ParsedTrackData, String> {
    // We already have the minimal data, but for now just delegate to full parser
    // In the future we could optimize this further by reusing minimal parsing results
    crate::track_utils::gpx_parser::parse_gpx(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_minimal_parsing() {
        let gpx_content = r#"<?xml version="1.0"?>
<gpx>
    <metadata>
        <time>2023-01-01T10:00:00Z</time>
    </metadata>
    <trk>
        <trkseg>
            <trkpt lat="55.0" lon="37.0"></trkpt>
            <trkpt lat="55.1" lon="37.1"></trkpt>
        </trkseg>
    </trk>
</gpx>"#;

        let minimal = parse_gpx_minimal(gpx_content.as_bytes()).unwrap();
        assert_eq!(minimal.points.len(), 2);
        assert_eq!(minimal.points[0], (55.0, 37.0));
        assert_eq!(minimal.points[1], (55.1, 37.1));
        assert!(minimal.recorded_at.is_some());
        assert_eq!(minimal.hash.len(), 64); // SHA256 hash length
    }

    #[test]
    fn test_empty_gpx() {
        let gpx_content = r#"<?xml version="1.0"?>
<gpx>
</gpx>"#;

        let result = parse_gpx_minimal(gpx_content.as_bytes());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("No points"));
    }

    #[test]
    fn test_route_fallback() {
        let gpx_content = r#"<?xml version="1.0"?>
<gpx>
    <rte>
        <rtept lat="55.0" lon="37.0"></rtept>
        <rtept lat="55.1" lon="37.1"></rtept>
    </rte>
</gpx>"#;

        let minimal = parse_gpx_minimal(gpx_content.as_bytes()).unwrap();
        assert_eq!(minimal.points.len(), 2);
        assert_eq!(minimal.points[0], (55.0, 37.0));
    }
}
