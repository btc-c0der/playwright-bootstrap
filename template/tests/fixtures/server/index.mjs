// Minimal, dependency-free local server for the example suite: serves the demo
// todo app and a tiny mock API (test-users/test-auth/posts). Exists so the
// example specs (web/api/mobile + the auth/dataFactory fixtures) are fully
// self-contained and deterministic in CI — no external site or database
// dependency, no flakiness from third-party availability.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.QAF_DEMO_SERVER_PORT ?? 4319);

/** @type {Map<string, {id: string, email: string, password: string, displayName: string, roles: string[]}>} */
const users = new Map();
/** @type {Map<number, {id: number, title: string, body: string}>} */
const posts = new Map([[1, { id: 1, title: "Hello world", body: "First post" }]]);
let nextPostId = 2;

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  try {
    if (req.method === "GET" && url.pathname === "/health") {
      return json(res, 200, { ok: true });
    }

    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/todo")) {
      const html = await readFile(path.join(HERE, "..", "todo-app.html"), "utf-8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(html);
    }

    if (req.method === "POST" && url.pathname === "/api/test-users") {
      const body = await readBody(req);
      const id = crypto.randomUUID();
      const user = {
        id,
        email: body.email,
        password: crypto.randomBytes(8).toString("hex"),
        displayName: body.displayName,
        roles: body.roles ?? ["member"],
      };
      users.set(id, user);
      return json(res, 201, { id, password: user.password });
    }

    const deleteUserMatch = url.pathname.match(/^\/api\/test-users\/([^/]+)$/);
    if (req.method === "DELETE" && deleteUserMatch) {
      const id = deleteUserMatch[1];
      const existed = users.delete(id);
      return json(res, existed ? 200 : 404, { deleted: existed });
    }

    if (req.method === "POST" && url.pathname === "/api/test-auth/session") {
      const body = await readBody(req);
      const user = [...users.values()].find((u) => u.email === body.email && u.password === body.password);
      if (!user) return json(res, 401, { error: "invalid credentials" });
      return json(res, 200, {
        cookies: [{ name: "qaf_session", value: user.id, domain: "localhost", path: "/" }],
        localStorage: { qaf_user_email: user.email },
      });
    }

    if (req.method === "GET" && url.pathname === "/api/posts") {
      return json(res, 200, [...posts.values()]);
    }

    if (req.method === "POST" && url.pathname === "/api/posts") {
      const body = await readBody(req);
      const post = { id: nextPostId++, title: body.title, body: body.body };
      posts.set(post.id, post);
      return json(res, 201, post);
    }

    const postMatch = url.pathname.match(/^\/api\/posts\/(\d+)$/);
    if (req.method === "GET" && postMatch) {
      const post = posts.get(Number(postMatch[1]));
      return post ? json(res, 200, post) : json(res, 404, { error: "not found" });
    }
    if (req.method === "DELETE" && postMatch) {
      const existed = posts.delete(Number(postMatch[1]));
      return json(res, existed ? 200 : 404, { deleted: existed });
    }

    json(res, 404, { error: "not found" });
  } catch (error) {
    json(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(PORT, () => {
  process.stdout.write(`QAF demo server listening on http://localhost:${PORT}\n`);
});
