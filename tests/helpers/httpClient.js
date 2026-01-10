import { PassThrough } from "stream";
import { IncomingMessage, ServerResponse } from "http";

function normalizeHeaders(headers = {}) {
  const normalized = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined || value === null) continue;
    normalized[key.toLowerCase()] = String(value);
  }
  return normalized;
}

export async function httpRequest(app, { method = "GET", path = "/", headers = {}, body } = {}) {
  const normalizedHeaders = normalizeHeaders(headers);
  const reqSocket = new PassThrough();
  reqSocket.remoteAddress = "127.0.0.1";
  reqSocket.readable = true;
  reqSocket.writable = true;
  const req = new IncomingMessage(reqSocket);
  req.method = method;
  req.url = path;
  req.headers = normalizedHeaders;

  const resSocket = new PassThrough();
  const res = new ServerResponse(req);
  res.assignSocket(resSocket);

  const chunks = [];
  resSocket.on("data", (chunk) => chunks.push(chunk));

  const finished = new Promise((resolve, reject) => {
    res.on("finish", () => {
      const raw = Buffer.concat(chunks).toString();
      const separator = "\r\n\r\n";
      const text = raw.includes(separator) ? raw.slice(raw.indexOf(separator) + separator.length) : raw;
      res.detachSocket(resSocket);
      resolve({
        status: res.statusCode,
        headers: res.getHeaders(),
        text,
        json: () => (text ? JSON.parse(text) : null)
      });
    });
    res.on("error", reject);
  });

  const payload =
    body !== undefined ? (typeof body === "string" ? body : JSON.stringify(body)) : null;
  if (payload) {
    if (!normalizedHeaders["content-type"]) {
      normalizedHeaders["content-type"] = "application/json";
    }
    normalizedHeaders["content-length"] = Buffer.byteLength(payload).toString();
    req.rawBody = Buffer.from(payload);
  } else {
    req.rawBody = Buffer.alloc(0);
  }

  process.nextTick(() => {
    if (payload) {
      req.push(Buffer.from(payload));
    }
    req.push(null);
  });

  app.handle(req, res);
  return finished;
}
