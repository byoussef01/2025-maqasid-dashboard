import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function TransactionFilters({
  accounts,
  defaultQ,
  defaultAccount,
  defaultDirection,
}: {
  accounts: string[];
  defaultQ?: string;
  defaultAccount?: string;
  defaultDirection?: string;
}) {
  return (
    <form className="grid gap-3 md:grid-cols-[1fr_14rem_12rem_auto]">
      <Input name="q" placeholder="Search payee, memo, source, or ID" defaultValue={defaultQ} />
      <Select name="account" defaultValue={defaultAccount || "all"}>
        <SelectTrigger>
          <SelectValue placeholder="All accounts" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="all">All accounts</SelectItem>
            {accounts.map((account) => (
              <SelectItem key={account} value={account}>
                {account}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <Select name="direction" defaultValue={defaultDirection || "all"}>
        <SelectTrigger>
          <SelectValue placeholder="Direction" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="all">All directions</SelectItem>
            <SelectItem value="revenue">Revenue</SelectItem>
            <SelectItem value="expenditure">Expenditure</SelectItem>
            <SelectItem value="transfer">Transfers</SelectItem>
            <SelectItem value="ignored">Ignored</SelectItem>
            <SelectItem value="unknown">Unknown</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
      <Button type="submit" variant="outline">
        Apply
      </Button>
    </form>
  );
}
