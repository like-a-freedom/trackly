// Trackly Domain Types
// Derived from CONTEXT.md glossary — single source of truth for domain shapes
// SOTA: Use `interface` for object shapes that may be extended; `type` for unions/aliases

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface Category {
  id: string;
  name: string;
}

export interface ElevationPoint {
  distance: number;
  elevation: number;
}

export interface Elevation {
  elevation_gain: number;
  elevation_down: number;
  elevation_profile: ElevationPoint[];
  elevation_dataset?: string;
}

export interface SlopeSegment {
  start: number;
  end: number;
  grade: number;
}

export interface Slope {
  slope_min: number;
  slope_max: number;
  slope_segments: SlopeSegment[];
}

export interface Poi {
    id: string;
    name: string;
    lat: number;
    lng: number;
    category?: string;
    description?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatar_url?: string;
}

export interface Session {
  id: string;
}

export type LatLngTuple = [lat: number, lng: number];
export type LngLatTuple = [lng: number, lat: number];

export interface Segment {
  points: LatLngTuple[];
  waypoints: number[];
  surfaceTypes?: string[];
  name: string | null;
  color: string;
}

export interface Track {
  id: string;
  name: string;
  description?: string;
  categories: Category[];
  geometry: GeoJSON.Geometry;
  length_km: number;
  elevation_up?: number;
  elevation_down?: number;
  avg_speed?: number;
  max_speed?: number;
  avg_hr?: number;
  duration_seconds?: number;
  owner_user_id?: string;
  owner_session_id?: string;
  created_at: string;
  updated_at: string;
}

export interface TrackDetail extends Track {
  elevation_profile: ElevationPoint[];
  slope_segments: SlopeSegment[];
}

export interface TrackSimplified {
  id: string;
  name: string;
  geometry: GeoJSON.Geometry;
  length_km: number;
}

// API response types
export interface OAuthConfig {
  client_id: string;
  redirect_uri: string;
}

export interface OAuthCallbackResult {
    accessToken: string;
    expiresAt: number | null;
    user: User | null;
}

// Feature flag types
export interface FeatureFlags {
  isAuthEnabled: boolean;
  isEditorEnabled: boolean;
}

// Editor state types
export type EditorMode = 'view' | 'edit' | 'fragment' | 'routing' | 'trace';
export type SnapMode = 'auto' | 'on' | 'off';

export interface FragmentSelection {
  segIndex: number | null;
  startIdx: number | null;
  endIdx: number | null;
}

export interface SegmentStats {
  index: number;
  name: string;
  displayName: string;
  pointCount: number;
  distanceKm: number;
  color: string;
}
