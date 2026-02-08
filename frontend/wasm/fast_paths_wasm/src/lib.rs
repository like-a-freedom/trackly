use fast_paths::{create_calculator, FastGraph32};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct FastPathsRouter {
    fast_graph: fast_paths::FastGraph,
    calculator: fast_paths::PathCalculator,
}

#[wasm_bindgen]
impl FastPathsRouter {
    #[wasm_bindgen(constructor)]
    pub fn new(graph_bytes: &[u8]) -> Result<FastPathsRouter, JsValue> {
        let fg32: FastGraph32 = bincode::deserialize(graph_bytes)
            .map_err(|e| JsValue::from_str(&format!("failed to deserialize graph: {e}")))?;
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
    let fg32: FastGraph32 = bincode::deserialize(graph_bytes)
        .map_err(|e| JsValue::from_str(&format!("failed to deserialize graph: {e}")))?;
    let _fast_graph = fg32.convert_to_usize();
    Ok(true)
}
