import { Database } from "@db/sqlite";

console.log("Caching sqlite lib...");

const db = new Database("./database/store.db");

// biome-ignore lint/style/noNonNullAssertion: <explanation>
const [version] = db.prepare("SELECT sqlite_version()").value<[string]>()!;

console.log(`sqlite version: ${version}`);

db.close();
