export type HermesManagerHealth = "healthy" | "attention" | "offline";

export type HermesPriority = {
  readonly tone: "urgent" | "review" | "observe" | "normal";
  readonly title: string;
  readonly detail: string;
};

export type HermesManagerInput = {
  readonly capturedAt: string;
  readonly gateway: {
    readonly isRunning: boolean;
    readonly isSlackConnected: boolean;
    readonly updatedAt: string | null;
  } | null;
  readonly cronJobs: readonly {
    readonly name: string;
    readonly enabled: boolean;
    readonly lastStatus: "ok" | "error" | "never";
    readonly lastRunAt: string | null;
    readonly nextRunAt: string | null;
  }[];
  readonly sales: {
    readonly latestDate: string;
    readonly cumulativeTotal: number;
    readonly dailyTotal: number | null;
    readonly isCurrent: boolean;
    readonly isManual?: boolean;
    readonly sourceState?: "confirmed" | "reconciled" | "fallback";
  } | null;
  readonly production: {
    readonly active: number;
    readonly review: number;
    readonly failed: number;
    readonly distributionAttention: number;
  };
  readonly recovery: {
    readonly attempts: number;
    readonly recovering: number;
    readonly blocked: number;
    readonly lastAt: string | null;
    readonly lastSummary: string | null;
  };
};

export type HermesManagerSnapshot = {
  readonly capturedAt: string;
  readonly health: HermesManagerHealth;
  readonly gateway: {
    readonly state: "connected" | "offline";
    readonly slackState: "connected" | "offline";
    readonly updatedAt: string | null;
  };
  readonly monitor: {
    readonly state: "ok" | "error" | "waiting";
    readonly lastRunAt: string | null;
    readonly nextRunAt: string | null;
  };
  readonly n8n: {
    readonly state: "current" | "manual" | "delayed" | "fallback" | "waiting";
    readonly latestDate: string | null;
    readonly cumulativeTotal: number | null;
    readonly dailyTotal: number | null;
  };
  readonly production: HermesManagerInput["production"];
  readonly recovery: HermesManagerInput["recovery"] & {
    readonly state: "idle" | "recovering" | "blocked";
  };
  readonly cron: {
    readonly active: number;
    readonly failed: number;
  };
  readonly priorities: readonly HermesPriority[];
};

const MONITOR_STATES = {
  ok: "ok",
  error: "error",
  never: "waiting",
} as const satisfies Record<HermesManagerInput["cronJobs"][number]["lastStatus"], HermesManagerSnapshot["monitor"]["state"]>;

export function buildHermesManagerSnapshot(input: HermesManagerInput): HermesManagerSnapshot {
  const gatewayState = input.gateway?.isRunning === true ? "connected" : "offline";
  const slackState = input.gateway?.isSlackConnected === true ? "connected" : "offline";
  const activeJobs = input.cronJobs.filter((job) => job.enabled);
  const failedJobs = activeJobs.filter((job) => job.lastStatus === "error");
  const monitorJob = activeJobs.find((job) => job.name === "sunbee-ebook-dashboard-watch");
  const monitorState = monitorJob === undefined ? "waiting" : MONITOR_STATES[monitorJob.lastStatus];
  const n8nState = input.sales === null ? "waiting" : input.sales.sourceState === "fallback" ? "fallback" : input.sales.isManual ? "manual" : input.sales.isCurrent ? "current" : "delayed";
  const hasAttention = monitorState !== "ok"
    || (n8nState !== "current" && n8nState !== "manual")
    || failedJobs.length > 0
    || input.production.failed > 0
    || input.production.review > 0
    || input.production.distributionAttention > 0
    || input.recovery.blocked > 0
    || input.recovery.recovering > 0;
  const health: HermesManagerHealth = gatewayState === "offline" || slackState === "offline"
    ? "offline"
    : hasAttention ? "attention" : "healthy";
  const priorities: HermesPriority[] = [];

  if (gatewayState === "offline" || slackState === "offline") {
    priorities.push({ tone: "urgent", title: "Hermes 연결 복구", detail: "Gateway 또는 Slack 연결 상태를 확인해야 합니다." });
  }
  if (input.production.failed > 0) {
    priorities.push({ tone: "urgent", title: "제작 실패 확인", detail: `${input.production.failed}건의 실패 원인을 확인해야 합니다.` });
  }
  if (input.recovery.blocked > 0) {
    priorities.push({ tone: "urgent", title: "자동 복구 한도 도달", detail: `${input.recovery.blocked}건이 자동 재시작 3회 후에도 실패해 사용자 확인이 필요합니다.` });
  } else if (input.recovery.recovering > 0) {
    priorities.push({ tone: "normal", title: "Hermes 자동 복구 실행", detail: `${input.recovery.recovering}권을 진단 후 다시 제작하고 있습니다.` });
  }
  if (monitorState === "error") {
    priorities.push({ tone: "urgent", title: "대시보드 감시 복구", detail: "Hermes의 15분 운영 감시가 실패했습니다." });
  }
  if (input.production.review > 0) {
    priorities.push({ tone: "review", title: "승인 대기 확인", detail: `${input.production.review}권의 표지와 EPUB 검수가 필요합니다.` });
  }
  if (n8nState !== "current" && n8nState !== "manual") {
    priorities.push({ tone: "observe", title: "n8n 수집 지연", detail: "오늘 07:00 유통·매출 데이터가 아직 확인되지 않았습니다." });
  }
  if (input.production.distributionAttention > 0) {
    priorities.push({ tone: "observe", title: "5사 유통 누락 확인", detail: `${input.production.distributionAttention}건은 유통사별 상태 대조가 필요합니다.` });
  }
  const otherFailedJobs = failedJobs.filter((job) => job.name !== "sunbee-ebook-dashboard-watch");
  if (otherFailedJobs.length > 0) {
    const failedNames = otherFailedJobs.map((job) => job.name).join(", ");
    priorities.push({ tone: "observe", title: "Hermes 예약 작업 확인", detail: `${otherFailedJobs.length}개의 활성 예약 작업이 최근 실패했습니다: ${failedNames}` });
  }
  if (input.production.active > 0) {
    priorities.push({ tone: "normal", title: "제작 진행 관찰", detail: `${input.production.active}권을 Codex 제작기가 처리하고 있습니다.` });
  }
  if (priorities.length === 0) {
    priorities.push({ tone: "normal", title: "자동 운영 정상", detail: "Hermes·n8n·Codex 제작 흐름에 즉시 확인할 항목이 없습니다." });
  }

  return {
    capturedAt: input.capturedAt,
    health,
    gateway: { state: gatewayState, slackState, updatedAt: input.gateway?.updatedAt ?? null },
    monitor: {
      state: monitorState,
      lastRunAt: monitorJob?.lastRunAt ?? null,
      nextRunAt: monitorJob?.nextRunAt ?? null,
    },
    n8n: {
      state: n8nState,
      latestDate: input.sales?.latestDate ?? null,
      cumulativeTotal: input.sales?.cumulativeTotal ?? null,
      dailyTotal: input.sales?.dailyTotal ?? null,
    },
    production: input.production,
    recovery: {
      ...input.recovery,
      state: input.recovery.blocked > 0 ? "blocked" : input.recovery.recovering > 0 ? "recovering" : "idle",
    },
    cron: { active: activeJobs.length, failed: failedJobs.length },
    priorities,
  };
}
