// Huella rápida: SHA-256 de los primeros y últimos 1 MB + tamaño. Requiere contexto seguro (HTTPS o localhost).
export async function fingerprint(file: File) {
  const CH = 1 << 20;
  const blob = new Blob([file.slice(0, CH), file.slice(Math.max(0, file.size - CH)), String(file.size)]);
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
