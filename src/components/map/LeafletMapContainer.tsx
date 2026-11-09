"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { Ref } from "react";
import type { Map as LeafletMap } from "leaflet";
import { MapContainer } from "react-leaflet";
import type { MapContainerProps } from "react-leaflet";

type LeafletMapContainerProps = MapContainerProps & {
  ref?: Ref<LeafletMap>;
};

/** Recreate Leaflet's map after Next.js hides and restores a cached route. */
export function LeafletMapContainer({ ref, ...props }: LeafletMapContainerProps) {
  const [generation, setGeneration] = useState(0);
  const instanceRef = useRef<LeafletMap | null>(null);

  const handleMapRef = useCallback(
    (map: LeafletMap | null) => {
      // Remember readiness even if React detaches the forwarded ref first.
      if (map) instanceRef.current = map;
      if (typeof ref === "function") return ref(map);
      if (ref) ref.current = map;
    },
    [ref],
  );

  useLayoutEffect(() => {
    return () => {
      // Strict Mode also replays cleanup before the map's context is ready.
      // Remount only an initialized map, not its pending initial render.
      if (!instanceRef.current) return;
      instanceRef.current = null;

      // Activity preserves React state, but MapContainer's cleanup destroys
      // Leaflet's panes. A new key prevents layers from reusing that map.
      setGeneration((current) => current + 1);
    };
  }, []);

  return <MapContainer key={generation} ref={handleMapRef} {...props} />;
}
