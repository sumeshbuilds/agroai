"use client";

import "leaflet/dist/leaflet.css";

import { useMemo, useRef, useState } from "react";
import type { Map as LeafletMap } from "leaflet";
import {
  CircleMarker,
  Polygon,
  Polyline,
  TileLayer,
  Tooltip,
  useMapEvents,
  ZoomControl,
} from "react-leaflet";
import { Crosshair, Ruler, Save, Trash2, Undo2 } from "lucide-react";

import { LeafletMapContainer } from "@/components/map/LeafletMapContainer";
import { LocationSearch } from "@/components/map/LocationSearch";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { ApiError, api } from "@/lib/api-client";
import type { CameraSessionDTO } from "@/lib/camera";
import { formatLandArea } from "@/lib/format";
import type { GeocodePlace } from "@/lib/geocode";
import { polygonAreaAcres, polygonCentroid } from "@/lib/geo";
import { useI18n } from "@/lib/i18n";
import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  ESRI_ATTRIBUTION,
  ESRI_WORLD_IMAGERY_URL,
  FARM_ZOOM,
} from "@/lib/map";
import type { FarmDTO, GeoPoint } from "@/lib/types";

function DrawEvents({ onPoint }: { onPoint: (point: GeoPoint) => void }) {
  useMapEvents({
    click(event) {
      onPoint([event.latlng.lat, event.latlng.lng]);
    },
  });
  return null;
}

export function MapDrawer({
  farms,
  cameras = [],
  onSaved,
}: {
  farms: FarmDTO[];
  cameras?: CameraSessionDTO[];
  onSaved?: (farm: FarmDTO) => void;
}) {
  const mapRef = useRef<LeafletMap | null>(null);
  const { t } = useI18n();
  const [points, setPoints] = useState<GeoPoint[]>([]);
  const [name, setName] = useState("");
  const [searchTarget, setSearchTarget] = useState<GeocodePlace | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initialCenter = useMemo<GeoPoint>(
    () =>
      farms[0]
        ? [farms[0].centroidLat, farms[0].centroidLng]
        : DEFAULT_CENTER,
    // Centres only on mount; Leaflet owns movement afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [farms[0]],
  );

  const initialZoom = farms[0] ? FARM_ZOOM : DEFAULT_ZOOM;

  const area = useMemo(() => polygonAreaAcres(points), [points]);
  const centroid = useMemo(() => polygonCentroid(points), [points]);

  const addPoint = (point: GeoPoint) => {
    setError(null);
    setPoints((current) => [...current, point]);
  };

  const handleLocate = () => {
    if (!("geolocation" in navigator)) {
      setError("Your browser does not support location access.");
      return;
    }

    setError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        mapRef.current?.flyTo(
          [position.coords.latitude, position.coords.longitude],
          16,
          {
            animate: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
            duration: 0.25,
          },
        );
      },
      () =>
        setError(
          "Could not read your location. Please allow location access in your browser.",
        ),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  const handleSave = async () => {
    if (points.length < 3) {
      setError("Add at least 3 corners before saving.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const { farm } = await api.createFarm({
        name: name.trim() || t("My Farm"),
        points,
      });
      setPoints([]);
      setName("");
      onSaved?.(farm);
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : "Could not save the farm. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const hasPolygon = points.length >= 3;

  return (
    <div className="relative flex h-full min-h-[36rem] w-full flex-col overflow-hidden rounded-2xl bg-paper-deep sm:min-h-[28rem]">
      <LocationSearch
        mapRef={mapRef}
        onSelect={(place) => setSearchTarget(place)}
        className="order-first mb-3 shrink-0 lg:absolute lg:right-4 lg:top-4 lg:z-[520] lg:mb-0 lg:w-[23rem]"
      />

      <LeafletMapContainer
        ref={mapRef}
        center={initialCenter}
        zoom={initialZoom}
        scrollWheelZoom
        zoomControl={false}
        className="order-2 min-h-[24rem] w-full flex-1 sm:order-none lg:h-full"
      >
        <DrawEvents onPoint={addPoint} />
        <ZoomControl position="bottomright" />

        <TileLayer
          url={ESRI_WORLD_IMAGERY_URL}
          attribution={ESRI_ATTRIBUTION}
          maxZoom={19}
        />

        {farms.map((farm) => (
          <Polygon
            key={farm.id}
            positions={farm.points}
            interactive={false}
            pathOptions={{
              color: "#ffffff",
              weight: 2,
              dashArray: "6 6",
               fillColor: "#638650",
              fillOpacity: 0.2,
            }}
          />
        ))}

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
                fillColor: camera.isLive ? "#bf4540" : "#606b60",
                fillOpacity: 0.95,
              }}
            >
              <Tooltip>
                {camera.name} · {camera.isLive ? t("LIVE") : camera.status === "live" ? t("Live") : t("Ended")}
              </Tooltip>
            </CircleMarker>
          ))}

        {searchTarget ? (
          <CircleMarker
            center={[searchTarget.lat, searchTarget.lng]}
            radius={9}
            pathOptions={{
              color: "#ffffff",
              weight: 3,
              fillColor: "#b6532e",
              fillOpacity: 1,
            }}
          >
            <Tooltip permanent direction="top" offset={[0, -10]}>
              {searchTarget.name}
            </Tooltip>
          </CircleMarker>
        ) : null}

        {points.length === 2 ? (
          <Polyline
            positions={points}
            pathOptions={{ color: "#e2ae8f", weight: 3 }}
          />
        ) : null}

        {hasPolygon ? (
          <Polygon
            positions={points}
            pathOptions={{
              color: "#e2ae8f",
              weight: 3,
              fillColor: "#b6532e",
              fillOpacity: 0.22,
            }}
          />
        ) : null}

        {points.map((point, index) => (
          <CircleMarker
            key={`${point[0]}-${point[1]}-${index}`}
            center={point}
            radius={7}
            pathOptions={{
              color: "#22362a",
              weight: 2,
              fillColor: "#ffffff",
              fillOpacity: 1,
            }}
          >
            <Tooltip permanent direction="top" offset={[0, -6]}>
              {index + 1}
            </Tooltip>
          </CircleMarker>
        ))}

        {hasPolygon ? (
          <CircleMarker
            center={[centroid.lat, centroid.lng]}
            radius={6}
            pathOptions={{
              color: "#ffffff",
              weight: 2,
              fillColor: "#b6532e",
              fillOpacity: 1,
            }}
          >
            <Tooltip direction="top" offset={[0, -6]}>
              {t("Centre · {area} acres", { area: area.toFixed(2) })}
            </Tooltip>
          </CircleMarker>
        ) : null}
      </LeafletMapContainer>

      {/* Floating drawing toolbar */}
      <div className="map-panel order-1 shrink-0 rounded-none bg-card p-4 shadow-none sm:absolute sm:left-4 sm:top-4 sm:z-[500] sm:w-[23rem] sm:rounded-2xl sm:bg-card/95 sm:shadow-[var(--shadow-floating)]">

        <label className="block">
          <span className="text-sm font-medium">
            {t("Farm name")}
          </span>
          <input
            className="input mt-2"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              // The drawer can sit inside the onboarding wizard's form.
              // Enter should not submit it while the farmer is naming a field.
              if (event.key === "Enter") event.preventDefault();
            }}
            placeholder={t("e.g. North Paddy Field")}
            maxLength={80}
          />
        </label>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Button
            variant="secondary"
            onClick={handleLocate}
          >
            <Crosshair aria-hidden className="h-4 w-4" />
            {t("Locate me")}
          </Button>
          <Button
            variant="secondary"
            onClick={() => setPoints((current) => current.slice(0, -1))}
            disabled={points.length === 0}
          >
            <Undo2 aria-hidden className="h-4 w-4" />
            {t("Undo")}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setPoints([]);
              setError(null);
            }}
            disabled={points.length === 0}
          >
            <Trash2 aria-hidden className="h-4 w-4" />
            {t("Clear")}
          </Button>
          <Button
            onClick={() => void handleSave()}
            disabled={!hasPolygon}
            loading={saving}
          >
            <Save aria-hidden className="h-4 w-4" />
            {t("Save farm")}
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs leading-relaxed">
          <span className="chip chip-brand">
            <Ruler className="h-3 w-3" />
            {t(formatLandArea(area))}
          </span>
          <span className="muted">
            {t(
              points.length === 1
                ? "{count} corner · tap the map to trace the boundary"
                : "{count} corners · tap the map to trace the boundary",
              { count: points.length },
            )}
          </span>
        </div>

        {error ? (
          <div className="mt-2.5">
            <Callout tone="danger">{t(error)}</Callout>
          </div>
        ) : null}
      </div>

      <div className="pointer-events-none absolute bottom-6 left-3 right-16 z-[500] flex justify-center sm:left-4 sm:right-20">
        <span className="map-chip map-hint">
          {farms.length > 0
            ? t(
                farms.length === 1
                  ? "{count} saved field mapped on this account"
                  : "{count} saved fields mapped on this account",
                { count: farms.length },
              )
            : t("Trace at least 3 corners, name the field, save")}
        </span>
      </div>
    </div>
  );
}
