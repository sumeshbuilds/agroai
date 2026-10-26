"use client";

import "leaflet/dist/leaflet.css";

import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { Map as LeafletMap } from "leaflet";
import Link from "next/link";
import { CircleMarker, MapContainer, Polygon, TileLayer, Tooltip } from "react-leaflet";
import {
  Crosshair,
  ExternalLink,
  Layers,
  Map as MapIcon,
  RefreshCw,
  Ruler,
  Video,
} from "lucide-react";

import type { CameraSessionDTO } from "@/lib/camera";
import { cn } from "@/lib/cn";
import { formatLandArea } from "@/lib/format";
import { ESRI_ATTRIBUTION, ESRI_WORLD_IMAGERY_URL, FARM_ZOOM } from "@/lib/map";
import type { FarmDTO, GeoPoint } from "@/lib/types";

interface FarmMapProps {
  farms: FarmDTO[];
  selectedFarm?: FarmDTO | null;
  cameras?: CameraSessionDTO[];
  onSelectFarm?: (farmId: number) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  className?: string;
}

/**
 * Map control rendered in the overlay (outside `<MapContainer>`), so it talks
 * to the map through a ref rather than Leaflet's React context.
 */
function LocateMe({ mapRef }: { mapRef: RefObject<LeafletMap | null> }) {
  const [error, setError] = useState<string | null>(null);

  const handleLocate = () => {
    if (!("geolocation" in navigator)) {
      setError("Your browser does not support location access.");
      return;
    }

    setError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const map = mapRef.current;
        if (!map) return;
        map.flyTo(
          [position.coords.latitude, position.coords.longitude],
          Math.max(map.getZoom(), 16),
          { duration: 1.2 },
        );
      },
      () =>
        setError(
          "Could not read your location. Please allow location access in your browser.",
        ),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleLocate}
        className="flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1.5 text-xs font-bold text-slate-900 shadow-md backdrop-blur transition-colors hover:bg-white sm:px-3"
        title="Move the map to your current location"
        aria-label="Move the map to my current location"
      >
        <Crosshair className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Locate me</span>
      </button>
      {error ? (
        <span className="max-w-48 rounded-lg bg-danger-100 px-2 py-1 text-center text-[10px] font-semibold text-danger-700">
          {error}
        </span>
      ) : null}
    </div>
  );
}

function EmptyFarmMap() {
  return (
    <div className="card flex h-full min-h-[320px] flex-col items-center justify-center gap-3 p-6 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
        <MapIcon className="h-6 w-6" />
      </span>
      <p className="text-sm font-bold">No farm mapped yet</p>
      <p className="muted max-w-xs text-xs">
        Draw your field boundary on the satellite map — its centre powers your
        weather and alerts.
      </p>
      <Link href="/map" className="btn btn-primary">
        <MapIcon className="h-4 w-4" />
        Draw your farm
      </Link>
    </div>
  );
}

/**
 * Read-only dashboard map for the sketched layout: a tall satellite panel on
 * the left showing the selected farmland, its centre marker and any live
 * phone-camera positions. Boundary drawing stays on /map.
 */
export function FarmMap({
  farms,
  selectedFarm = null,
  cameras = [],
  onSelectFarm,
  onRefresh,
  refreshing = false,
  className,
}: FarmMapProps) {
  const mapRef = useRef<LeafletMap | null>(null);

  const lat = selectedFarm?.centroidLat;
  const lng = selectedFarm?.centroidLng;

  // Fly to the newly selected farm (leaflet ignores `center` prop updates).
  useEffect(() => {
    if (lat === undefined || lng === undefined) return;
    mapRef.current?.flyTo([lat, lng], FARM_ZOOM, { duration: 0.8 });
  }, [lat, lng]);

  if (!selectedFarm) {
    return <EmptyFarmMap />;
  }

  const center: GeoPoint = [selectedFarm.centroidLat, selectedFarm.centroidLng];

  return (
    <div
      className={cn(
        "relative h-full overflow-hidden rounded-2xl border border-[var(--border)]",
        className,
      )}
    >
      <MapContainer
        ref={mapRef}
        center={center}
        zoom={FARM_ZOOM}
        scrollWheelZoom
        zoomControl={false}
        className="h-full w-full"
      >
        <TileLayer
          url={ESRI_WORLD_IMAGERY_URL}
          attribution={ESRI_ATTRIBUTION}
          maxZoom={19}
        />

        <Polygon
          positions={selectedFarm.points}
          pathOptions={{
            color: "#34d399",
            weight: 3,
            fillColor: "#34d399",
            fillOpacity: 0.12,
          }}
        />

        {cameras
          .filter((camera) => camera.lat !== null && camera.lng !== null)
          .map((camera) => (
            <CircleMarker
              key={`camera-${camera.id}`}
              center={[camera.lat!, camera.lng!]}
              radius={camera.isLive ? 10 : 7}
              pathOptions={{
                color: "#ffffff",
                weight: 2,
                fillColor: camera.isLive ? "#0ea5e9" : "#64748b",
                fillOpacity: 0.95,
              }}
            >
              <Tooltip>
                📷 {camera.name} · {camera.isLive ? "LIVE" : camera.status}
              </Tooltip>
            </CircleMarker>
          ))}

        <CircleMarker
          center={center}
          radius={6}
          pathOptions={{
            color: "#ffffff",
            weight: 2,
            fillColor: "#ef4444",
            fillOpacity: 1,
          }}
        >
          <Tooltip permanent direction="top" offset={[0, -6]}>
            Farm centre
          </Tooltip>
        </CircleMarker>
      </MapContainer>

      {farms.length > 1 ? (
        <select
          aria-label="Active farm"
          className="select absolute left-3 top-3 z-[500] w-56! min-h-9! rounded-full bg-white/95 py-1.5 text-xs font-bold text-slate-900 shadow-md backdrop-blur"
          value={selectedFarm.id}
          onChange={(event) => onSelectFarm?.(Number(event.target.value))}
        >
          {farms.map((farm) => (
            <option key={farm.id} value={farm.id}>
              {farm.name}
            </option>
          ))}
        </select>
      ) : null}

      <div className="absolute bottom-3 left-3 z-[500] flex flex-wrap items-center gap-2">
        <span className="chip bg-white/95 text-slate-900 backdrop-blur">
          <Ruler className="h-3 w-3" />
          {formatLandArea(selectedFarm.areaAcres)}
        </span>
        <span className="chip bg-white/95 text-slate-900 backdrop-blur">
          <Layers className="h-3 w-3" />
          Esri satellite
        </span>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-bold text-slate-900 shadow-md backdrop-blur transition-colors hover:bg-white disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="absolute right-3 top-3 z-[500] flex flex-col items-end gap-2">
        <Link
          href="/map"
          aria-label="Draw or edit the farm boundary"
          className="flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1.5 text-xs font-bold text-slate-900 shadow-md backdrop-blur transition-colors hover:bg-white sm:px-3"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Draw / edit boundary</span>
        </Link>
        <Link
          href="/watch"
          aria-label="Open live camera watch"
          className="flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1.5 text-xs font-bold text-slate-900 shadow-md backdrop-blur transition-colors hover:bg-white sm:px-3"
        >
          <Video className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Live watch</span>
        </Link>
        <LocateMe mapRef={mapRef} />
      </div>
    </div>
  );
}
