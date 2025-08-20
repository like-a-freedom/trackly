// Hash utilities for trackly
// Fast hash calculation without full file parsing

use sha2::{Digest, Sha256};

/// Calculate file hash quickly without parsing GPX content
/// This is much faster than full GPX parsing for existence checks
pub fn calculate_file_hash(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_file_hash() {
        let test_data = b"test file content";
        let hash1 = calculate_file_hash(test_data);
        let hash2 = calculate_file_hash(test_data);

        // Same content should produce same hash
        assert_eq!(hash1, hash2);
        assert_eq!(hash1.len(), 64); // SHA256 produces 64 character hex string

        // Different content should produce different hash
        let different_data = b"different content";
        let hash3 = calculate_file_hash(different_data);
        assert_ne!(hash1, hash3);
    }

    #[test]
    fn test_empty_file_hash() {
        let empty_data = b"";
        let hash = calculate_file_hash(empty_data);
        assert_eq!(hash.len(), 64);
        // Empty file should produce consistent hash
        assert_eq!(
            hash,
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
    }
}
