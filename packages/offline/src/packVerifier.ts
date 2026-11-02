import { createHash, createPublicKey, verify as verifySignature } from 'node:crypto';
import { PackManifestSchema, type PackManifest } from './packManifest';

export type PackVerification = { ok: true; manifest: PackManifest; modelSha256: string } | { ok: false; reason: string };

export function verifyPackBundle(input: {
  manifestBytes: Uint8Array;
  signatureBase64: string;
  modelBytes: Uint8Array;
  trustedPublicKeyPem: string;
}): PackVerification {
  try {
    if (!input.trustedPublicKeyPem.trim()) return { ok:false, reason:'No trusted pack signing key is configured.' };
    const manifestText = Buffer.from(input.manifestBytes).toString('utf8');
    const parsed = PackManifestSchema.safeParse(JSON.parse(manifestText));
    if (!parsed.success) return { ok:false, reason:'Pack manifest is invalid.' };
    const signature = Buffer.from(input.signatureBase64.trim(), 'base64');
    if (!signature.length || signature.toString('base64').replace(/=+$/,'') !== input.signatureBase64.trim().replace(/=+$/,'')) {
      return { ok:false, reason:'Pack signature encoding is invalid.' };
    }
    const publicKey = createPublicKey(input.trustedPublicKeyPem);
    if (publicKey.asymmetricKeyType !== 'ed25519') return { ok:false, reason:'Trusted pack key must be Ed25519.' };
    if (!verifySignature(null, Buffer.from(input.manifestBytes), publicKey, signature)) {
      return { ok:false, reason:'Pack signature verification failed.' };
    }
    const modelSha256 = createHash('sha256').update(input.modelBytes).digest('hex');
    if (modelSha256.toLowerCase() !== parsed.data.model.sha256.toLowerCase()) {
      return { ok:false, reason:'Model SHA-256 does not match the signed manifest.' };
    }
    if (input.modelBytes.byteLength !== parsed.data.model.size_bytes) {
      return { ok:false, reason:'Model size does not match the signed manifest.' };
    }
    return { ok:true, manifest:parsed.data, modelSha256 };
  } catch {
    return { ok:false, reason:'Pack verification failed safely. No files should be installed.' };
  }
}
