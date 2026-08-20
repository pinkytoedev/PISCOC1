import { QueryClient, QueryFunction } from "@tanstack/react-query";

const CSRF_COOKIE = "csrf_token";
const CSRF_HEADER = "x-csrf-token";

/**
 * Reads the CSRF token the server sets as a readable cookie. It has to be
 * echoed back in a header on every state-changing request — an attacker's page
 * can cause the cookie to be sent but cannot read it to build this header.
 */
function csrfToken(): string | undefined {
  return document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${CSRF_COOKIE}=`))
    ?.split("=")[1];
}

/** Adds the CSRF header to anything that is not a safe method. */
export function withCsrf(method: string, headers: Record<string, string> = {}) {
  if (["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())) return headers;
  const token = csrfToken();
  return token ? { ...headers, [CSRF_HEADER]: token } : headers;
}

async function throwIfResNotOk(res: Response) {
  if (res.ok) return;

  // Errors are JSON `{ message }`; fall back to raw text for non-API failures
  // such as a proxy error page.
  const text = await res.text();
  let message = text || res.statusText;
  try {
    const parsed = JSON.parse(text);
    if (parsed?.message) message = parsed.message;
  } catch {
    // Not JSON — keep the raw text.
  }
  throw new Error(message);
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: withCsrf(method, data ? { "Content-Type": "application/json" } : {}),
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

/** Multipart uploads set their own Content-Type, so only the CSRF header is added. */
export async function apiUpload(url: string, body: FormData): Promise<Response> {
  const res = await fetch(url, {
    method: "POST",
    headers: withCsrf("POST"),
    body,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey[0] as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
