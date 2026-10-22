// Client-side MHTML renderer.
// Chrome refuses to render MHTML that isn't loaded from file://, so to view archives inside
// the extension we parse the MIME multipart ourselves, turn every resource into a blob: URL,
// rewrite references (Content-Location / cid:) in CSS + HTML, and return the main document URL.

interface MhtmlPart {
  type: string;
  charset: string;
  location?: string;
  cid?: string;
  bytes: Uint8Array;
}

export interface RenderedMhtml {
  mainUrl: string;
  title?: string;
  snapshotUrl?: string;
  snapshotDate?: string;
  resourceCount: number;
  revoke: () => void;
}

function bytesToLatin1(bytes: Uint8Array): string {
  let out = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as unknown as number[]);
  }
  return out;
}

function latin1ToBytes(str: string): Uint8Array {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 0xff;
  return out;
}

function parseHeaders(block: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const unfolded = block.replace(/\r?\n[ \t]+/g, " ");
  for (const line of unfolded.split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx > 0) headers[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
  }
  return headers;
}

function headerParam(value: string, name: string): string | undefined {
  const m = value.match(new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|([^;\\s]+))`, "i"));
  return m ? m[1] ?? m[2] : undefined;
}

function splitHeaderBody(raw: string): [string, string] {
  const m = raw.match(/\r?\n\r?\n/);
  if (!m || m.index === undefined) return [raw, ""];
  return [raw.slice(0, m.index), raw.slice(m.index + m[0].length)];
}

function decodeQuotedPrintable(body: string): Uint8Array {
  const cleaned = body.replace(/=\r?\n/g, "");
  const out = new Uint8Array(cleaned.length);
  let n = 0;
  for (let i = 0; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (c === "=" && i + 2 < cleaned.length + 1 && /^[0-9A-Fa-f]{2}$/.test(cleaned.substr(i + 1, 2))) {
      out[n++] = parseInt(cleaned.substr(i + 1, 2), 16);
      i += 2;
    } else {
      out[n++] = cleaned.charCodeAt(i) & 0xff;
    }
  }
  return out.subarray(0, n);
}

function decodeBase64(body: string): Uint8Array {
  try {
    return latin1ToBytes(atob(body.replace(/[^A-Za-z0-9+/=]/g, "")));
  } catch {
    return new Uint8Array();
  }
}

function decodeText(bytes: Uint8Array, charset: string): string {
  try {
    return new TextDecoder(charset || "utf-8").decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseParts(text: string): { parts: MhtmlPart[]; root: Record<string, string> } {
  const [rootHeaderBlock, rootBody] = splitHeaderBody(text);
  const root = parseHeaders(rootHeaderBlock);
  const boundary = headerParam(root["content-type"] || "", "boundary");
  if (!boundary) throw new Error("Invalid MHTML: missing multipart boundary");

  const parts: MhtmlPart[] = [];
  const segments = rootBody.split(`--${boundary}`);
  for (let i = 1; i < segments.length; i++) {
    let seg = segments[i];
    if (seg.startsWith("--")) break; // closing boundary
    seg = seg.replace(/^\r?\n/, "");
    const [hb, body] = splitHeaderBody(seg);
    const h = parseHeaders(hb);
    const ct = h["content-type"] || "application/octet-stream";
    const encoding = (h["content-transfer-encoding"] || "").toLowerCase();
    const trimmedBody = body.replace(/\r?\n$/, "");
    const bytes =
      encoding === "base64"
        ? decodeBase64(trimmedBody)
        : encoding === "quoted-printable"
        ? decodeQuotedPrintable(trimmedBody)
        : latin1ToBytes(trimmedBody);

    parts.push({
      type: ct.split(";")[0].trim().toLowerCase(),
      charset: (headerParam(ct, "charset") || "utf-8").toLowerCase(),
      location: h["content-location"],
      cid: h["content-id"]?.replace(/^<|>$/g, ""),
      bytes,
    });
  }
  return { parts, root };
}

export async function renderMhtml(blob: Blob): Promise<RenderedMhtml> {
  const text = bytesToLatin1(new Uint8Array(await blob.arrayBuffer()));
  const { parts, root } = parseParts(text);
  if (!parts.length) throw new Error("MHTML archive contains no parts");

  const created: string[] = [];
  const urlMap = new Map<string, string>();

  const register = (part: MhtmlPart, url: string) => {
    const keys: string[] = [];
    if (part.location) keys.push(part.location);
    if (part.cid) keys.push(`cid:${part.cid}`);
    for (const k of keys) {
      urlMap.set(k, url);
      if (k.includes("&")) urlMap.set(k.replace(/&/g, "&amp;"), url);
    }
  };

  const makeUrl = (data: BlobPart, type: string) => {
    const url = URL.createObjectURL(new Blob([data], { type }));
    created.push(url);
    return url;
  };

  const rewrite = (content: string) => {
    if (!urlMap.size) return content;
    const keys = Array.from(urlMap.keys()).sort((a, b) => b.length - a.length);
    const re = new RegExp(keys.map(escapeRegex).join("|"), "g");
    return content.replace(re, (m) => urlMap.get(m) || m);
  };

  const isHtml = (p: MhtmlPart) => p.type === "text/html" || p.type === "application/xhtml+xml";
  const isCss = (p: MhtmlPart) => p.type === "text/css";

  // 1. Binary / non-rewritable resources (images, fonts, etc.)
  for (const p of parts) {
    if (!isHtml(p) && !isCss(p)) register(p, makeUrl(p.bytes as BlobPart, p.type));
  }

  // 2. Stylesheets (reverse so @imported sheets, which appear later, are resolved first)
  for (const p of [...parts].reverse()) {
    if (!isCss(p)) continue;
    const css = rewrite(decodeText(p.bytes, p.charset));
    register(p, makeUrl(css, "text/css;charset=utf-8"));
  }

  // 3. HTML documents (reverse so nested sub-frames are resolved before their parents)
  const htmlParts = parts.filter(isHtml);
  const mainPart = htmlParts[0] || parts[0];
  let mainUrl = "";
  let title: string | undefined;

  for (const p of [...htmlParts].reverse()) {
    let html = rewrite(decodeText(p.bytes, p.charset));
    if (p === mainPart) {
      title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim();
      // Make links open in a new tab instead of navigating the sandboxed viewer
      html = /<head[^>]*>/i.test(html)
        ? html.replace(/<head[^>]*>/i, (m) => `${m}<base target="_blank">`)
        : `<base target="_blank">${html}`;
    }
    const url = makeUrl(html, "text/html;charset=utf-8");
    register(p, url);
    if (p === mainPart) mainUrl = url;
  }

  if (!mainUrl) mainUrl = makeUrl(mainPart.bytes as BlobPart, mainPart.type);

  return {
    mainUrl,
    title,
    snapshotUrl: root["snapshot-content-location"],
    snapshotDate: root["date"],
    resourceCount: parts.length,
    revoke: () => created.forEach((u) => URL.revokeObjectURL(u)),
  };
}
