import { MCPTool, logger } from "mcp-framework";
import * as ynab from "ynab";
import { z } from "zod";

interface GetTransactionsByPayeeInput {
  budgetId?: string;
  payeeId: string;
  sinceDate?: string;
  type?: "uncategorized" | "unapproved";
  lastKnowledgeOfServer?: number;
}

interface TransactionOutput
  extends Omit<ynab.TransactionDetail, "amount" | "subtransactions"> {
  amount: number;
  subtransactions: (Omit<ynab.SubTransaction, "amount"> & { amount: number })[];
  inflow: number;
  outflow: number;
}

class GetTransactionsByPayeeTool extends MCPTool<GetTransactionsByPayeeInput> {
  name = "get_transactions_by_payee";
  description = "Lists transactions for a specific payee.";

  schema = {
    budgetId: {
      type: z.string().optional(),
      description: "The ID of the budget (optional, defaults to YNAB_BUDGET_ID env variable)",
    },
    payeeId: {
      type: z.string(),
      description: "The ID of the payee to retrieve transactions for",
    },
    sinceDate: {
      type: z.string().optional(),
      description: "Only transactions on or after this date will be included (ISO format)",
    },
    type: {
      type: z.enum(["uncategorized", "unapproved"]).optional(),
      description: "If specified, only transactions of the given type will be included",
    },
    lastKnowledgeOfServer: {
      type: z.number().optional(),
      description:
        "If provided, only transactions changed since this server knowledge will be returned",
    },
  };

  private api: ynab.API;
  private budgetId: string;

  constructor() {
    super();
    if (!process.env.YNAB_API_TOKEN) {
      throw new Error(
        "YNAB_API_TOKEN environment variable is not set. Please set it to a valid YNAB API token."
      );
    }
    this.api = new ynab.API(process.env.YNAB_API_TOKEN);
    this.budgetId = process.env.YNAB_BUDGET_ID || "";
  }

  async execute(input: GetTransactionsByPayeeInput) {
    const budgetId = input.budgetId || this.budgetId;

    if (!budgetId) {
      return "No budget ID provided. Please provide a budget ID or set the YNAB_BUDGET_ID environment variable.";
    }

    try {
      logger.info(`Fetching transactions for payee ${input.payeeId} in budget ${budgetId}`);
      const response = await this.api.transactions.getTransactionsByPayee(
        budgetId,
        input.payeeId,
        input.sinceDate,
        input.type as any,
        input.lastKnowledgeOfServer
      );

      const transactions = this.transformTransactions(
        response.data.transactions.filter((t) => !t.deleted)
      );

      return {
        transactions,
        server_knowledge: response.data.server_knowledge,
      };
    } catch (error) {
      logger.error(
        `Error fetching transactions for payee ${input.payeeId} in budget ${budgetId}:`
      );
      logger.error(JSON.stringify(error, null, 2));
      return `Error fetching transactions: ${
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

export default GetTransactionsByPayeeTool;
