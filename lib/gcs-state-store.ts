import "server-only";

import { Storage, type File } from "@google-cloud/storage";
import { z } from "zod";
import { dashboardStateSchema } from "@/lib/state-schema";
import { emptyState, type DashboardState } from "@/lib/types";

export type StateObject = {
  readonly body: string;
  readonly generation: string;
};

export interface VersionedStateObjectStore {
  read(): Promise<StateObject | null>;
  write(body: string, expectedGeneration: string | null): Promise<void>;
}

export class StateWriteConflictError extends Error {
  constructor() {
    super("다른 실행기가 대시보드 상태를 먼저 갱신했습니다.");
    this.name = "StateWriteConflictError";
  }
}

const credentialsSchema = z.object({
  client_email: z.email(),
  private_key: z.string().min(1),
  project_id: z.string().min(1),
}).passthrough();

const maximumUpdateAttempts = 8;

function errorCode(error: unknown): unknown {
  return error instanceof Error && "code" in error ? error.code : undefined;
}

function generationNumber(generation: string): number {
  const parsed = Number(generation);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new RangeError(`GCS generation 값이 올바르지 않습니다: ${generation}`);
  }
  return parsed;
}

export class GcsStateObjectStore implements VersionedStateObjectStore {
  constructor(private readonly file: File) {}

  async read(): Promise<StateObject | null> {
    try {
      const [body] = await this.file.download();
      const [metadata] = await this.file.getMetadata();
      const generation = metadata.generation;
      if (generation === undefined) throw new TypeError("GCS 상태 객체에 generation이 없습니다.");
      return { body: body.toString("utf8"), generation: String(generation) };
    } catch (error) {
      if (errorCode(error) === 404) return null;
      throw error;
    }
  }

  async write(body: string, expectedGeneration: string | null): Promise<void> {
    const ifGenerationMatch = expectedGeneration === null ? 0 : generationNumber(expectedGeneration);
    try {
      await this.file.save(body, {
        contentType: "application/json; charset=utf-8",
        resumable: false,
        validation: "crc32c",
        preconditionOpts: { ifGenerationMatch },
      });
    } catch (error) {
      if (errorCode(error) === 412) throw new StateWriteConflictError();
      throw error;
    }
  }
}

export function createGcsStateObjectStore(): GcsStateObjectStore {
  const bucket = z.string().min(3).parse(process.env["EBOOK_GCS_BUCKET"]);
  const objectName = z.string().min(1).parse(process.env["EBOOK_GCS_STATE_OBJECT"] ?? "state/dashboard.json");
  const rawCredentials = z.string().min(1).parse(process.env["GCS_SERVICE_ACCOUNT_JSON"]);
  const credentials = credentialsSchema.parse(JSON.parse(rawCredentials));
  const storage = new Storage({
    projectId: credentials.project_id,
    credentials: {
      client_email: credentials.client_email,
      private_key: credentials.private_key,
    },
  });
  return new GcsStateObjectStore(storage.bucket(bucket).file(objectName));
}

export async function readVersionedState(store: VersionedStateObjectStore): Promise<DashboardState> {
  const current = await store.read();
  return current ? dashboardStateSchema.parse(JSON.parse(current.body)) : emptyState();
}

export async function updateVersionedState(
  store: VersionedStateObjectStore,
  transform: (state: DashboardState) => DashboardState,
): Promise<DashboardState> {
  for (let attempt = 0; attempt < maximumUpdateAttempts; attempt += 1) {
    const current = await store.read();
    const state = current ? dashboardStateSchema.parse(JSON.parse(current.body)) : emptyState();
    const updated = dashboardStateSchema.parse(transform(state));
    try {
      await store.write(JSON.stringify(updated, null, 2), current?.generation ?? null);
      return updated;
    } catch (error) {
      if (!(error instanceof StateWriteConflictError) || attempt === maximumUpdateAttempts - 1) throw error;
    }
  }
  throw new StateWriteConflictError();
}
