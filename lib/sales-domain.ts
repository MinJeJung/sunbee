import { z } from "zod";

export const PLATFORM_KEYS = ["kyobo", "yes24", "aladin", "ridi", "millie"] as const;

export const PLATFORM_LABELS = {
  kyobo: "교보문고",
  yes24: "YES24",
  aladin: "알라딘",
  ridi: "리디",
  millie: "밀리의서재",
} as const;

const SalesDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).brand("SalesDate");
const YearMonthSchema = z.string().regex(/^\d{4}-\d{2}$/).brand("YearMonth");
const PlatformValuesSchema = z.object({
  kyobo: z.number().finite(),
  yes24: z.number().finite(),
  aladin: z.number().finite(),
  ridi: z.number().finite(),
  millie: z.number().finite(),
});
const PlatformStatusSchema = z.object({
  missing: z.boolean().optional(),
  stale: z.boolean().optional(),
  fallback: z.boolean().optional(),
  fallbackDate: SalesDateSchema.nullable().optional(),
  error: z.string().nullable().optional(),
});
const SnapshotSchema = z.object({
  date: SalesDateSchema,
  capturedAt: z.iso.datetime().optional(),
  ym: YearMonthSchema,
  monthStart: SalesDateSchema,
  today: SalesDateSchema,
  platforms: PlatformValuesSchema,
  platformStatus: z.object({
    kyobo: PlatformStatusSchema.optional(),
    yes24: PlatformStatusSchema.optional(),
    aladin: PlatformStatusSchema.optional(),
    ridi: PlatformStatusSchema.optional(),
    millie: PlatformStatusSchema.optional(),
  }).optional(),
  estimated: z.boolean().nullable().optional(),
  quality: z.enum(["confirmed", "reconciled", "estimated"]).optional(),
  sourceUrl: z.url().optional(),
  total: z.number().finite(),
});

export type PlatformKey = (typeof PLATFORM_KEYS)[number];
export type SalesDate = z.infer<typeof SalesDateSchema>;
export type YearMonth = z.infer<typeof YearMonthSchema>;
export type PlatformValues = z.infer<typeof PlatformValuesSchema>;
export type SalesQuality = "confirmed" | "reconciled" | "estimated";
export type SalesSourceState = "confirmed" | "reconciled" | "fallback";
export type DailySalesQuality = "confirmed" | "reconciled" | "fallback" | "unavailable";

export type SalesSnapshot = {
  readonly date: SalesDate;
  readonly capturedAt?: string;
  readonly effectiveDate: SalesDate;
  readonly sourceState: SalesSourceState;
  readonly ym: YearMonth;
  readonly monthStart: SalesDate;
  readonly platforms: PlatformValues;
  readonly estimated: boolean;
  readonly quality: SalesQuality;
  readonly sourceUrl?: string;
  readonly total: number;
};

export type DailySales = {
  readonly date: SalesDate;
  readonly effectiveDate: SalesDate;
  readonly sourceState: SalesSourceState;
  readonly cumulativeTotal: number;
  readonly dailyTotal: number | null;
  readonly dailyPlatforms: PlatformValues | null;
  readonly cumulativePlatforms: PlatformValues;
  readonly estimated: boolean;
  readonly quality: DailySalesQuality;
  readonly sourceUrl?: string;
};

export type MonthlySales = {
  readonly ym: YearMonth;
  readonly latestDate: SalesDate;
  readonly attemptedDate: SalesDate;
  readonly sourceState: SalesSourceState;
  readonly total: number;
  readonly platforms: PlatformValues;
  readonly complete: boolean;
  readonly estimated: boolean;
  readonly days: readonly DailySales[];
};

export type Freshness =
  | { readonly kind: "current"; readonly days: number }
  | { readonly kind: "delayed"; readonly days: number };

export type SalesHistory = {
  readonly latestDate: SalesDate;
  readonly attemptedDate: SalesDate;
  readonly sourceState: SalesSourceState;
  readonly freshness: Freshness;
  readonly months: readonly MonthlySales[];
};

export function parseSalesSnapshot(input: unknown): SalesSnapshot {
  const parsed = SnapshotSchema.parse(input);
  const statusEstimated = Object.values(parsed.platformStatus ?? {}).some((status) => status?.fallback === true);
  const fallbackDates = Object.values(parsed.platformStatus ?? {})
    .flatMap((status) => status?.fallback === true && status.fallbackDate !== null && status.fallbackDate !== undefined ? [status.fallbackDate] : [])
    .toSorted();
  const sourceState: SalesSourceState = statusEstimated ? "fallback" : parsed.quality === "reconciled" || parsed.estimated === true ? "reconciled" : "confirmed";
  return {
    date: parsed.date,
    ...(parsed.capturedAt === undefined ? {} : { capturedAt: parsed.capturedAt }),
    effectiveDate: fallbackDates[0] ?? parsed.date,
    sourceState,
    ym: parsed.ym,
    monthStart: parsed.monthStart,
    platforms: parsed.platforms,
    estimated: parsed.estimated ?? statusEstimated,
    quality: parsed.quality ?? ((parsed.estimated ?? statusEstimated) ? "estimated" : "confirmed"),
    ...(parsed.sourceUrl === undefined ? {} : { sourceUrl: parsed.sourceUrl }),
    total: parsed.total,
  };
}

export function aggregateSalesHistory(
  snapshots: readonly SalesSnapshot[],
  currentDateInput: string,
): SalesHistory {
  const currentDate = SalesDateSchema.parse(currentDateInput);
  const sorted = snapshots.toSorted((left, right) => left.date.localeCompare(right.date));
  const latest = sorted.at(-1);
  if (latest === undefined) throw new RangeError("매출 스냅샷이 없습니다.");

  const grouped = new Map<YearMonth, SalesSnapshot[]>();
  for (const snapshot of sorted) {
    const month = grouped.get(snapshot.ym) ?? [];
    month.push(snapshot);
    grouped.set(snapshot.ym, month);
  }

  const months = [...grouped.entries()]
    .map(([ym, monthSnapshots]) => buildMonth(ym, monthSnapshots))
    .toSorted((left, right) => right.ym.localeCompare(left.ym));
  const freshnessDays = Math.max(0, daysBetween(latest.effectiveDate, currentDate));

  return {
    latestDate: latest.effectiveDate,
    attemptedDate: latest.date,
    sourceState: latest.sourceState,
    freshness: freshnessDays <= 1
      ? { kind: "current", days: freshnessDays }
      : { kind: "delayed", days: freshnessDays },
    months,
  };
}

function buildMonth(ym: YearMonth, snapshots: readonly SalesSnapshot[]): MonthlySales {
  let previous: SalesSnapshot | undefined;
  const days: DailySales[] = [];
  for (const snapshot of snapshots) {
    const isFirstDay = snapshot.date.endsWith("-01");
    const comparableSource = snapshot.sourceState !== "fallback" && previous?.sourceState !== "fallback";
    const hasComparableDelta = comparableSource && (previous === undefined
      ? isFirstDay
      : daysBetween(previous.effectiveDate, snapshot.effectiveDate) === 1);
    const quality: DailySalesQuality = snapshot.sourceState === "fallback"
      ? "fallback"
      : !hasComparableDelta
      ? "unavailable"
      : snapshot.quality === "confirmed" && (previous === undefined || previous.quality === "confirmed")
        ? "confirmed"
        : "reconciled";
    days.push({
      date: snapshot.date,
      effectiveDate: snapshot.effectiveDate,
      sourceState: snapshot.sourceState,
      cumulativeTotal: snapshot.total,
      dailyTotal: hasComparableDelta ? snapshot.total - (previous?.total ?? 0) : null,
      dailyPlatforms: hasComparableDelta ? subtractPlatforms(snapshot.platforms, previous?.platforms) : null,
      cumulativePlatforms: snapshot.platforms,
      estimated: snapshot.estimated,
      quality,
      ...(snapshot.sourceUrl === undefined ? {} : { sourceUrl: snapshot.sourceUrl }),
    });
    previous = snapshot;
  }

  const latest = snapshots.at(-1);
  if (latest === undefined) throw new RangeError(`월별 스냅샷이 없습니다: ${ym}`);
  return {
    ym,
    latestDate: latest.effectiveDate,
    attemptedDate: latest.date,
    total: latest.total,
    platforms: latest.platforms,
    complete: latest.date === lastDateOfMonth(ym),
    estimated: latest.estimated,
    sourceState: latest.sourceState,
    days,
  };
}

function subtractPlatforms(current: PlatformValues, previous?: PlatformValues): PlatformValues {
  return {
    kyobo: current.kyobo - (previous?.kyobo ?? 0),
    yes24: current.yes24 - (previous?.yes24 ?? 0),
    aladin: current.aladin - (previous?.aladin ?? 0),
    ridi: current.ridi - (previous?.ridi ?? 0),
    millie: current.millie - (previous?.millie ?? 0),
  };
}

function daysBetween(from: SalesDate, to: SalesDate): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function lastDateOfMonth(ym: YearMonth): SalesDate {
  const [yearText, monthText] = ym.split("-");
  const year = z.coerce.number().int().parse(yearText);
  const month = z.coerce.number().int().parse(monthText);
  const day = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return SalesDateSchema.parse(`${ym}-${String(day).padStart(2, "0")}`);
}
