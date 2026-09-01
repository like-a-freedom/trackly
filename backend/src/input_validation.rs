use axum::http::StatusCode;
use once_cell::sync::Lazy;
use tracing::error;

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

pub fn validate_file_size(size: usize) -> Result<(), StatusCode> {
    if size > *MAX_FILE_SIZE {
        error!("File size {} exceeds maximum {}", size, *MAX_FILE_SIZE);
        return Err(StatusCode::PAYLOAD_TOO_LARGE);
    }
    Ok(())
}

pub fn validate_text_field(text: &str, max_len: usize, field_name: &str) -> Result<(), StatusCode> {
    if text.len() > max_len {
        error!(
            "{} length {} exceeds maximum {}",
            field_name,
            text.len(),
            max_len
        );
        return Err(StatusCode::BAD_REQUEST);
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
) -> Result<(), StatusCode> {
    if let Some(name) = name {
        validate_text_field(name, MAX_NAME_LENGTH, "name")?;
    }
    if let Some(description) = description {
        validate_text_field(description, MAX_DESCRIPTION_LENGTH, "description")?;
    }
    if categories.len() > MAX_CATEGORIES {
        error!(
            categories = categories.len(),
            max = MAX_CATEGORIES,
            "too many categories"
        );
        return Err(StatusCode::BAD_REQUEST);
    }
    for category in categories {
        validate_text_field(category, MAX_CATEGORY_LENGTH, "category")?;
    }
    Ok(())
}

pub fn validate_file_extension(filename: &str) -> Result<String, StatusCode> {
    let ext = filename.split('.').next_back().unwrap_or("").to_lowercase();
    if !ALLOWED_EXTENSIONS.contains(&ext.as_str()) {
        error!("File extension '{}' not allowed", ext);
        return Err(StatusCode::BAD_REQUEST);
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
}
