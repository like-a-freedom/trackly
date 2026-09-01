use once_cell::sync::Lazy;

use crate::error::AppError;

pub static MAX_FILE_SIZE: Lazy<usize> = Lazy::new(|| {
    std::env::var("MAX_FILE_SIZE")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(50 * 1024 * 1024)
});

pub const MAX_FIELD_SIZE: usize = 10 * 1024;
pub const MAX_CATEGORIES: usize = 50;
pub const MAX_CATEGORY_LENGTH: usize = 100;
pub const MAX_NAME_LENGTH: usize = 256;
pub const MAX_DESCRIPTION_LENGTH: usize = 50000;
pub const ALLOWED_EXTENSIONS: &[&str] = &["gpx", "kml"];

pub fn validate_file_size(size: usize) -> Result<(), AppError> {
    if size > *MAX_FILE_SIZE {
        return Err(AppError::Validation(format!(
            "file size {size} exceeds maximum {}",
            *MAX_FILE_SIZE
        )));
    }
    Ok(())
}

pub fn validate_text_field(text: &str, max_len: usize, field_name: &str) -> Result<(), AppError> {
    if text.len() > max_len {
        return Err(AppError::Validation(format!(
            "{field_name} length {} exceeds maximum {max_len}",
            text.len()
        )));
    }
    Ok(())
}

/// Validate shared track fields: name, description, and categories.
///
/// This is the common validation logic shared between file upload and editor creation paths.
pub fn validate_track_fields(
    name: Option<&str>,
    description: Option<&str>,
    categories: &[String],
) -> Result<(), AppError> {
    if let Some(name) = name {
        validate_text_field(name, MAX_NAME_LENGTH, "name")?;
    }
    if let Some(description) = description {
        validate_text_field(description, MAX_DESCRIPTION_LENGTH, "description")?;
    }
    if categories.len() > MAX_CATEGORIES {
        return Err(AppError::Validation(format!(
            "too many categories: {} (max {MAX_CATEGORIES})",
            categories.len()
        )));
    }
    for category in categories {
        validate_text_field(category, MAX_CATEGORY_LENGTH, "category")?;
    }
    Ok(())
}

pub fn validate_file_extension(filename: &str) -> Result<String, AppError> {
    let ext = filename.split('.').next_back().unwrap_or("").to_lowercase();
    if !ALLOWED_EXTENSIONS.contains(&ext.as_str()) {
        return Err(AppError::Validation(format!(
            "file extension '{ext}' not allowed"
        )));
    }
    Ok(ext)
}

pub fn sanitize_input(input: &str) -> String {
    input
        .trim()
        .chars()
        .filter(|c| c.is_alphanumeric() || " .,;:!?-_()[]{}".contains(*c))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_file_size_within_limit() {
        assert!(validate_file_size(1024).is_ok());
    }

    #[test]
    fn validate_file_size_exceeds_limit() {
        let err = validate_file_size(*MAX_FILE_SIZE + 1).unwrap_err();
        assert!(matches!(err, AppError::Validation(_)));
    }

    #[test]
    fn validate_text_field_within_limit() {
        assert!(validate_text_field("hello", 10, "test").is_ok());
    }

    #[test]
    fn validate_text_field_exceeds_limit() {
        let err = validate_text_field("a".repeat(11).as_str(), 10, "test").unwrap_err();
        assert!(matches!(err, AppError::Validation(_)));
    }

    #[test]
    fn validate_file_extension_allowed() {
        assert_eq!(validate_file_extension("track.gpx").unwrap(), "gpx");
        assert_eq!(validate_file_extension("track.KML").unwrap(), "kml");
    }

    #[test]
    fn validate_file_extension_not_allowed() {
        let err = validate_file_extension("track.txt").unwrap_err();
        assert!(matches!(err, AppError::Validation(_)));
    }
}
