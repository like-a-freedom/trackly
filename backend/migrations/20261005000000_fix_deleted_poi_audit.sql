-- Deleted objects cannot remain foreign-key targets. Keep their identity in the snapshot.
CREATE OR REPLACE FUNCTION poi_audit_trigger()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO poi_audit_log (poi_id, action, changed_fields)
        VALUES (NEW.id, 'created', row_to_json(NEW)::jsonb);
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO poi_audit_log (poi_id, action, changed_fields)
        VALUES (NEW.id, 'updated', jsonb_build_object('old', row_to_json(OLD)::jsonb, 'new', row_to_json(NEW)::jsonb));
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO poi_audit_log (poi_id, action, changed_fields)
        VALUES (NULL, 'deleted', row_to_json(OLD)::jsonb);
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
