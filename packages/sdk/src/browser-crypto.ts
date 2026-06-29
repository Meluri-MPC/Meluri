const getRandomValues =
  typeof crypto !== 'undefined' && crypto.getRandomValues
    ? (size: number) => crypto.getRandomValues(new Uint8Array(size))
    : (size: number) => {
        const arr = new Uint8Array(size);
        for (let i = 0; i < size; i++) arr[i] = Math.floor(Math.random() * 256);
        return arr;
      };

async function sha256Digest(data: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const hash = await crypto.subtle.digest('SHA-256', encoder.encode(data));
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(64, '0');
}

function randomHex(size: number): string {
  const bytes = getRandomValues(size);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export const browserCrypto = {
  randomBytes: (size: number): Buffer => Buffer.from(getRandomValues(size)),
  randomHex,
  sha256Digest,
};
