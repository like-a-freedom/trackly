//! Build browser-compatible routing packs from an Overpass highway extract.
use fast_paths::{FastGraph32, InputGraph};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{collections::BTreeMap, error::Error, fs, path::Path};

fn tag<'a>(way: &'a Value, key: &str) -> &'a str {
    way["tags"][key].as_str().unwrap_or("")
}

fn allowed(way: &Value, profile: &str) -> bool {
    let key = match profile {
        "driving" => "motor_vehicle",
        "cycling" | "mtb" => "bicycle",
        _ => "foot",
    };
    let explicit = tag(way, key);
    if matches!(explicit, "no" | "private") {
        return false;
    }
    if matches!(tag(way, "access"), "no" | "private")
        && !matches!(explicit, "yes" | "designated" | "permissive")
    {
        return false;
    }
    let highway = tag(way, "highway");
    if matches!(
        highway,
        "construction" | "proposed" | "abandoned" | "raceway"
    ) {
        return false;
    }
    if matches!(explicit, "yes" | "designated" | "permissive") {
        return true;
    }
    match profile {
        "driving" => !matches!(
            highway,
            "path" | "footway" | "pedestrian" | "steps" | "cycleway" | "bridleway" | "corridor"
        ),
        "cycling" | "mtb" => !matches!(
            highway,
            "motorway" | "motorway_link" | "trunk" | "trunk_link" | "steps" | "corridor"
        ),
        _ => !matches!(
            highway,
            "motorway" | "motorway_link" | "trunk" | "trunk_link"
        ),
    }
}

fn distance(a: [f64; 2], b: [f64; 2]) -> usize {
    let lat = (b[0] - a[0]).to_radians();
    let lon = (b[1] - a[1]).to_radians();
    let h = (lat / 2.).sin().powi(2)
        + a[0].to_radians().cos() * b[0].to_radians().cos() * (lon / 2.).sin().powi(2);
    (12_742_000. * h.clamp(0., 1.).sqrt().asin())
        .round()
        .max(1.) as usize
}

fn main() -> Result<(), Box<dyn Error>> {
    let args: Vec<String> = std::env::args().collect();
    if args.len() != 3 {
        return Err("Usage: build_graph <overpass.json> <output-directory>".into());
    }
    let source: Value = serde_json::from_slice(&fs::read(&args[1])?)?;
    if source.get("remark").is_some() {
        return Err("Overpass returned an incomplete extract".into());
    }
    let ways = source["elements"]
        .as_array()
        .ok_or("Missing OSM elements")?;
    let output = Path::new(&args[2]);
    fs::create_dir_all(output)?;
    let mut profiles = serde_json::Map::new();
    for profile in ["hiking", "walking", "running", "cycling", "mtb", "driving"] {
        let mut nodes: BTreeMap<u64, [f64; 2]> = BTreeMap::new();
        for way in ways.iter().filter(|way| allowed(way, profile)) {
            let ids = way["nodes"].as_array().ok_or("Missing OSM node IDs")?;
            let coordinates = way["geometry"].as_array().ok_or("Missing OSM geometry")?;
            if ids.len() != coordinates.len() {
                return Err("OSM geometry count mismatch".into());
            }
            for (id, point) in ids.iter().zip(coordinates) {
                let position = [
                    point["lat"].as_f64().ok_or("Invalid latitude")?,
                    point["lon"].as_f64().ok_or("Invalid longitude")?,
                ];
                if !position[0].is_finite()
                    || !position[1].is_finite()
                    || position[0].abs() > 90.
                    || position[1].abs() > 180.
                {
                    return Err("Invalid OSM coordinates".into());
                }
                nodes.insert(id.as_u64().ok_or("Invalid OSM node identity")?, position);
            }
        }
        let indices: BTreeMap<u64, usize> = nodes
            .keys()
            .enumerate()
            .map(|(index, id)| (*id, index))
            .collect();
        let mut graph = InputGraph::new();
        for way in ways.iter().filter(|way| allowed(way, profile)) {
            let ids = way["nodes"].as_array().ok_or("Missing OSM node IDs")?;
            let oneway = if matches!(profile, "hiking" | "walking" | "running")
                || (profile != "driving" && tag(way, "oneway:bicycle") == "no")
            {
                "no"
            } else {
                tag(way, "oneway")
            };
            for pair in ids.windows(2) {
                let a = pair[0].as_u64().ok_or("Invalid node")?;
                let b = pair[1].as_u64().ok_or("Invalid node")?;
                let cost = distance(nodes[&a], nodes[&b]);
                let forward = oneway != "-1";
                let backward = !matches!(oneway, "yes" | "1" | "true")
                    && !(oneway.is_empty()
                        && tag(way, "junction") == "roundabout"
                        && profile == "driving");
                if forward {
                    graph.add_edge(indices[&a], indices[&b], cost);
                }
                if backward {
                    graph.add_edge(indices[&b], indices[&a], cost);
                }
            }
        }
        graph.freeze();
        if graph.get_num_nodes() == 0 {
            return Err(format!("No routing network for {profile}").into());
        }
        if graph.get_num_nodes() != nodes.len() {
            return Err(format!(
                "Node index mismatch for {profile}; extract includes isolated nodes"
            )
            .into());
        }
        let prepared = fast_paths::prepare(&graph);
        let packed = bincode::serde::encode_to_vec(
            FastGraph32::new(&prepared),
            bincode::config::standard(),
        )?;
        let coordinates: Vec<u8> = nodes
            .values()
            .flat_map(|position| position.iter().flat_map(|value| value.to_le_bytes()))
            .collect();
        let mut digest = Sha256::new();
        digest.update(&packed);
        digest.update(&coordinates);
        let version = format!("sha256-{:x}", digest.finalize());
        let name = format!("default_{profile}_{version}");
        fs::write(output.join(format!("{name}.bin")), &packed)?;
        fs::write(output.join(format!("{name}_nodes.bin")), coordinates)?;
        println!(
            "{profile}: {} nodes, {} packed bytes",
            nodes.len(),
            packed.len()
        );
        profiles.insert(profile.into(), json!({"graph":format!("{name}.bin"),"nodes":format!("{name}_nodes.bin"),"nodes_format":"f64","version":version,"surfaces":null,"surfaces_format":"u8"}));
    }
    let manifest = json!({"graphs":{"default":profiles},"coverage":{"name":"Dmitrov–Pravdinsky, Moscow region","bounds":[55.95,37.30,56.48,38.03]},"source":{"provider":"OpenStreetMap contributors","license":"ODbL-1.0","attribution_url":"https://www.openstreetmap.org/copyright","timestamp":source["osm3s"]["timestamp_osm_base"]},"routing_model":"Shortest distance with profile access and way direction; turn restrictions are not modelled."});
    fs::write(
        output.join("manifest.json"),
        serde_json::to_vec_pretty(&manifest)?,
    )?;
    Ok(())
}
