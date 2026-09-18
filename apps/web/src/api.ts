const SESSION_KEY = 'loomplane.session.credential';
let volatileToken = '';
export function sessionToken() {
  try {
    return sessionStorage.getItem(SESSION_KEY) || volatileToken;
  } catch {
    return volatileToken;
  }
}
export function setSessionToken(token: string) {
  volatileToken = token;
  try {
    sessionStorage.setItem(SESSION_KEY, token);
  } catch {
    /* Private browser modes may disallow storage; keep this tab's token in memory. */
  }
}
export function clearSessionToken() {
  volatileToken = '';
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* Storage unavailable. */
  }
}
function headers(body?: unknown) {
  const value: Record<string, string> = {};
  if (body !== undefined) value['Content-Type'] = 'application/json';
  const token = sessionToken();
  if (token) value.Authorization = `Bearer ${token}`;
  return value;
}
function unauthorized(response: Response) {
  if (response.status === 401) window.dispatchEvent(new Event('loomplane:unauthorized'));
}
export async function api<T>(
  path: string,
  body?: unknown,
  method?: string,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    signal,
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    headers: headers(body),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  unauthorized(response);
  const data = await response
    .json()
    .catch(() => ({ error: 'The server returned an unreadable response.' }));
  if (!response.ok) throw new Error(data.error ?? `Request failed (${response.status}).`);
  return data as T;
}
/** Fetch-based SSE keeps bearer credentials out of query strings. */
export function subscribeChanges(onChange: () => void, onConnection: (connected: boolean) => void) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  async function connect() {
    try {
      const response = await fetch('/api/changes', {
        headers: headers(),
        signal: controller.signal,
      });
      unauthorized(response);
      if (!response.ok || !response.body) throw new Error('Change stream unavailable');
      onConnection(true);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (!stopped) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
        let end: number;
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const event = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          if (/^event:\s*change\s*$/m.test(event)) onChange();
        }
      }
    } catch {
      /* Reconnect below unless the subscriber has closed. */
    }
    if (!stopped) {
      onConnection(false);
      timer = setTimeout(() => void connect(), 3000);
    }
  }
  void connect();
  return () => {
    stopped = true;
    controller.abort();
    if (timer) clearTimeout(timer);
  };
}
export function download(name: string, content: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function dateLabel(value: string) {
  const date = new Date(value);
  const delta = Date.now() - date.getTime();
  if (delta < 60000) return 'just now';
  if (delta < 3600000) return `${Math.floor(delta / 60000)}m ago`;
  if (delta < 86400000) return `${Math.floor(delta / 3600000)}h ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
