export function getTursoConfig() {
  const url = process.env.TURSO_DATABASE_URL?.trim();
  const authToken = process.env.TURSO_AUTH_TOKEN?.trim();

  if (!url) {
    throw new Error(
      "Missing TURSO_DATABASE_URL. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN before starting the app.",
    );
  }

  if (!authToken) {
    throw new Error(
      "Missing TURSO_AUTH_TOKEN. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN before starting the app.",
    );
  }

  return { url, authToken };
}

export function getTursoHost() {
  const { url } = getTursoConfig();

  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function getMaskedTursoHost() {
  const host = getTursoHost();
  const [subdomain, ...rest] = host.split(".");

  if (!subdomain || rest.length === 0) {
    return maskSegment(host);
  }

  return `${maskSegment(subdomain)}.${rest.join(".")}`;
}

function maskSegment(value: string) {
  if (value.length <= 4) {
    return `${value.slice(0, 1)}***${value.slice(-1)}`;
  }

  return `${value.slice(0, 3)}***${value.slice(-2)}`;
}
