'use client';

import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';

if (typeof window !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl:
      'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    iconUrl:
      'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
    shadowUrl:
      'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  });
}

export type ZipEntry = { zipCode: string; ratio: number };
export type ZipCoverageInfo = {
  requestedZips: number;
  matchedZips: number;
  missingZips: string[];
};

type ZipMapProps = {
  stateCode: string;
  zips: ZipEntry[];
  highlightZip?: string | null;
  onZipHover?: (zip: string) => void;
  onZipHoverEnd?: (zip: string) => void;
  onCoverageChange?: (coverage: ZipCoverageInfo) => void;
};

function getColorForRatio(ratio: number): string {
  if (ratio < 0.9) return '#f59e0b';  // amber – below market
  if (ratio <= 1.1) return '#22c55e'; // green  – aligned
  return '#60a5fa';                   // blue   – above market
}

function normalizeZip(value: unknown): string | null {
  if (value == null) return null;
  const digits = String(value).match(/\d/g)?.join('') ?? '';
  if (!digits) return null;
  return digits.length >= 5 ? digits.slice(0, 5) : digits.padStart(5, '0');
}

function getZipFromFeature(feature: any): string | null {
  const p = feature.properties ?? {};
  const raw =
    p.ZCTA5CE10 ??
    p.ZIP_CODE ??
    p.ZIPCODE ??
    p.zip_code ??
    p.ZIP ??
    feature.id ??
    '';
  return normalizeZip(raw);
}

function FitBounds({ bounds }: { bounds: L.LatLngBounds }) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(bounds, { padding: [12, 12], maxZoom: 11 });
  }, [map, bounds]);
  return null;
}

export default function ZipMap({
  stateCode,
  zips,
  highlightZip,
  onZipHover,
  onZipHoverEnd,
  onCoverageChange,
}: ZipMapProps) {
  const [geojson, setGeojson]   = useState<any>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(false);
  const [bounds, setBounds]     = useState<L.LatLngBounds | null>(null);

  const normalizedEntries: ZipEntry[] = [];
  for (const entry of zips) {
    const zipCode = normalizeZip(entry.zipCode);
    if (!zipCode) continue;
    normalizedEntries.push({ zipCode, ratio: entry.ratio });
  }
  const requestedZipList = Array.from(new Set(normalizedEntries.map((z) => z.zipCode)));
  const requestedZipKey = requestedZipList.join(',');
  const highlightNormalized = normalizeZip(highlightZip);

  const geoJsonRef      = useRef<L.GeoJSON | null>(null);
  const layerByZip      = useRef<Map<string, L.Path>>(new Map());
  const prevHighlight   = useRef<string | null>(null);
  const zipRatioMap     = useRef(new Map(normalizedEntries.map((z) => [z.zipCode, z.ratio])));
  // Keep in sync synchronously so Leaflet event closures always see the current value
  const highlightZipRef = useRef(highlightNormalized ?? null);
  highlightZipRef.current = highlightNormalized ?? null;

  useEffect(() => {
    zipRatioMap.current = new Map(normalizedEntries.map((z) => [z.zipCode, z.ratio]));
  }, [requestedZipKey, zips]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    layerByZip.current.clear();
    prevHighlight.current = null;

    if (requestedZipList.length === 0) {
      setGeojson(null);
      setBounds(null);
      setError(true);
      setLoading(false);
      onCoverageChange?.({ requestedZips: 0, matchedZips: 0, missingZips: [] });
      return () => {
        cancelled = true;
      };
    }

    fetch(`/api/maps/zip-geojson?state=${stateCode}&zips=${requestedZipKey}`)
      .then((r) => {
        if (!r.ok) throw new Error('fetch failed');
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;

        const missing: string[] = Array.isArray(data?.missingZips)
          ? Array.from(
              new Set(
                data.missingZips
                  .map((z: unknown) => normalizeZip(z))
                  .filter((z: string | null): z is string => !!z),
              ),
            )
          : [];
        const missingSet = new Set(missing);
        const matchedCount = requestedZipList.filter((z) => !missingSet.has(z)).length;
        onCoverageChange?.({
          requestedZips: requestedZipList.length,
          matchedZips: matchedCount,
          missingZips: missing,
        });
        if (missing.length > 0) {
          console.debug('[ZipMap] Missing ZIP boundaries in source dataset:', missing);
        }

        setGeojson(data);
        if (data.features?.length > 0) {
          try {
            setBounds(L.geoJSON(data).getBounds());
          } catch {
            setError(true);
          }
        } else {
          setError(true);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setLoading(false);
          setError(true);
          onCoverageChange?.({
            requestedZips: requestedZipList.length,
            matchedZips: 0,
            missingZips: requestedZipList,
          });
        }
      });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateCode, requestedZipKey, onCoverageChange]);

  const featureStyle = (feature: any) => {
    const zip   = getZipFromFeature(feature);
    const ratio = zip ? zipRatioMap.current.get(zip) : undefined;
    return {
      fillColor:   ratio != null ? getColorForRatio(ratio) : '#d1d5db',
      weight:      1,
      opacity:     1,
      color:       '#ffffff',
      fillOpacity: 0.72,
    };
  };

  const onEachFeature = (feature: any, layer: L.Layer) => {
    const zip = getZipFromFeature(feature);
    if (!zip) return;
    if ((layer as any).setStyle) {
      layerByZip.current.set(zip, layer as unknown as L.Path);
    }
    const ratio = zipRatioMap.current.get(zip);
    if (ratio != null) {
      layer.bindTooltip(zip, { permanent: false, direction: 'top', className: 'leaflet-tooltip-sm' });
    }
    layer.on({
      mouseover: (e) => {
        e.target.setStyle({ weight: 2.5, fillOpacity: 1 });
        (e.target as L.Path).bringToFront?.();
        onZipHover?.(zip);
      },
      mouseout: (e) => {
        if (highlightZipRef.current === zip) return;
        geoJsonRef.current?.resetStyle(e.target);
        onZipHoverEnd?.(zip);
      },
    });
  };

  // Sync external highlight (list hover → map)
  useEffect(() => {
    const prev = prevHighlight.current;
    if (prev && prev !== highlightNormalized) {
      const prevLayer = layerByZip.current.get(prev);
      if (prevLayer) geoJsonRef.current?.resetStyle(prevLayer as any);
    }
    if (highlightNormalized) {
      const layer = layerByZip.current.get(highlightNormalized);
      if (layer) {
        layer.setStyle({ weight: 3, color: '#ffffff', fillOpacity: 1 });
        (layer as L.Path).bringToFront?.();
      }
      prevHighlight.current = highlightNormalized;
    } else {
      prevHighlight.current = null;
    }
  }, [highlightNormalized]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <span className="text-xs text-[var(--text-tertiary)]">Loading map…</span>
      </div>
    );
  }

  if (error || !geojson || !bounds) {
    return (
      <div className="h-full flex items-center justify-center">
        <span className="text-xs text-[var(--text-tertiary)] opacity-60">Map unavailable</span>
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <MapContainer
        bounds={bounds}
        zoomControl={false}
        scrollWheelZoom={true}
        attributionControl={false}
        style={{ height: '100%', width: '100%', zIndex: 0, background: 'transparent' }}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://carto.com">CARTO</a>'
        />
        <GeoJSON
          key={requestedZipKey}
          data={geojson}
          style={featureStyle}
          onEachFeature={onEachFeature}
          ref={geoJsonRef}
        />
        <FitBounds bounds={bounds} />
      </MapContainer>
    </div>
  );
}
