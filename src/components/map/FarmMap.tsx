"use client";

import "leaflet/dist/leaflet.css";

import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { Map as LeafletMap } from "leaflet";
import Link from "next/link";
import { CircleMarker, Polygon, ScaleControl, TileLayer, Tooltip, useMap } from "react-leaflet";
import {
  Crosshair,
  ExternalLink,
  Layers,
  Map as MapIcon,
  Minus,
  Plus,
  Satellite,
  Video,
} from "lucide-react";

import { LeafletMapContainer } from "@/components/map/LeafletMapContainer";
import type { CameraSessionDTO } from "@/lib/camera";
import { cn } from "@/lib/cn";
import { formatLandArea } from "@/lib/format";
import { ESRI_ATTRIBUTION, ESRI_WORLD_IMAGERY_URL, FARM_ZOOM } from "@/lib/map";
import { useI18n } from "@/lib/i18n";
import type { FarmDTO, GeoPoint } from "@/lib/types";

interface FarmMapProps {
  farms: FarmDTO[];
  selectedFarm?: FarmDTO | null;
  cameras?: CameraSessionDTO[];
  onSelectFarm?: (farmId: number) => void;
  detailsOpen?: boolean;
  className?: string;
}

/** Field index label rendered inside the polygon ("Area 1"). */
function FarmLabel({ farm }: { farm: FarmDTO }) {
  const { t } = useI18n();
  return (
    <span className="block text-center leading-tight text-white [text-shadow:0_1px_8px_rgba(20,20,10,0.65)]">
      <span className="block text-[0.78rem] font-semibold">
        {farm.name}
      </span>
      <span className="mt-1 block text-[0.6875rem] font-medium opacity-90">
        {t(formatLandArea(farm.areaAcres))}
      </span>
    </span>
  );
}

function FarmMapFocus({ center: [lat, lng] }: { center: GeoPoint }) {
  const map = useMap();

  // Use the current map's context: it may be recreated after navigation.
  useEffect(() => {
    if (map.getCenter().equals([lat, lng]) && map.getZoom() === FARM_ZOOM) return;
    map.setView([lat, lng], FARM_ZOOM, { animate: false });
  }, [map, lat, lng]);

  return null;
}

/**
 * Map control rendered outside `<MapContainer>`, talking to the map through a
 * ref (Leaflet's React context doesn't reach overlay slots).
 */
function MapControls({
  mapRef,
}: {
  mapRef: RefObject<LeafletMap | null>;
}) {
  const [locateError, setLocateError] = useState<string | null>(null);
  const { t } = useI18n();

  const zoom = (delta: number) => mapRef.current?.setZoom(
    mapRef.current.getZoom() + delta,
    { animate: !window.matchMedia("(prefers-reduced-motion: reduce)").matches },
  );

  const handleLocate = () => {
    if (!("geolocation" in navigator)) {
      setLocateError("Location not supported");
      return;
    }
    setLocateError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const map = mapRef.current;
        if (!map) return;
        map.flyTo(
          [position.coords.latitude, position.coords.longitude],
          Math.max(map.getZoom(), 16),
          {
            animate: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
            duration: 0.25,
          },
        );
      },
      () => setLocateError("Location permission needed"),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  const controlClass =
    "icon-btn border-transparent bg-transparent";

  return (
    <div className="absolute left-3 top-3 z-[500] flex flex-col items-start gap-2 sm:left-4 sm:top-4">
      {locateError ? (
        <span role="status" className="map-chip map-hint max-w-[10rem] rounded-lg text-xs text-danger-700">
          {t(locateError)}
        </span>
      ) : null}
      <div className="map-panel flex flex-col rounded-xl p-1">
        <button
          type="button"
          onClick={() => zoom(1)}
          aria-label={t("Zoom in")}
          className={controlClass}
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => zoom(-1)}
          aria-label={t("Zoom out")}
          className={cn(controlClass, "my-0.5 rounded-lg")}
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handleLocate}
          aria-label={t("Move map to my location")}
          className={controlClass}
        >
          <Crosshair className="h-4 w-4" />
        </button>
      </div>
      <a
        href="/watch"
        className="map-panel icon-btn border-transparent"
        aria-label={t("Open live camera watch")}
        title={t("Live camera watch")}
      >
        <Video className="h-4 w-4" />
      </a>
    </div>
  );
}

function EmptyFarmMap() {
  const { t } = useI18n();
  return (
    <div className="card flex h-full min-h-[320px] flex-col items-center justify-center gap-3 p-6 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--card-muted)] text-[var(--color-ink)]">
        <MapIcon className="h-6 w-6" />
      </span>
      <p className="text-sm font-semibold">{t("No fields mapped yet")}</p>
      <p className="muted max-w-xs text-xs leading-relaxed">
        {t(
          "Draw your field boundary on the satellite map — its centre powers your weather and alerts.",
        )}
      </p>
      <Link href="/map" className="btn btn-primary">
        <MapIcon className="h-4 w-4" />
        {t("Map your first field")}
      </Link>
    </div>
  );
}

/**
 * Read-only operations map: satellite basemap, the operator's field polygons,
 * live phone-camera positions and floating map controls. Boundary drawing
 * stays on /map.
 */
export function FarmMap({
  farms,
  selectedFarm = null,
  cameras = [],
  onSelectFarm,
  detailsOpen = false,
  className,
}: FarmMapProps) {
  const mapRef = useRef<LeafletMap | null>(null);
  const { t } = useI18n();

  if (!selectedFarm) {
    return <EmptyFarmMap />;
  }

  const center: GeoPoint = [selectedFarm.centroidLat, selectedFarm.centroidLng];

  return (
    <div
      className={cn(
        "relative h-full overflow-hidden rounded-2xl border border-[var(--color-line)]",
        className,
      )}
    >
      <LeafletMapContainer
        ref={mapRef}
        center={center}
        zoom={FARM_ZOOM}
        scrollWheelZoom
        zoomControl={false}
        className="h-full w-full"
      >
        <FarmMapFocus center={center} />
        <ScaleControl imperial={false} position="bottomleft" />
        <TileLayer
          url={ESRI_WORLD_IMAGERY_URL}
          attribution={ESRI_ATTRIBUTION}
          maxZoom={19}
        />

        {farms.map((farm, index) => {
          const selected = farm.id === selectedFarm.id;
          return (
            <Polygon
              key={farm.id}
              positions={farm.points}
              eventHandlers={{
                click: () => onSelectFarm?.(farm.id),
              }}
              pathOptions={{
                color: selected ? "#ffffff" : "#e2ae8f",
                weight: selected ? 3 : 2,
                fillColor: selected ? "#638650" : "#b6532e",
                fillOpacity: selected ? 0.32 : 0.16,
              }}
            >
              <Tooltip
                permanent={selected}
                direction="center"
                offset={[0, 0]}
                className="field-label"
              >
                {selected ? (
                  <FarmLabel farm={farm} />
                ) : (
                  <span className="text-[0.66rem] font-semibold text-accent-700">
                    {t("Area {index} · {name}", { index: index + 1, name: farm.name })}
                  </span>
                )}
              </Tooltip>
            </Polygon>
          );
        })}

        {cameras
          .filter((camera) => camera.lat !== null && camera.lng !== null)
          .map((camera) => (
            <CircleMarker
              key={`camera-${camera.id}`}
              center={[camera.lat!, camera.lng!]}
              radius={camera.isLive ? 7 : 5.5}
              pathOptions={{
                color: "#ffffff",
                weight: 2.5,
                fillColor: camera.isLive ? "#bf4540" : "#606b60",
                fillOpacity: 0.95,
              }}
            >
              <Tooltip>
                {camera.name} · {camera.isLive ? t("LIVE") : camera.status === "live" ? t("Live") : t("Ended")}
              </Tooltip>
            </CircleMarker>
          ))}
      </LeafletMapContainer>

      <MapControls mapRef={mapRef} />

      <div className={cn(
        "absolute bottom-7 left-3 right-3 z-[500] flex flex-wrap items-center gap-2 sm:left-4 sm:right-4",
        detailsOpen && "xl:right-[23.5rem]",
      )}>
        <span className="map-chip">
          <Satellite className="h-3 w-3" />
          {t("Esri satellite")}
        </span>
        <span className="map-chip">
          <Layers className="h-3 w-3" />
          {t(formatLandArea(selectedFarm.areaAcres))}
        </span>
        <Link
          href="/map"
          className="toolbar-btn min-h-11 border-transparent text-xs shadow-[var(--shadow-card)]"
          title={t("Draw or edit the field boundary")}
        >
          <ExternalLink className="h-3 w-3" />
          {t("Edit boundary")}
        </Link>
      </div>
    </div>
  );
}
