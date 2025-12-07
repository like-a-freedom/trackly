-- Allow storing multi-segment tracks to avoid teleport edges
ALTER TABLE tracks
    ALTER COLUMN geom TYPE geometry(MultiLineString, 4326)
    USING ST_Multi(geom);

COMMENT ON COLUMN tracks.geom IS 'Track geometry, MultiLineString, SRID=4326 (WGS84)';
