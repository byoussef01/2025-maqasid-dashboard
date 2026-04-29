import "server-only";

import {
  createClient,
  type Client,
  type InArgs,
  type InStatement,
  type ResultSet,
  type Transaction,
} from "@libsql/client";

import { getMaskedTursoHost, getTursoConfig } from "./turso-config";

let db: Client | undefined;

export function getDb() {
  if (!db) {
    const { url, authToken } = getTursoConfig();
    db = createClient({ url, authToken });
  }

  return db;
}

export async function dbExecute(statement: InStatement | string, args?: InArgs) {
  return typeof statement === "string"
    ? getDb().execute(statement, args)
    : getDb().execute(statement);
}

export async function dbExecuteMultiple(sql: string) {
  return getDb().executeMultiple(sql);
}

export async function dbAll<T>(sql: string, args?: InArgs) {
  const result = await getDb().execute({ sql, args: args ?? {} });
  return result.rows as unknown as T[];
}

export async function dbOne<T>(sql: string, args?: InArgs) {
  const rows = await dbAll<T>(sql, args);
  return rows[0];
}

export async function withWriteTransaction<T>(callback: (transaction: Transaction) => Promise<T>) {
  const transaction = await getDb().transaction("write");

  try {
    const result = await callback(transaction);
    await transaction.commit();
    return result;
  } catch (error) {
    await transaction.rollback();
    throw error;
  } finally {
    transaction.close();
  }
}

export async function txExecute(
  transaction: Transaction,
  statement: InStatement | string,
  args?: InArgs,
) {
  return typeof statement === "string"
    ? transaction.execute({ sql: statement, args: args ?? {} })
    : transaction.execute(statement);
}

export function getMaskedDbHost() {
  return getMaskedTursoHost();
}

export function scalarNumber(result: ResultSet | undefined, key: string) {
  const row = result?.rows[0] as Record<string, unknown> | undefined;
  const value = row?.[key];
  return typeof value === "number" ? value : Number(value ?? 0);
}
