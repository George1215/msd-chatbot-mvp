// HTTPS edge for the local production simulation. Only compiled assets are served.
import https from "node:https";
import http from "node:http";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../dist/apps/", import.meta.url));
const widget = fileURLToPath(
  new URL("../packages/widget/dist/chat-msd-widget.js", import.meta.url),
);
const port = Number(process.env.EDGE_PORT || 4443);
const apiPort = Number(process.env.PORT || 4400),
  hostPort = Number(process.env.HOST_PORT || 4404);
if (!process.env.TLS_CERT || !process.env.TLS_KEY)
  throw Error("TLS_CERT and TLS_KEY required");
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};
const upstream = (url) =>
  /^\/(api\/|socket\.io\/|health(?:\?|$)|ready(?:\?|$))/.test(url)
    ? apiPort
    : url.startsWith("/host-api/")
      ? hostPort
      : null;
function headers(req) {
  const result = {
    ...req.headers,
    "x-forwarded-for": req.socket.remoteAddress,
    "x-forwarded-proto": "https",
  };
  delete result.forwarded;
  return result;
}
const server = https.createServer(
  {
    cert: fs.readFileSync(process.env.TLS_CERT),
    key: fs.readFileSync(process.env.TLS_KEY),
    minVersion: "TLSv1.2",
  },
  (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Strict-Transport-Security", "max-age=31536000");
    const target = upstream(req.url);
    if (target) {
      const proxy = http.request(
        {
          hostname: "127.0.0.1",
          port: target,
          path: req.url,
          method: req.method,
          headers: headers(req),
          timeout: 30000,
        },
        (response) => {
          res.writeHead(response.statusCode, response.headers);
          response.pipe(res);
        },
      );
      proxy.on("timeout", () => proxy.destroy());
      proxy.on("error", () => {
        if (!res.headersSent) res.writeHead(502);
        res.end("Service unavailable");
      });
      req.on("aborted", () => proxy.destroy());
      req.pipe(proxy);
      return;
    }
    if (!["GET", "HEAD"].includes(req.method)) {
      res.writeHead(405);
      res.end();
      return;
    }
    let pathname;
    try {
      pathname = decodeURIComponent(
        new URL(req.url, "https://localhost").pathname,
      );
    } catch {
      res.writeHead(400);
      res.end();
      return;
    }
    if (pathname === "/") {
      res.writeHead(302, { Location: "/apps/admin/" });
      res.end();
      return;
    }
    const file =
      pathname === "/chat-msd-widget.js"
        ? widget
        : path.resolve(
            root,
            "." + pathname + (pathname.endsWith("/") ? "index.html" : ""),
          );
    if (
      (file !== widget && !file.startsWith(root)) ||
      pathname.split("/").some((p) => p.startsWith(".")) ||
      !mime[path.extname(file)]
    ) {
      res.writeHead(404);
      res.end();
      return;
    }
    try {
      if (!fs.statSync(file).isFile()) throw Error();
      res.setHeader("Content-Type", mime[path.extname(file)]);
      res.setHeader(
        "Cache-Control",
        pathname.startsWith("/assets/")
          ? "public, max-age=31536000, immutable"
          : "no-cache",
      );
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' wss:; img-src 'self' data: blob:; media-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      );
      if (req.method === "HEAD") res.end();
      else fs.createReadStream(file).pipe(res);
    } catch {
      res.writeHead(404);
      res.end();
    }
  },
);
const sockets = new Set();
server.on("connection", (socket) => {
  sockets.add(socket);
  socket.on("close", () => sockets.delete(socket));
});
server.on("upgrade", (req, socket, head) => {
  if (!req.url.startsWith("/socket.io/")) {
    socket.destroy();
    return;
  }
  const remote = net.connect(apiPort, "127.0.0.1", () => {
    remote.write(
      `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n` +
        Object.entries(headers(req))
          .map(([key, value]) => `${key}: ${value}`)
          .join("\r\n") +
        "\r\n\r\n",
    );
    if (head.length) remote.write(head);
    socket.pipe(remote).pipe(socket);
  });
  remote.on("error", () => socket.destroy());
  socket.on("error", () => remote.destroy());
  socket.on("close", () => remote.destroy());
});
server.listen(port, "127.0.0.1", () =>
  console.log(`Production simulation edge: https://localhost:${port}`),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => {
    for (const socket of sockets) socket.destroy();
    server.close(() => process.exit(0));
  });
