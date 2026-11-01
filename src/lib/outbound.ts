import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";
import { Agent, fetch as request } from "undici";

export function publicAddress(address: string) {
  try {
    return ipaddr.process(address).range() === "unicast";
  } catch {
    return false;
  }
}
export function validateOutboundUrl(input: string) {
  const url = new URL(input);
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const exceptions = (process.env.DOCUMENTALIST_PRIVATE_HOSTS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const trusted = exceptions.includes(host);
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("URL distante non autorisée.");
  if (!trusted && url.port && !["80", "443"].includes(url.port))
    throw new Error("Port distant non autorisé.");
  if (
    !trusted &&
    (host === "localhost" ||
      host.endsWith(".localhost") ||
      (isIP(host) && !publicAddress(host)))
  )
    throw new Error("Les adresses internes sont interdites.");
  return { url, host, trusted };
}

export async function safeFetch(
  input: string,
  init: RequestInit = {},
  maxBytes = 5_000_000,
): Promise<Response> {
  const { url, trusted } = validateOutboundUrl(input);
  const agent = new Agent({
    connect: {
      lookup: (hostname, options, callback) => {
        lookup(hostname, { all: true })
          .then((addresses) => {
            if (
              !addresses.length ||
              (!trusted && addresses.some((a) => !publicAddress(a.address)))
            )
              throw new Error("Adresse réseau interne refusée.");
            if (options.all) callback(null, addresses);
            else callback(null, addresses[0].address, addresses[0].family);
          })
          .catch((error) => callback(error, "", 0));
      },
    },
  });
  try {
    const response = await request(url, {
      method: init.method,
      headers: init.headers as Record<string, string>,
      body: init.body as string | undefined,
      dispatcher: agent,
      redirect: "error",
      signal: AbortSignal.any([
        AbortSignal.timeout(20_000),
        ...(init.signal ? [init.signal] : []),
      ]),
    });
    if (Number(response.headers.get("content-length")) > maxBytes)
      throw new Error("Réponse distante trop volumineuse.");
    const parts: Uint8Array[] = [];
    let size = 0;
    if (response.body)
      for await (const part of response.body) {
        size += part.length;
        if (size > maxBytes)
          throw new Error("Réponse distante trop volumineuse.");
        parts.push(part);
      }
    return new Response(
      [204, 205, 304].includes(response.status) ? null : Buffer.concat(parts),
      {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
      },
    );
  } finally {
    await agent.destroy();
  }
}
