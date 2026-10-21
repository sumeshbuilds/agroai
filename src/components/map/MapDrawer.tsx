"use client";

import "leaflet/dist/leaflet.css";

import { useMemo, useRef, useState } from "react";
import type { Map as LeafletMap } from "leaflet";
import {
  CircleMarker,
  MapContainer,
  Polygon,
  Polyline,
  TileLayer,
  Tooltip,
  useMapEvents,
} from "react-leaflet";
import { Crosshair, Ruler, Save, Trash2, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { ApiError, api } from "@/lib/api-client";
import { polygonAreaAcres, polygonCentroid } from "@/lib/geo";
import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  ESRI_ATTRIBUTION,
  ESRI_WORLD_IMAGERY_URL,
  FARM_ZOOM,
} from "@/lib/map";
import type { AlertDTO, FarmDTO, GeoPoint } from "@/lib/types";

function DrawEvents({
  onPoint,
}: {
  onPoint: (point: GeoPoint) => void;
}) {
  useMapEvents({
    click(event) {
      onPoint([event.latlng.lat, event.latlng.lng]);
    },
  });
  return null;
}

export function MapDrawer({
  farms,
  sightings = [],
  onSaved,
}: {
  farms: FarmDTO[];
  sightings?: AlertDTO[];
  onSaved?: (farm: FarmDTO) => void;
}) {
  const mapRef = useRef<LeafletMap | null>(null);
  const [points, setPoints] = useState<GeoPoint[]>([]);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initialCenter = useMemo<GeoPoint>(
    () =>
      farms[0]
        ? [farms[0].centroidLat, farms[0].centroidLng]
        : DEFAULT_CENTER,
    [farms],
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

  const handleSave = async () => {
    if (points.length < 3) {
      setError("Add at least 3 corners before saving.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const { farm } = await api.createFarm({
        name: name.trim() || "My Farm",
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
    <div className="space-y-3">
      <div className="card space-y-3 p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1">
            <span className="muted text-xs font-semibold">Farm name</span>
            <input
              className="input mt-1"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. North Paddy Field"
              maxLength={80}
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={handleLocate}>
              <Crosshair className="h-4 w-4" />
              Locate me
            </Button>
            <Button
              variant="ghost"
              onClick={() => setPoints((current) => current.slice(0, -1))}
              disabled={points.length === 0}
            >
              <Undo2 className="h-4 w-4" />
              Undo
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setPoints([]);
                setError(null);
              }}
              disabled={points.length === 0}
            >
              <Trash2 className="h-4 w-4" />
              Clear
            </Button>
            <Button onClick={handleSave} loading={saving}>
              <Save className="h-4 w-4" />
              Save farm
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="chip chip-brand">
            <Ruler className="h-3.5 w-3.5" />
            {area.toFixed(2)} acres
          </span>
          <span className="muted text-xs">
            {points.length} corner{points.length === 1 ? "" : "s"} · tap the map
            to outline your field
          </span>
        </div>

        {error ? <Callout tone="danger">{error}</Callout> : null}
      </div>

      <div className="relative h-[58vh] min-h-[360px] overflow-hidden rounded-2xl border border-[var(--border)]">
        <MapContainer
          ref={mapRef}
          center={initialCenter}
          zoom={initialZoom}
          scrollWheelZoom
          className="h-full w-full"
        >
          <DrawEvents onPoint={addPoint} />

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
                color: "#34d399",
                weight: 2,
                dashArray: "6 6",
                fillColor: "#34d399",
                fillOpacity: 0.06,
              }}
            />
          ))}

          {sightings.map((sighting) => (
            <CircleMarker
              key={`sighting-${sighting.id}`}
              center={[sighting.lat, sighting.lng]}
              radius={8}
              pathOptions={{
                color: "#ffffff",
                weight: 2,
                fillColor: "#ef4444",
                fillOpacity: 0.95,
              }}
            >
              <Tooltip>
                {sighting.animalType} · {sighting.distanceKm?.toFixed(1) ?? "?"} km
              </Tooltip>
            </CircleMarker>
          ))}

          {points.length === 2 ? (
            <Polyline
              positions={points}
              pathOptions={{ color: "#facc15", weight: 3 }}
            />
          ) : null}

          {hasPolygon ? (
            <Polygon
              positions={points}
              pathOptions={{
                color: "#facc15",
                weight: 3,
                fillColor: "#facc15",
                fillOpacity: 0.2,
              }}
            />
          ) : null}

          {points.map((point, index) => (
            <CircleMarker
              key={`${point[0]}-${point[1]}-${index}`}
              center={point}
              radius={7}
              pathOptions={{
                color: "#1f2937",
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
                fillColor: "#ef4444",
                fillOpacity: 1,
              }}
            >
              <Tooltip direction="top" offset={[0, -6]}>
                Centre · {area.toFixed(2)} acres
              </Tooltip>
            </CircleMarker>
          ) : null}
        </MapContainer>
      </div>
    </div>
  );
}
