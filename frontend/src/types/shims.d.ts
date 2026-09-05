// Type declarations for modules without types

declare module 'leaflet-polylinedecorator' {
    import type * as L from 'leaflet';

    interface PatternOptions {
        offset?: number | string;
        repeat?: number | string;
        symbol?: L.Symbol;
    }

    interface PolylineDecoratorOptions {
        patterns: PatternOptions[];
    }

    class PolylineDecorator extends L.Layer {
        constructor(polyline: L.Polyline, options?: PolylineDecoratorOptions);
        setPaths(polyline: L.Polyline): this;
        setPatterns(patterns: PatternOptions[]): this;
    }

    function polylineDecorator(polyline: L.Polyline, options?: PolylineDecoratorOptions): PolylineDecorator;

    export { PolylineDecorator, polylineDecorator };
    export default PolylineDecorator;
}

// Extend Leaflet types for markerCluster and other plugins
import 'leaflet';

declare module 'leaflet' {
    interface LayerGroup<P = any> {
        addTo(map: Map): this;
        removeFrom(map: Map): this;
    }

    function polylineDecorator(polyline: Polyline, options?: any): any;

    namespace Symbol {
        interface ArrowHeadOptions {
            pixelSize?: number;
            polygon?: boolean;
            pathOptions?: PathOptions;
        }
        function arrowHead(options?: ArrowHeadOptions): Marker;
    }
}
