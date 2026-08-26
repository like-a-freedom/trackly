use fast_paths::{create_calculator, FastGraph32};
use wasm_bindgen::prelude::*;

fn decode_fast_graph(graph_bytes: &[u8]) -> Result<FastGraph32, JsValue> {
    bincode::serde::decode_from_slice(graph_bytes, bincode::config::standard())
        .map(|(graph, _)| graph)
        .map_err(|e| JsValue::from_str(&format!("failed to deserialize graph: {e}")))
}

#[wasm_bindgen]
pub struct FastPathsRouter {
    fast_graph: fast_paths::FastGraph,
    calculator: fast_paths::PathCalculator,
}

#[wasm_bindgen]
impl FastPathsRouter {
    #[wasm_bindgen(constructor)]
    pub fn new(graph_bytes: &[u8]) -> Result<FastPathsRouter, JsValue> {
        let fg32 = decode_fast_graph(graph_bytes)?;
        let fast_graph = fg32.convert_to_usize();
        let calculator = create_calculator(&fast_graph);
        Ok(FastPathsRouter {
            fast_graph,
            calculator,
        })
    }

    pub fn calc_path(&mut self, source: u32, target: u32) -> Vec<u32> {
        let source = source as usize;
        let target = target as usize;
        match self.calculator.calc_path(&self.fast_graph, source, target) {
            Some(path) => path.get_nodes().iter().map(|n| *n as u32).collect(),
            None => Vec::new(),
        }
    }

    pub fn calc_path_weight(&mut self, source: u32, target: u32) -> i64 {
        let source = source as usize;
        let target = target as usize;
        match self.calculator.calc_path(&self.fast_graph, source, target) {
            Some(path) => path.get_weight() as i64,
            None => -1,
        }
    }
}

#[wasm_bindgen]
pub fn validate_graph_bytes(graph_bytes: &[u8]) -> Result<bool, JsValue> {
    let fg32 = decode_fast_graph(graph_bytes)?;
    let _fast_graph = fg32.convert_to_usize();
    Ok(true)
}
