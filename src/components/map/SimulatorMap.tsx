"use client";

import "leaflet/dist/leaflet.css";

import { useMemo } from "react";
import {
  Circle,
  CircleMarker,
  MapContainer,
  Polygon,
  TileLayer,
  Tooltip,
  useMapEvents,
} from "react-leaflet";

import { animalKind, DEFAULT_CENTER, ESRI_ATTRIBUTION, ESRI_WORLD_IMAGERY_URL, FARM_ZOOM } from "@/lib/map";
import type { AlertDTO, FarmDTO, GeoPoint } from "@/lib/types";

function PickEvents({ onPick }: { onPick: (point: GeoPoint) => void }) {
  useMapEvents({
    click(event) {
      onPick([event.latlng.lat, event.latlng.lng]);
    },
  });
  return null;
}

export function SimulatorMap({
  farms,
  sightings,
  affectedFarmIds,
  pendingPick,
  radiusKm,
  onPick,
}: {
  farms: FarmDTO[];
  sightings: AlertDTO[];
  affectedFarmIds: number[];
  pendingPick: GeoPoint | null;
  radiusKm: number;
  onPick: (point: GeoPoint) => void;
}) {
  const center = useMemo<GeoPoint>(
    () => (farms[0] ? [farms[0].centroidLat, farms[0].centroidLng] : DEFAULT_CENTER),
    [farms],
  );

  return (
    <div className="relative h-[58vh] min-h-[360px] overflow-hidden rounded-2xl border border-[var(--border)]">
      <MapContainer
        center={center}
        zoom={farms[0] ? FARM_ZOOM : 7}
        scrollWheelZoom
        className="h-full w-full"
      >
        <PickEvents onPick={onPick} />

        <TileLayer
          url={ESRI_WORLD_IMAGERY_URL}
          attribution={ESRI_ATTRIBUTION}
          maxZoom={19}
        />

        {farms.map((farm) => {
          const atRisk = affectedFarmIds.includes(farm.id);
          return (
            <Polygon
              key={farm.id}
              positions={farm.points}
              interactive={false}
              pathOptions={{
                color: atRisk ? "#ef4444" : "#34d399",
                weight: atRisk ? 3 : 2,
                fillColor: atRisk ? "#ef4444" : "#34d399",
                fillOpacity: atRisk ? 0.25 : 0.08,
              }}
            >
              <Tooltip sticky>
                {farm.name}
                {farm.areaAcres ? ` · ${farm.areaAcres.toFixed(2)} acres` : ""}
              </Tooltip>
            </Polygon>
          );
        })}

        {pendingPick ? (
          <Circle
            center={pendingPick}
            radius={radiusKm * 1000}
            pathOptions={{
              color: "#ef4444",
              weight: 1.5,
              dashArray: "6 8",
              fillColor: "#ef4444",
              fillOpacity: 0.06,
            }}
          />
        ) : null}

        {sightings.map((sighting) => {
          const kind = animalKind(sighting.animalType);
          return (
            <CircleMarker
              key={`sighting-${sighting.id}`}
              center={[sighting.lat, sighting.lng]}
              radius={11}
              pathOptions={{
                color: "#ffffff",
                weight: 2,
                fillColor: kind.color,
                fillOpacity: 1,
              }}
            >
              <Tooltip permanent direction="top" offset={[0, -10]}>
                {kind.emoji} {kind.label}
              </Tooltip>
            </CircleMarker>
          );
        })}

        {pendingPick ? (
          <CircleMarker
            center={pendingPick}
            radius={7}
            pathOptions={{
              color: "#ffffff",
              weight: 2,
              fillColor: "#facc15",
              fillOpacity: 1,
            }}
          />
        ) : null}
      </MapContainer>

      <div className="pointer-events-none absolute left-3 top-3 z-[500] rounded-lg bg-black/60 px-2.5 py-1.5 text-xs font-semibold text-white">
        Tap the map to spawn a sighting
      </div>
    </div>
  );
}
