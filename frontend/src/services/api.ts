const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '/api';

export async function apiRequest<T>(
  path: string,
  init?: RequestInit,
  token?: string | null,
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || '请求失败');
  }

  return response.json() as Promise<T>;
}
