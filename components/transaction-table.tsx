import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/reports/format";
import type { TransactionRecord } from "@/lib/types/finance";

export function TransactionTable({ transactions }: { transactions: TransactionRecord[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Account</TableHead>
          <TableHead>Payee</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Program</TableHead>
          <TableHead className="text-right">Net</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {transactions.length === 0 ? (
          <TableRow>
            <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
              No transactions match the current view.
            </TableCell>
          </TableRow>
        ) : (
          transactions.map((transaction) => (
            <TableRow key={transaction.id}>
              <TableCell>{formatDate(transaction.transactionDate ?? transaction.clearDate)}</TableCell>
              <TableCell className="font-medium">{transaction.accountName}</TableCell>
              <TableCell className="max-w-[18rem] truncate">
                {transaction.payee || transaction.source || "Unlabeled"}
              </TableCell>
              <TableCell>{transaction.accountingCategory || "Uncategorized"}</TableCell>
              <TableCell>{transaction.programCategory || "Unassigned"}</TableCell>
              <TableCell className="text-right font-medium">
                {formatCurrency(transaction.normalizedNetCents)}
              </TableCell>
              <TableCell>
                <Badge variant={transaction.reportingType === "revenue" ? "secondary" : "outline"}>
                  {transaction.direction}
                </Badge>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
