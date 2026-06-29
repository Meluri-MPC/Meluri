const VELUMX_API = process.env.VELUMX_API_URL || 'http://localhost:4002/api/v1';

export async function velumxApi(path: string, options: RequestInit = {}) {
  const token = await getClerkToken();
  const res = await fetch(`${VELUMX_API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers as Record<string, string> || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error((err as any).message || 'API request failed');
  }
  return res.json();
}

async function getClerkToken(): Promise<string | null> {
  try {
    const { auth } = await import('@clerk/nextjs/server');
    const { getToken } = await auth();
    return getToken();
  } catch {
    return null;
  }
}
