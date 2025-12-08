-- Fix POI distance calculation for MultiLineString tracks
-- Ensures track geometry is reduced to a linestring before locating POI projection

CREATE OR REPLACE FUNCTION calculate_poi_distance_on_track(
    p_track_id UUID,
    p_poi_id INTEGER
) RETURNS REAL AS $$
DECLARE
    line_geom geometry(LineString, 4326);
    line_fraction DOUBLE PRECISION;
    distance_m REAL;
BEGIN
    -- Normalize track geometry to a single LineString:
    -- 1) make valid
    -- 2) extract linear components
    -- 3) merge connected lines
    -- 4) pick the longest resulting linestring
    SELECT geom INTO line_geom
    FROM (
        SELECT CASE
                 WHEN GeometryType(merged_geom) = 'LINESTRING' THEN merged_geom
                 ELSE (SELECT geom
                       FROM ST_Dump(merged_geom)
                       ORDER BY ST_Length(geom) DESC
                       LIMIT 1)
               END AS geom
        FROM (
            SELECT ST_LineMerge(
                       ST_CollectionExtract(
                           ST_MakeValid(t.geom),
                           2
                       )
                   ) AS merged_geom
            FROM tracks t
            WHERE t.id = p_track_id
        ) s
    ) line_choice;

    IF line_geom IS NULL THEN
        RAISE EXCEPTION 'Track % geometry is not a line and cannot be merged for POI distance', p_track_id;
    END IF;

    SELECT ST_LineLocatePoint(
               line_geom,
               ST_SetSRID(p.geom::geometry, 4326)
           )
    INTO line_fraction
    FROM pois p
    WHERE p.id = p_poi_id;

    IF line_fraction IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT ST_Length(
               ST_LineSubstring(
                   line_geom,
                   0,
                   line_fraction
               )::geography
           )
    INTO distance_m;

    RETURN distance_m;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_poi_distance_on_track IS 'Calculate distance from track start to POI along track geometry (handles MultiLineString)';
