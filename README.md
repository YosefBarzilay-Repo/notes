# Minimal Hebrew Tasks

Vanilla HTML/CSS/JavaScript task app with a Node.js HTTP server and PostgreSQL persistence.

## Run

### Local PostgreSQL on Windows

PostgreSQL must be installed and running. The server creates the table automatically inside the database named in your URL.

```powershell
$env:DATABASE_URL = "postgresql://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/postgres"
npm start
```

Replace `YOUR_POSTGRES_PASSWORD` with the password chosen during PostgreSQL installation. PostgreSQL is already installed on the current machine; the `psql` executable is at `C:\Program Files\PostgreSQL\18\bin\psql.exe`, but it is not required to run the app.

### Railway

Create a PostgreSQL service in the Railway project and attach/reference it from the app service:

1. Open the Railway project.
2. Add a **PostgreSQL** service if one does not exist.
3. Open the app service → **Variables**.
4. Add a variable named `DATABASE_URL`.
5. Use Railway’s **Add Reference** option and select the PostgreSQL service’s `DATABASE_URL` value. It may appear as a reference such as `${{Postgres.DATABASE_URL}}`; choose it from the UI rather than typing the service name manually.
6. Redeploy the app service.

The deployment log should then show `PostgreSQL schema is ready` instead of `DATABASE_URL is not set`. Do not commit a database URL into the repository.

Set the app service start command to:

```text
npm start
```

If the Railway PostgreSQL connection requires TLS, add this variable to the app service:

```text
PGSSL=true
```

For a manually configured connection, the format is:

```powershell
$env:DATABASE_URL = "postgresql://user:password@host:5432/tasks"
```

The server creates the table and indexes automatically when it starts. `schema.sql` is also included if you prefer to run migrations through your provider's SQL console. The server serves the app and API at `http://localhost:4173` by default. Set `PORT` to change it.

## API

- `GET /api/tasks` — read all tasks.
- `POST /api/tasks` — create a task with `{ "title", "details", "dueDate" }`.
- `PATCH /api/tasks/:id` — update any of `title`, `details`, `dueDate`, or `archived`.
- `DELETE /api/tasks/:id` — permanently delete a task.

The task list and task edits are saved in PostgreSQL. The browser only keeps the selected sort mode in `localStorage`; task data is no longer stored there.
