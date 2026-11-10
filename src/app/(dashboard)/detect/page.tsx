import type { Metadata } from "next";

import { PlantDoctorView } from "@/components/disease/PlantDoctorView";

export const metadata: Metadata = {
  title: "Plant doctor",
};

export default async function PlantDoctorPage({
  searchParams,
}: {
  searchParams: Promise<{ cropId?: string | string[] }>;
}) {
  const raw = (await searchParams).cropId;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const cropId = Number(value);

  return (
    <PlantDoctorView
      initialCropId={Number.isInteger(cropId) && cropId > 0 ? cropId : null}
    />
  );
}
