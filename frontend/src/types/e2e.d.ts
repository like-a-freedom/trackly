// E2E test-only window helpers (present only in non-production builds during tests)
export {};

declare global {
  interface Window {
    __e2e?: {
      hoverAtIndex?: (index: number, opts?: { segmentIndex?: number }) => boolean | void;
      fixAtIndex?: (index: number) => void;
      hoverAtLatLng?: (lat: number, lng: number, opts?: { index?: number; segmentIndex?: number }) => boolean | void;
      clearMarker?: () => void;
      getLastMarkerLatLng?: () => { lat: number; lng: number } | null;
      getLastMarkerDetails?: () => any;
      isMapIdle?: () => boolean;
      getMapCenter?: () => { lat: number; lng: number } | null;
      lastHighlightedColor?: string | null;
      lastGapLineExists?: boolean | null;
      forceHighlightSegment?: (lat: number, lng: number, segmentIndex: number) => void;
      _lastMapInstance?: any;
    };
  }
}
