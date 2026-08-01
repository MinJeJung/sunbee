import "server-only";

import { Storage, type Bucket } from "@google-cloud/storage";
import { BlobNotFoundError, get, head, issueSignedToken, presignUrl } from "@vercel/blob";
import { z } from "zod";

export const cloudArtifactKindSchema = z.enum(["cover", "epub", "manuscript", "meta"]);
export type CloudArtifactKind = z.infer<typeof cloudArtifactKindSchema>;

export type CloudArtifactReference = {
  readonly bucket: string;
  readonly objectName: string;
};

export type CloudUploadTarget = {
  readonly artifactId: string;
  readonly uploadUrl: string;
  readonly contentType: string;
};

export interface CloudArtifactStore {
  createUploadTarget(operationId: string, kind: CloudArtifactKind): Promise<CloudUploadTarget>;
  exists(artifactId: string): Promise<boolean>;
  read(artifactId: string): Promise<Buffer>;
}

const credentialsSchema = z.object({
  client_email: z.email(),
  private_key: z.string().min(1),
  project_id: z.string().min(1),
}).passthrough();

const bucketNameSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$/);
const artifactIdSchema = z.string().regex(/^gcs:\/\/[^/]+\/.+$/);

function artifactFilename(kind: CloudArtifactKind): string {
  switch (kind) {
    case "cover": return "cover.jpg";
    case "epub": return "book.epub";
    case "manuscript": return "manuscript.md";
    case "meta": return "meta.md";
  }
}

export function artifactContentType(kind: CloudArtifactKind): string {
  switch (kind) {
    case "cover": return "image/jpeg";
    case "epub": return "application/epub+zip";
    case "manuscript":
    case "meta": return "text/markdown";
  }
}

export function artifactObjectName(operationId: string, kind: CloudArtifactKind): string {
  return `artifacts/${z.uuid().parse(operationId)}/${artifactFilename(kind)}`;
}

export function cloudArtifactId(bucket: string, objectName: string): string {
  const parsedBucket = bucketNameSchema.parse(bucket);
  const parsedObject = z.string().regex(/^artifacts\/[0-9a-f-]+\/[a-z0-9.-]+$/).parse(objectName);
  return `gcs://${parsedBucket}/${parsedObject}`;
}

export function blobArtifactId(objectName: string): string {
  const parsedObject = z.string().regex(/^artifacts\/[0-9a-f-]+\/[a-z0-9.-]+$/).parse(objectName);
  return `blob://${parsedObject}`;
}

export function parseCloudArtifactId(artifactId: string): CloudArtifactReference {
  const parsed = artifactIdSchema.parse(artifactId);
  const withoutScheme = parsed.slice("gcs://".length);
  const separator = withoutScheme.indexOf("/");
  const bucket = bucketNameSchema.parse(withoutScheme.slice(0, separator));
  const objectName = withoutScheme.slice(separator + 1);
  if (!/^artifacts\/[0-9a-f-]+\/[a-z0-9.-]+$/.test(objectName) || objectName.split("/").includes("..")) {
    throw new TypeError("클라우드 산출물 경로가 올바르지 않습니다.");
  }
  return { bucket, objectName };
}

export class GcsArtifactStore {
  constructor(private readonly bucket: Bucket) {}

  async createUploadTarget(operationId: string, kind: CloudArtifactKind): Promise<CloudUploadTarget> {
    const objectName = artifactObjectName(operationId, kind);
    const contentType = artifactContentType(kind);
    const [uploadUrl] = await this.bucket.file(objectName).getSignedUrl({
      version: "v4",
      action: "write",
      expires: Date.now() + 12 * 60 * 60_000,
      contentType,
    });
    return { artifactId: cloudArtifactId(this.bucket.name, objectName), uploadUrl, contentType };
  }

  async exists(artifactId: string): Promise<boolean> {
    const reference = parseCloudArtifactId(artifactId);
    if (reference.bucket !== this.bucket.name) return false;
    const [exists] = await this.bucket.file(reference.objectName).exists();
    return exists;
  }

  async read(artifactId: string): Promise<Buffer> {
    const reference = parseCloudArtifactId(artifactId);
    if (reference.bucket !== this.bucket.name) throw new TypeError("다른 버킷의 산출물은 읽을 수 없습니다.");
    const [body] = await this.bucket.file(reference.objectName).download();
    return body;
  }
}

function parseBlobArtifactId(artifactId: string): string {
  if (!artifactId.startsWith("blob://")) throw new TypeError("Vercel Blob 산출물 경로가 올바르지 않습니다.");
  return z.string().regex(/^artifacts\/[0-9a-f-]+\/[a-z0-9.-]+$/).parse(artifactId.slice("blob://".length));
}

export class VercelBlobArtifactStore implements CloudArtifactStore {
  async createUploadTarget(operationId: string, kind: CloudArtifactKind): Promise<CloudUploadTarget> {
    const objectName = artifactObjectName(operationId, kind);
    const contentType = artifactContentType(kind);
    const maximumSizeInBytes = kind === "epub" ? 100 * 1024 * 1024 : kind === "cover" ? 15 * 1024 * 1024 : 10 * 1024 * 1024;
    const validUntil = Date.now() + 12 * 60 * 60_000;
    const signedToken = await issueSignedToken({
      pathname: objectName,
      operations: ["put"],
      validUntil,
      allowedContentTypes: [contentType],
      maximumSizeInBytes,
    });
    const { presignedUrl } = await presignUrl(signedToken, {
      operation: "put",
      pathname: objectName,
      access: "private",
      validUntil,
      allowedContentTypes: [contentType],
      maximumSizeInBytes,
      allowOverwrite: true,
      addRandomSuffix: false,
    });
    return { artifactId: blobArtifactId(objectName), uploadUrl: presignedUrl, contentType };
  }

  async exists(artifactId: string): Promise<boolean> {
    try {
      await head(parseBlobArtifactId(artifactId));
      return true;
    } catch (error) {
      if (error instanceof BlobNotFoundError) return false;
      throw error;
    }
  }

  async read(artifactId: string): Promise<Buffer> {
    const result = await get(parseBlobArtifactId(artifactId), { access: "private", useCache: false });
    if (!result || result.statusCode !== 200) throw new BlobNotFoundError();
    return Buffer.from(await new Response(result.stream).arrayBuffer());
  }
}

let artifactStore: GcsArtifactStore | undefined;
let blobArtifactStore: VercelBlobArtifactStore | undefined;

export function createGcsArtifactStore(): GcsArtifactStore {
  if (artifactStore) return artifactStore;
  const bucket = bucketNameSchema.parse(process.env["EBOOK_GCS_BUCKET"]);
  const rawCredentials = z.string().min(1).parse(process.env["GCS_SERVICE_ACCOUNT_JSON"]);
  const credentials = credentialsSchema.parse(JSON.parse(rawCredentials));
  const storage = new Storage({
    projectId: credentials.project_id,
    credentials: { client_email: credentials.client_email, private_key: credentials.private_key },
  });
  artifactStore = new GcsArtifactStore(storage.bucket(bucket));
  return artifactStore;
}

export function createCloudArtifactStore(): CloudArtifactStore {
  if (process.env["EBOOK_STORE_DRIVER"] === "gcs") return createGcsArtifactStore();
  blobArtifactStore ??= new VercelBlobArtifactStore();
  return blobArtifactStore;
}

export function currentCloudArtifactId(operationId: string, kind: CloudArtifactKind): string {
  const objectName = artifactObjectName(operationId, kind);
  if (process.env["EBOOK_STORE_DRIVER"] === "gcs") {
    return cloudArtifactId(z.string().min(3).parse(process.env["EBOOK_GCS_BUCKET"]), objectName);
  }
  return blobArtifactId(objectName);
}

export function usesCloudArtifacts(): boolean {
  return ["gcs", "blob"].includes(process.env["EBOOK_STORE_DRIVER"] ?? "");
}
