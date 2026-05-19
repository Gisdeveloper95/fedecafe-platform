// =============================================================================
// Tipos compartidos del visor GIS
// =============================================================================

export type LatLon = { lat: number; lon: number };
export type Bbox = { west: number; south: number; east: number; north: number };

export type FeaturePoint = {
  id: string;
  lat: number;
  lon: number;
  label?: string;
  category?: string;
  /// Datos arbitrarios para mostrar en el panel lateral (key→string)
  data?: Record<string, string | number | null | undefined>;
};

export type FeatureLine = {
  id: string;
  /// Lista de [lat, lon] que define la línea
  vertices: Array<[number, number]>;
  label?: string;
  category?: string;
  data?: Record<string, string | number | null | undefined>;
};

export type LayerSpec =
  | {
      kind: "points";
      id: string;
      label: string;
      color: string;
      visible?: boolean;
      features: FeaturePoint[];
    }
  | {
      kind: "lines";
      id: string;
      label: string;
      color: string;
      width?: number;
      visible?: boolean;
      features: FeatureLine[];
    };

export type SelectedFeature = {
  layerId: string;
  feature: FeaturePoint | FeatureLine;
  kind: "point" | "line";
};

export type GisViewerHandlers = {
  /// Al hacer click en una feature existente
  onFeatureClick?: (sel: SelectedFeature) => void;
  /// Al hacer click en zona vacía del mapa (útil para "agregar punto aquí")
  onMapClick?: (latlon: LatLon) => void;
  /// Cuando el usuario terminó de arrastrar un marker (solo si editable)
  onPointMoved?: (
    layerId: string,
    featureId: string,
    newLatLon: LatLon,
  ) => void;
};
