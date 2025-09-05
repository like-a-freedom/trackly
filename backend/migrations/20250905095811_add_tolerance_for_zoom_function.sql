-- Add PostgreSQL function for zoom-based tolerance calculation
-- This mirrors the Rust zoom_adaptation::tolerance_for_zoom logic for direct SQL usage

CREATE OR REPLACE FUNCTION tolerance_for_zoom(zoom_level FLOAT)
RETURNS FLOAT AS $$
BEGIN
  RETURN CASE 
    WHEN zoom_level <= 8 THEN 0.001   -- ~100m tolerance for world/country view
    WHEN zoom_level <= 10 THEN 0.0005 -- ~50m for regional view  
    WHEN zoom_level <= 12 THEN 0.00025 -- ~25m for city view
    WHEN zoom_level <= 14 THEN 0.0001 -- ~10m for neighborhood view
    WHEN zoom_level <= 16 THEN 0.00005 -- ~5m for street view
    ELSE 0.00002                      -- ~2m for very detailed view
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Create an index-friendly version that works with ST_Simplify
-- ST_Simplify expects tolerance in coordinate units (degrees), not meters
-- These values are approximate conversions for latitude ~55° (northern regions)
CREATE OR REPLACE FUNCTION tolerance_for_zoom_degrees(zoom_level FLOAT)
RETURNS FLOAT AS $$
BEGIN
  RETURN CASE 
    WHEN zoom_level <= 8 THEN 0.001   -- ~100m at lat 55°
    WHEN zoom_level <= 10 THEN 0.0005 -- ~50m
    WHEN zoom_level <= 12 THEN 0.00025 -- ~25m  
    WHEN zoom_level <= 14 THEN 0.0001 -- ~10m
    WHEN zoom_level <= 16 THEN 0.00005 -- ~5m
    ELSE 0.00002                      -- ~2m
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Test the functions work correctly
DO $$
BEGIN
  -- Test that functions return expected values
  ASSERT tolerance_for_zoom(5.0) = 0.001, 'tolerance_for_zoom failed for zoom 5';
  ASSERT tolerance_for_zoom(12.0) = 0.00025, 'tolerance_for_zoom failed for zoom 12';
  ASSERT tolerance_for_zoom(18.0) = 0.00002, 'tolerance_for_zoom failed for zoom 18';
  
  RAISE NOTICE 'tolerance_for_zoom functions created successfully';
END $$;
