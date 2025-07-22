use backend::models::*;

use uuid::Uuid;

#[test]
fn test_track_upload_response_serde() {
    let resp = TrackUploadResponse {
        id: Uuid::new_v4(),
        url: "/tracks/1".to_string(),
    };
    let json = serde_json::to_string(&resp).unwrap();
    let de: TrackUploadResponse = serde_json::from_str(&json).unwrap();
    assert_eq!(resp.url, de.url);
}

#[test]
fn test_track_exist_response_serde() {
    let resp = TrackExistResponse {
        is_exist: true,
        id: Some(Uuid::new_v4()),
    };
    let json = serde_json::to_string(&resp).unwrap();
    let de: TrackExistResponse = serde_json::from_str(&json).unwrap();
    assert_eq!(resp.is_exist, de.is_exist);
}
