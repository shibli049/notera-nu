// Shared gzip+base64 helpers for the sync backends. Uses the native
// CompressionStream/DecompressionStream APIs (available in MV3 service
// workers) so no bundler or third-party library is needed.

async function notaGzipToBase64(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  const compressedStream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  const compressedBuf = await new Response(compressedStream).arrayBuffer();
  return notaBufToBase64(compressedBuf);
}

async function notaGunzipFromBase64(base64Str) {
  const buf = notaBase64ToBuf(base64Str);
  const decompressedStream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
  const decompressedBuf = await new Response(decompressedStream).arrayBuffer();
  return JSON.parse(new TextDecoder().decode(decompressedBuf));
}

function notaBufToBase64(buf) {
  let binary = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function notaBase64ToBuf(str) {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

self.NotaCompression = {
  gzipToBase64: notaGzipToBase64,
  gunzipFromBase64: notaGunzipFromBase64,
};
