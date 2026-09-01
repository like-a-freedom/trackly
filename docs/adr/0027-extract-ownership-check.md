# Extract ownership-check helper to eliminate 4x duplication

The track update handler repeats the same 4-line pattern 4 times: fetch ownership, compare, map error. We extract `verify_track_owner(pool, track_id, auth_user, session_id) -> Result<(), AppError>` in `handlers/util.rs`.
