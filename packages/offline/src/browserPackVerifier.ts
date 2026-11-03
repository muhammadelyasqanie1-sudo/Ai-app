import { PackManifestSchema, type PackManifest } from './packManifest';

export type BrowserPackVerification =
  | { ok:true; manifest:PackManifest; modelSha256:string }
  | { ok:false; reason:string };

function decodeBase64(value:string):Uint8Array {
  const binary=atob(value.trim());
  const bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++) bytes[i]=binary.charCodeAt(i);
  return bytes;
}

/**
 * Browser-side verifier for WebCrypto Ed25519. The trusted key must be raw
 * 32-byte Ed25519 public key encoded as base64. Signature covers exact manifest bytes.
 */
export async function verifyBrowserPack(input:{
  manifestBytes:ArrayBuffer;
  signatureBase64:string;
  modelBytes:ArrayBuffer;
  trustedPublicKeyBase64:string;
}):Promise<BrowserPackVerification>{
  try{
    if(!globalThis.crypto?.subtle) return {ok:false,reason:'WebCrypto is unavailable in this browser.'};
    const manifestText=new TextDecoder().decode(input.manifestBytes);
    const parsed=PackManifestSchema.safeParse(JSON.parse(manifestText));
    if(!parsed.success) return {ok:false,reason:'Pack manifest is invalid.'};
    const publicKeyBytes=decodeBase64(input.trustedPublicKeyBase64);
    const signature=decodeBase64(input.signatureBase64);
    if(publicKeyBytes.byteLength!==32 || signature.byteLength!==64) return {ok:false,reason:'Ed25519 public key or signature has an invalid length.'};
    const key=await crypto.subtle.importKey('raw',publicKeyBytes.buffer as ArrayBuffer,{name:'Ed25519'},false,['verify']);
    const signatureValid=await crypto.subtle.verify({name:'Ed25519'},key,signature.buffer as ArrayBuffer,input.manifestBytes);
    if(!signatureValid) return {ok:false,reason:'Pack signature verification failed.'};
    const digest=await crypto.subtle.digest('SHA-256',input.modelBytes);
    const modelSha256=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
    if(modelSha256.toLowerCase()!==parsed.data.model.sha256.toLowerCase()) return {ok:false,reason:'Model SHA-256 does not match the signed manifest.'};
    if(input.modelBytes.byteLength!==parsed.data.model.size_bytes) return {ok:false,reason:'Model size does not match the signed manifest.'};
    return {ok:true,manifest:parsed.data,modelSha256};
  }catch{return {ok:false,reason:'Browser pack verification failed safely. No files should be installed.'};}
}
