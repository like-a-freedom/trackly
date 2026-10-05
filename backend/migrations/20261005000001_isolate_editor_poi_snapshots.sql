-- Imported places keep global deduplication; editor snapshots use independent identities.
ALTER TABLE pois ADD COLUMN editor_scope_id UUID;
ALTER TABLE pois DROP COLUMN dedup_hash;
ALTER TABLE pois ADD COLUMN dedup_hash VARCHAR(64) GENERATED ALWAYS AS (
    MD5(
        LPAD(FLOOR((ST_Y(geom::geometry) * 100000)::BIGINT)::TEXT, 10, '0') ||
        LPAD(FLOOR((ST_X(geom::geometry) * 100000)::BIGINT)::TEXT, 10, '0') ||
        LOWER(TRIM(name)) || COALESCE(editor_scope_id::TEXT, '')
    )
) STORED;
CREATE UNIQUE INDEX pois_dedup_hash_idx ON pois(dedup_hash);
COMMENT ON COLUMN pois.editor_scope_id IS 'Independent editor snapshot identity; NULL retains imported/global place deduplication';
COMMENT ON COLUMN pois.dedup_hash IS 'Coordinates and normalized name, with independent identity for editor snapshots';
