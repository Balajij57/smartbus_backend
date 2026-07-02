# SmartBUS Backend

Express.js backend with a file-based JSON database (`db.json`, auto-created on first run).

## Run

```bash
npm install
npm start          # production
npm run dev        # auto-reload (requires nodemon)
```

Server runs on `http://localhost:5000`.

## Storage

All data is persisted to `backend/db.json` — the file is created and seeded the first time you start the server. Delete it to reset to defaults.

To migrate to a real database (MongoDB / PostgreSQL), replace the `loadDB()` and `saveDB()` helpers in `server.js`.

## API

See the main project [README](../README.md) for the full endpoint list.
