'use client';

import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { StateCode } from '@/lib/states';
import { buildCountySlug } from '@/lib/location-slugs';

// Fix for default marker icons in Next.js
if (typeof window !== 'undefined') {
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  });
}

type CountyData = {
  countyName: string;
  stateCode: string;
  fips: string;
  medianScore: number | null;
  avgScore: number | null;
};

type ChoroplethMapProps = {
  stateCode: StateCode;
  year?: number;
  highlightFips?: string;
  onCountyHover?: (fips: string) => void;
  onCountyHoverEnd?: (fips: string) => void;
  onCountyClick?: (countyName: string, stateCode: string) => void;
};

function MapBounds({ bounds }: { bounds: L.LatLngBounds }) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(bounds, { padding: [20, 20] });
  }, [map, bounds]);
  return null;
}

export default function ChoroplethMap({ stateCode, year, highlightFips, onCountyHover, onCountyHoverEnd, onCountyClick }: ChoroplethMapProps) {
  const [geojson, setGeojson] = useState<any>(null);
  const [countyData, setCountyData] = useState<Map<string, CountyData>>(new Map());
  const [loading, setLoading] = useState(true);
  const [bounds, setBounds] = useState<L.LatLngBounds | null>(null);
  const geoJsonLayerRef = useRef<L.GeoJSON | null>(null);
  const layerByFipsRef = useRef<Map<string, L.Path>>(new Map());
  const prevHighlightedFipsRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch GeoJSON and investment score data in parallel
        const [geojsonRes, scoreRes] = await Promise.all([
          fetch(`/api/maps/county-geojson?state=${stateCode}`),
          fetch(`/api/maps/county-scores?state=${stateCode}${year ? `&year=${year}` : ''}`),
        ]);

        if (cancelled) return;

        const geojsonData = await geojsonRes.json();
        const scoreData = await scoreRes.json();

        if (cancelled) return;

        // Create a map of FIPS -> CountyData
        const dataMap = new Map<string, CountyData>();
        (scoreData.counties || []).forEach((county: any) => {
          dataMap.set(county.fips, {
            countyName: county.countyName,
            stateCode: county.stateCode,
            fips: county.fips,
            medianScore: county.medianScore,
            avgScore: county.avgScore,
          });
        });

        setGeojson(geojsonData);
        setCountyData(dataMap);

        // Calculate bounds
        if (geojsonData.features && geojsonData.features.length > 0) {
          const geoJsonLayer = L.geoJSON(geojsonData);
          const calculatedBounds = geoJsonLayer.getBounds();
          setBounds(calculatedBounds);
        }

        setLoading(false);
      } catch (error) {
        console.error('Error loading map data:', error);
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [stateCode, year]);

  // Standardized colors that work in both light and dark mode
  const getColorForScore = (score: number | null): string => {
    if (score === null || score === undefined || score < 95) {
      return '#fca5a5'; // Light red: <95 or no data (standardized)
    }
    if (score >= 130) {
      return '#60a5fa'; // Light vibrant blue: >= 130 (standardized)
    }
    return '#44e37e'; // Light green: 100-129 (standardized)
  };

  const getColor = (fips: string): string => {
    const county = countyData.get(fips);
    if (!county) return '#e5e5e5'; // Gray for no data (standardized)
    const score = county.medianScore ?? county.avgScore ?? null;
    return getColorForScore(score);
  };

  const style = (feature: any) => {
    const fips = feature.id || feature.properties?.FIPS || feature.properties?.fips || '';
    const fipsStr = String(fips).padStart(5, '0');
    
    return {
      fillColor: getColor(fipsStr),
      weight: 1,
      opacity: 1,
      color: '#ffffff', // White stroke for all regions (standardized)
      dashArray: '',
      fillOpacity: 1,
    };
  };

  const onEachFeature = (feature: any, layer: L.Layer) => {
    const fips = feature.id || feature.properties?.FIPS || feature.properties?.fips || '';
    const fipsStr = String(fips).padStart(5, '0');
    const county = countyData.get(fipsStr);
    if ((layer as any).setStyle) {
      layerByFipsRef.current.set(fipsStr, layer as unknown as L.Path);
    }

    if (county) {
      const countyLabel = county.countyName.includes('County')
        ? county.countyName
        : `${county.countyName} County`;
      const score = county.medianScore ?? county.avgScore ?? null;
      const scoreText = score !== null ? `Score: ${Math.round(score)}` : 'No data';
      
      layer.bindTooltip(`${countyLabel}: ${scoreText}`, {
        permanent: false,
        direction: 'top',
      });

      layer.on({
        click: () => {
          if (onCountyClick) {
            onCountyClick(county.countyName, county.stateCode);
          }
        },
        mouseover: (e) => {
          const layer = e.target;
          layer.setStyle({
            weight: 2,
            opacity: 1,
            fillOpacity: 0.9,
          });
          layer.bringToFront?.();
          onCountyHover?.(fipsStr);
        },
        mouseout: (e) => {
          // Don't reset if this county is the externally highlighted one
          if (highlightFips && fipsStr === highlightFips) return;
          geoJsonLayerRef.current?.resetStyle(e.target);
          onCountyHoverEnd?.(fipsStr);
        },
      });
    }
  };

  // External highlight from list hover
  useEffect(() => {
    const prev = prevHighlightedFipsRef.current;
    if (prev && prev !== highlightFips) {
      const prevLayer = layerByFipsRef.current.get(prev);
      if (prevLayer) geoJsonLayerRef.current?.resetStyle(prevLayer as any);
    }

    if (highlightFips) {
      const layer = layerByFipsRef.current.get(highlightFips);
      if (layer) {
        layer.setStyle({
          weight: 3,
          opacity: 1,
          color: '#ffffff', // White hover stroke (standardized)
          fillOpacity: 0.95,
        });
        layer.bringToFront?.();
      }
      prevHighlightedFipsRef.current = highlightFips;
    } else {
      prevHighlightedFipsRef.current = null;
    }
  }, [highlightFips]);

  if (loading || !geojson) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-[var(--map-bg)] rounded-lg">
        <div className="text-xs text-[var(--text-tertiary)]">Loading map...</div>
      </div>
    );
  }

  if (!bounds) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-[var(--map-bg)] rounded-lg">
        <div className="text-xs text-[var(--text-tertiary)]">No map data available</div>
      </div>
    );
  }

  return (
    <div className="h-full w-full relative">
      <MapContainer
        bounds={bounds}
        zoomControl={true}
        scrollWheelZoom={false}
        style={{ height: '100%', width: '100%', zIndex: 0 }}
        className="rounded-lg"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <GeoJSON
          data={geojson}
          style={style}
          onEachFeature={onEachFeature}
          ref={geoJsonLayerRef}
        />
        <MapBounds bounds={bounds} />
      </MapContainer>
    </div>
  );
}

