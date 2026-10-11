import http from "node:http";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4173);
const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRESQL_URL;
const pool = new Pool({
  connectionString: databaseUrl,
  ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined,
});

const databaseSchema = `
  CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY,
    title TEXT NOT NULL CHECK (length(trim(title)) > 0),
    details TEXT NOT NULL DEFAULT '',
    due_date TIMESTAMP NULL,
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS tasks_archived_created_at_idx ON tasks (archived, created_at);
  CREATE INDEX IF NOT EXISTS tasks_due_date_idx ON tasks (due_date);
`;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function sendJson(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function sendError(response, status, message) { sendJson(response, status, { error: message }); }

function dateTimeValue(value) {
  if (!value) return "";
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}T${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
  }
  const match = String(value).replace(" ", "T").match(/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?/);
  return match ? match[0] : "";
}

function taskFromRow(row) {
  return {
    id: row.id,
    title: row.title,
    details: row.details,
    dueDate: dateTimeValue(row.due_date),
    archived: row.archived,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 1_000_000) throw new Error("Request body is too large");
  }
  if (!body) return {};
  return JSON.parse(body);
}

function validateTaskInput(body, partial = false) {
  const result = {};
  if (!partial || Object.hasOwn(body, "title")) {
    if (typeof body.title !== "string" || !body.title.trim()) throw new Error("Title is required");
    result.title = body.title.trim();
  }
  if (!partial || Object.hasOwn(body, "details")) {
    if (body.details !== undefined && typeof body.details !== "string") throw new Error("Details must be text");
    result.details = String(body.details || "").trim();
  }
  if (!partial || Object.hasOwn(body, "dueDate")) {
    if (body.dueDate !== undefined && body.dueDate !== "" && body.dueDate !== null && !/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(String(body.dueDate))) throw new Error("Due date must be YYYY-MM-DD or YYYY-MM-DDTHH:mm");
    result.dueDate = body.dueDate || null;
  }
  if (Object.hasOwn(body, "archived")) {
    if (typeof body.archived !== "boolean") throw new Error("Archived must be boolean");
    result.archived = body.archived;
  }
  return result;
}

async function handleApi(request, response, url) {
  const parts = url.pathname.split("/").filter(Boolean);
  const id = parts[2];
  if (parts[0] !== "api" || parts[1] !== "tasks" || (id && parts.length !== 3)) return false;
  if (!databaseUrl) return sendError(response, 503, "DATABASE_URL is not configured on the server");

  try {
    if (request.method === "GET" && !id) {
      const { rows } = await pool.query("SELECT * FROM tasks ORDER BY created_at ASC");
      return sendJson(response, 200, rows.map(taskFromRow));
    }

    if (request.method === "POST" && !id) {
      const input = validateTaskInput(await readJson(request));
      const { rows } = await pool.query(
        "INSERT INTO tasks (id, title, details, due_date) VALUES ($1, $2, $3, $4) RETURNING *",
        [randomUUID(), input.title, input.details, input.dueDate],
      );
      return sendJson(response, 201, taskFromRow(rows[0]));
    }

    if (request.method === "PATCH" && id) {
      const input = validateTaskInput(await readJson(request), true);
      const fields = [];
      const values = [];
      for (const [key, value] of Object.entries(input)) {
        fields.push(`${{ title: "title", details: "details", dueDate: "due_date", archived: "archived" }[key]} = $${values.length + 1}`);
        values.push(value);
      }
      if (!fields.length) return sendError(response, 400, "No fields to update");
      values.push(id);
      const { rows } = await pool.query(`UPDATE tasks SET ${fields.join(", ")}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`, values);
      if (!rows[0]) return sendError(response, 404, "Task not found");
      return sendJson(response, 200, taskFromRow(rows[0]));
    }

    if (request.method === "DELETE" && id) {
      const result = await pool.query("DELETE FROM tasks WHERE id = $1", [id]);
      if (!result.rowCount) return sendError(response, 404, "Task not found");
      response.writeHead(204);
      return response.end();
    }

    return sendError(response, 405, "Method not allowed");
  } catch (error) {
    if (error instanceof SyntaxError || error.message.includes("required") || error.message.includes("must be") || error.message.includes("too large")) return sendError(response, 400, error.message);
    console.error(error);
    return sendError(response, 500, "Database request failed");
  }
}

async function serveStatic(response, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.resolve(__dirname, `.${requested}`);
  if (!filePath.startsWith(__dirname) || filePath.includes("..")) return sendError(response, 403, "Forbidden");
  try {
    const content = await fs.readFile(filePath);
    response.writeHead(200, { "content-type": mimeTypes[path.extname(filePath)] || "application/octet-stream" });
    response.end(content);
  } catch {
    sendError(response, 404, "Not found");
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  if (url.pathname === "/health") return sendJson(response, 200, { ok: true });
  if (url.pathname.startsWith("/api/")) return handleApi(request, response, url);
  if (request.method !== "GET" && request.method !== "HEAD") return sendError(response, 405, "Method not allowed");
  return serveStatic(response, url.pathname);
});

async function start() {
  if (databaseUrl) {
    if (/[=:]\/\/(host|user|password)(:|@)/i.test(databaseUrl)) {
      throw new Error("DATABASE_URL still contains placeholder values. Replace host, user, and password with your real PostgreSQL connection details.");
    }
    await pool.query(databaseSchema);
    await pool.query("ALTER TABLE tasks ALTER COLUMN due_date TYPE TIMESTAMP USING due_date::timestamp");
    console.log("PostgreSQL schema is ready");
  } else {
    console.warn("DATABASE_URL is not set; API requests will not have database access");
  }
  server.listen(port, "0.0.0.0", () => console.log(`Task app listening on port ${port}`));
}

start().catch((error) => {
  console.error("Could not initialize PostgreSQL:", error.message);
  process.exitCode = 1;
});
