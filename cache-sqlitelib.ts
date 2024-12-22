import { Database } from "@db/sqlite";

console.log("Caching sqlite lib...");

const db = new Database("./database/store.db");

const rows = db.prepare("SELECT sqlite_version()").value<[string]>();

if (!rows) throw new Error("Blank version row...");

const version = rows[0];

console.log(`sqlite version: ${version}`);

db.close();
