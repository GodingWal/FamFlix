import { S3Client, type S3ClientConfig, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { Readable } from "stream";

import { config } from "../config";

let s3Client: S3Client | null = null;

function ensureClient(): S3Client {
  if (!config.S3_BUCKET) {
    throw new Error("S3 is not configured. Provide S3_BUCKET and related credentials.");
  }

  if (s3Client) {
    return s3Client;
  }

  const s3Config: S3ClientConfig = {
    region: config.S3_REGION,
  };

  if (config.S3_ENDPOINT) {
    s3Config.endpoint = config.S3_ENDPOINT;
  }

  if (config.S3_ACCESS_KEY && config.S3_SECRET_KEY) {
    s3Config.credentials = {
      accessKeyId: config.S3_ACCESS_KEY,
      secretAccessKey: config.S3_SECRET_KEY,
    };
  }

  if (config.S3_FORCE_PATH_STYLE) {
    s3Config.forcePathStyle = true;
  }

  s3Client = new S3Client(s3Config);
  return s3Client;
}

export function getPublicUrl(key: string): string {
  if (config.S3_PUBLIC_URL) {
    return `${config.S3_PUBLIC_URL.replace(/\/$/, "")}/${key}`;
  }

  if (config.S3_ENDPOINT) {
    const endpoint = config.S3_ENDPOINT.replace(/\/$/, "");
    if (config.S3_FORCE_PATH_STYLE) {
      return `${endpoint}/${config.S3_BUCKET}/${key}`;
    }
    return `${endpoint}/${key}`;
  }

  return `https://${config.S3_BUCKET}.s3.${config.S3_REGION}.amazonaws.com/${key}`;
}

export async function uploadStreamToS3(key: string, contentType: string, body: Readable) {
  const client = ensureClient();

  const upload = new Upload({
    client,
    params: {
      Bucket: config.S3_BUCKET!,
      Key: key,
      Body: body,
      ContentType: contentType,
    },
  });

  await upload.done();

  return {
    key,
    url: getPublicUrl(key),
  };
}

export async function deleteFromS3(key: string): Promise<void> {
  const client = ensureClient();

  await client.send(
    new DeleteObjectCommand({
      Bucket: config.S3_BUCKET!,
      Key: key,
    })
  );
}
