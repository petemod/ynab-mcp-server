import { MCPTool, logger } from "mcp-framework";
import * as ynab from "ynab";
import { z } from "zod";

interface GetUnapprovedTransactionsInput {
  budgetId?: string;
}

interface TransactionOutput
  extends Omit<ynab.TransactionDetail, "amount" | "subtransactions"> {
  amount: number;
  subtransactions: (Omit<ynab.SubTransaction, "amount"> & { amount: number })[];
  inflow: number;
  outflow: number;
}

class GetUnapprovedTransactionsTool extends MCPTool<GetUnapprovedTransactionsInput> {
  name = "get_unapproved_transactions";
  description =
    "Gets unapproved transactions from a budget. First time pulls last 3 days, subsequent pulls use server knowledge to get only changes.";

  schema = {
    budgetId: {
      type: z.string().optional(),
      description: "The ID of the budget to fetch transactions for (optional, defaults to the budget set in the YNAB_BUDGET_ID environment variable)",
    },
  };

  private api: ynab.API;
  private budgetId: string;

  constructor() {
    super();
    this.api = new ynab.API(process.env.YNAB_API_TOKEN || "");
    this.budgetId = process.env.YNAB_BUDGET_ID || "";
  }

  async execute(input: GetUnapprovedTransactionsInput) {
    const budgetId = input.budgetId || this.budgetId;

    if (!budgetId) {
      return "No budget ID provided. Please provide a budget ID or set the YNAB_BUDGET_ID environment variable. Use the ListBudgets tool to get a list of available budgets.";
    }

    try {
      logger.info(`Getting unapproved transactions for budget ${budgetId}`);

      const response = await this.api.transactions.getTransactions(
        budgetId,
        undefined,
        ynab.GetTransactionsTypeEnum.Unapproved
      );

      const transactions = this.transformTransactions(
        response.data.transactions.filter((t) => !t.deleted)
      );

      return {
        transactions,
        transaction_count: transactions.length,
      };
    } catch (error) {
      logger.error(
        `Error getting unapproved transactions for budget ${budgetId}:`
      );
      logger.error(JSON.stringify(error, null, 2));
      return `Error getting unapproved transactions: ${
        error instanceof Error ? error.message : JSON.stringify(error)
      }`;
    }
  }

  private transformTransactions(
    transactions: (ynab.TransactionDetail | ynab.HybridTransaction)[]
  ): TransactionOutput[] {
    return transactions.map((transaction) => {
      const amount = transaction.amount / 1000;
      const subtransactions =
        "subtransactions" in transaction && transaction.subtransactions
          ? transaction.subtransactions.map((sub: ynab.SubTransaction) => ({
              ...sub,
              amount: sub.amount / 1000,
            }))
          : [];

      const accountName =
        "account_name" in transaction ? transaction.account_name : undefined;
      const payeeName =
        "payee_name" in transaction ? transaction.payee_name : undefined;
      const categoryName =
        "category_name" in transaction ? transaction.category_name : undefined;

      return {
        id: transaction.id,
        date: transaction.date,
        amount,
        memo: transaction.memo || null,
        cleared: transaction.cleared,
        approved: transaction.approved,
        flag_color:
          "flag_color" in transaction ? transaction.flag_color ?? null : null,
        flag_name:
          "flag_name" in transaction ? transaction.flag_name ?? null : null,
        account_id: transaction.account_id,
        payee_id:
          "payee_id" in transaction ? transaction.payee_id ?? null : null,
        category_id:
          "category_id" in transaction ? transaction.category_id ?? null : null,
        transfer_account_id:
          "transfer_account_id" in transaction
            ? transaction.transfer_account_id ?? null
            : null,
        transfer_transaction_id:
          "transfer_transaction_id" in transaction
            ? transaction.transfer_transaction_id ?? null
            : null,
        matched_transaction_id:
          "matched_transaction_id" in transaction
            ? transaction.matched_transaction_id ?? null
            : null,
        import_id:
          "import_id" in transaction ? transaction.import_id ?? null : null,
        import_payee_name:
          "import_payee_name" in transaction
            ? transaction.import_payee_name ?? null
            : null,
        import_payee_name_original:
          "import_payee_name_original" in transaction
            ? transaction.import_payee_name_original ?? null
            : null,
        debt_transaction_type:
          "debt_transaction_type" in transaction
            ? transaction.debt_transaction_type ?? null
            : null,
        deleted: "deleted" in transaction ? transaction.deleted ?? false : false,
        account_name: accountName,
        payee_name: payeeName,
        category_name: categoryName,
        subtransactions,
        inflow: amount > 0 ? amount : 0,
        outflow: amount < 0 ? Math.abs(amount) : 0,
      } as TransactionOutput;
    });
  }
}

export default GetUnapprovedTransactionsTool;
