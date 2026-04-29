"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { importWorkbook, type WorkbookImportSummary } from "@/lib/import/workbook";

export type ImportState = {
  ok: boolean;
  message: string;
  result?: WorkbookImportSummary;
  warnings: string[];
  errors: string[];
};

export async function importWorkbookAction(
  _previousState: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const file = formData.get("workbook");

  if (!(file instanceof File) || file.size === 0) {
    return failure("Choose an exported .xlsx workbook to import.", [
      "No workbook file was received.",
    ]);
  }

  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return failure("Unsupported file type.", ["Only .xlsx workbook exports are supported."]);
  }

  const tempDir = path.join(process.cwd(), "data", "tmp-imports");
  const tempPath = path.join(tempDir, `${randomUUID()}-${safeFileName(file.name)}`);
  const latestImportPath = path.join(process.cwd(), "data", "latest-import.xlsx");
  const keepTempFile = process.env.FINANCE_IMPORT_DEBUG === "1";

  try {
    await fs.mkdir(tempDir, { recursive: true });
    await fs.writeFile(tempPath, Buffer.from(await file.arrayBuffer()));
    await fs.copyFile(tempPath, latestImportPath);

    const result = await importWorkbook(tempPath, file.name);

    revalidatePath("/dashboard");
    revalidatePath("/transactions");
    revalidatePath("/reports");
    revalidatePath("/import");

    return {
      ok: true,
      message: `Imported ${result.totalImportedRows.toLocaleString()} row(s).`,
      result,
      warnings: result.warnings,
      errors: [],
    };
  } catch (error) {
    return failure("Import failed.", [classifyImportError(error)]);
  } finally {
    if (!keepTempFile) {
      await fs.rm(tempPath, { force: true });
    }
  }
}

function failure(message: string, errors: string[]): ImportState {
  return {
    ok: false,
    message,
    warnings: [],
    errors,
  };
}

function safeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function classifyImportError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  if (/no transactions|header row|Known account sheet/i.test(message)) {
    return `Workbook shape issue: ${message}`;
  }

  if (/SQLITE|database|constraint|libsql|turso/i.test(message)) {
    return `Database error: ${message}`;
  }

  if (/read workbook|Unsupported|zip|xlsx/i.test(message)) {
    return `Parse error: ${message}`;
  }

  return message;
}
