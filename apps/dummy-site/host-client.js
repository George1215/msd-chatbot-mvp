let csrf;
export async function host(path, method = "GET", body) {
  const response = await fetch("/host-api" + path, {
    method,
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
      ...(csrf ? { "x-csrf-token": csrf } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(12000),
  });
  const data = await response.json();
  if (!response.ok) {
    const error = Error(data.error || "Host request failed");
    error.status = response.status;
    throw error;
  }
  if (data.csrfToken) csrf = data.csrfToken;
  if (path === "/logout") csrf = undefined;
  return data;
}
