export type CameraAlarmAcknowledgement =
  | { all: true; throughId: number }
  | { all: false; id: number };

export const MAX_ALARM_EXCLUSIONS = 1_000;

export const isAlarmId = (id: unknown): id is number =>
  typeof id === "number" && Number.isSafeInteger(id) && id > 0;

/** A malformed single-alarm request must never acknowledge every alarm. */
export function parseCameraAlarmAcknowledgement(value: unknown): CameraAlarmAcknowledgement | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (body.all === true) {
    return isAlarmId(body.throughId) && body.id === undefined
      ? { all: true, throughId: body.throughId } : null;
  }
  return isAlarmId(body.id) && body.all === undefined && body.throughId === undefined
    ? { all: false, id: body.id } : null;
}

export function parseCameraAlarmQuery(params: URLSearchParams) {
  for (const key of ["before", "after", "exclude", "limit", "all"]) {
    if (params.getAll(key).length > 1) return null;
  }
  const before = params.get("before");
  const after = params.get("after");
  if ((before !== null && !/^\d+$/.test(before)) || (after !== null && !/^\d+$/.test(after))) return null;
  const beforeId = before === null ? undefined : Number(before);
  const afterId = after === null ? 0 : Number(after);
  const excluded = params.get("exclude");
  const parts = excluded === null ? [] : excluded.split(",");
  if (parts.length > MAX_ALARM_EXCLUSIONS || parts.some((id) => !/^\d+$/.test(id))) return null;
  const excludedIds = parts.map(Number);
  if ((beforeId !== undefined && !isAlarmId(beforeId)) ||
      (afterId !== 0 && !isAlarmId(afterId)) || excludedIds.some((id) => !isAlarmId(id))) return null;
  const limit = Number(params.get("limit") ?? 20);
  return {
    beforeId, afterId, excludedIds: [...new Set(excludedIds)],
    limit: Number.isFinite(limit) ? Math.min(50, Math.max(1, Math.round(limit))) : 20,
    includeAcknowledged: params.get("all") === "1",
  };
}
