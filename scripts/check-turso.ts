import { createClient } from "@libsql/client";
import { loadEnvConfig } from "@next/env";

import { getTursoConfig, getTursoHost } from "../lib/db/turso-config";

type HealthRow = {
  transactionCount: number;
  accountCount: number;
  importCount: number;
  minClearDate: string | null;
  maxClearDate: string | null;
  minTransactionDate: string | null;
  maxTransactionDate: string | null;
};

async function main() {
  loadEnvConfig(process.cwd());

  const { url, authToken } = getTursoConfig();
  const client = createClient({ url, authToken });

  const result = await client.execute(`SELECT
    (SELECT COUNT(*) FROM transactions) as transactionCount,
    (SELECT COUNT(*) FROM accounts) as accountCount,
    (SELECT COUNT(*) FROM imports) as importCount,
    (SELECT MIN(clear_date) FROM transactions) as minClearDate,
    (SELECT MAX(clear_date) FROM transactions) as maxClearDate,
    (SELECT MIN(transaction_date) FROM transactions) as minTransactionDate,
    (SELECT MAX(transaction_date) FROM transactions) as maxTransactionDate`);

  const row = (result.rows[0] ?? {}) as unknown as HealthRow;

  console.log(`Turso host: ${getTursoHost()}`);
  console.log(`Transactions: ${row.transactionCount ?? 0}`);
  console.log(`Accounts: ${row.accountCount ?? 0}`);
  console.log(`Imports: ${row.importCount ?? 0}`);
  console.log(`Clear Date: ${row.minClearDate ?? "None"} -> ${row.maxClearDate ?? "None"}`);
  console.log(
    `Transaction Date: ${row.minTransactionDate ?? "None"} -> ${row.maxTransactionDate ?? "None"}`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
