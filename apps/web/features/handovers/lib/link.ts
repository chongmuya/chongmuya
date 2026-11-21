export function accessToken() {
  return [...crypto.getRandomValues(new Uint8Array(32))]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
export function handoverLink(id: string, token: string) {
  return `${window.location.origin}/group-access?kind=handover&id=${id}#${token}`;
}
