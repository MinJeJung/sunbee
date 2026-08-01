import "server-only";

import { BlobError, BlobNotFoundError, BlobPreconditionFailedError, get, put } from "@vercel/blob";
import type { StateObject, VersionedStateObjectStore } from "@/lib/gcs-state-store";
import { StateWriteConflictError } from "@/lib/gcs-state-store";

const statePathname = "state/dashboard.json";

export class VercelBlobStateObjectStore implements VersionedStateObjectStore {
  async read(): Promise<StateObject | null> {
    try {
      const result = await get(statePathname, { access: "private", useCache: false });
      if (!result || result.statusCode !== 200) return null;
      return { body: await new Response(result.stream).text(), generation: result.blob.etag };
    } catch (error) {
      if (error instanceof BlobNotFoundError) return null;
      throw error;
    }
  }

  async write(body: string, expectedGeneration: string | null): Promise<void> {
    try {
      await put(statePathname, body, {
        access: "private",
        allowOverwrite: expectedGeneration !== null,
        contentType: "application/json; charset=utf-8",
        cacheControlMaxAge: 60,
        ...(expectedGeneration ? { ifMatch: expectedGeneration } : {}),
      });
    } catch (error) {
      const initialCreateConflict = expectedGeneration === null && error instanceof BlobError && /already exists|conflict/i.test(error.message);
      if (error instanceof BlobPreconditionFailedError || initialCreateConflict) throw new StateWriteConflictError();
      throw error;
    }
  }
}
