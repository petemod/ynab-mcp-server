import { MCPTool, logger } from "mcp-framework";
import * as ynab from "ynab";
import { z } from "zod";

interface UpdateSubtransaction {
  amount: number;
  payeeId?: string;
  categoryId?: string;
  memo?: string;
}

interface UpdateTransaction {
  id?: string | null;
  importId?: string;
  accountId?: string;
  date?: string;
  amount?: number;
  payeeId?: string;
  categoryId?: string;
  memo?: string;
  cleared?: boolean;
  approved?: boolean;
  flagColor?: string;
  subtransactions?: UpdateSubtransaction[];
}

interface UpdateTransactionsInput {
  budgetId?: string;
  transactions: UpdateTransaction[];
}

class UpdateTransactionsTool extends MCPTool<UpdateTransactionsInput> {
  name = "update_transactions";
  description = "Updates multiple transactions in your YNAB budget.";

  schema = {
    budgetId: {
      type: z.string().optional(),
      description:
        "The ID of the budget (optional, defaults to YNAB_BUDGET_ID env variable)",
    },
    transactions: {
      type: z
        .array(
          z.object({
            id: z.string().nullable().optional(),
            importId: z.string().optional(),
            accountId: z.string().optional(),
            date: z.string().optional(),
            amount: z.number().optional(),
            payeeId: z.string().optional(),
            categoryId: z.string().optional(),
            memo: z.string().optional(),
            cleared: z.boolean().optional(),
            approved: z.boolean().optional(),
            flagColor: z.string().optional(),
            subtransactions: z
              .array(
                z.object({
                  amount: z.number(),
                  payeeId: z.string().optional(),
                  categoryId: z.string().optional(),
                  memo: z.string().optional(),
                })
              )
              .optional(),
          })
        )
        .min(1),
      description:
        "Array of transactions to update. Each must include either id or importId",
    },
  };

  private api: ynab.API;
  private budgetId: string;

  constructor() {
    super();
    this.api = new ynab.API(process.env.YNAB_API_TOKEN || "");
    this.budgetId = process.env.YNAB_BUDGET_ID || "";
  }

  async execute(input: UpdateTransactionsInput) {
    const budgetId = input.budgetId || this.budgetId;

    if (!budgetId) {
      return "No budget ID provided. Please provide a budget ID or set the YNAB_BUDGET_ID environment variable.";
    }

    const transactions: ynab.SaveTransactionWithIdOrImportId[] = [];

    for (const tx of input.transactions) {
      if (tx.id && tx.importId) {
        return "Each transaction must specify either an id or an importId, but not both";
      }
      if (!tx.id && !tx.importId) {
        return "Each transaction must specify either an id or an importId";
      }

      const clearedStatus =
        tx.cleared === undefined
          ? undefined
          : tx.cleared
          ? ynab.TransactionClearedStatus.Cleared
          : ynab.TransactionClearedStatus.Uncleared;

      const subtransactions = tx.subtransactions?.map((stx) => ({
        amount: Math.round(stx.amount * 1000),
        payee_id: stx.payeeId,
        category_id: stx.categoryId,
        memo: stx.memo,
      }));

      transactions.push({
        id: tx.id !== undefined ? tx.id : undefined,
        import_id: tx.importId,
        account_id: tx.accountId,
        date: tx.date,
        amount: tx.amount !== undefined ? Math.round(tx.amount * 1000) : undefined,
        payee_id: tx.payeeId,
        category_id: tx.categoryId,
        memo: tx.memo,
        cleared: clearedStatus,
        approved: tx.approved,
        flag_color: tx.flagColor as ynab.TransactionFlagColor,
        subtransactions,
      });
    }

    try {
      logger.info(`Updating ${transactions.length} transactions for budget ${budgetId}`);
      const response = await this.api.transactions.updateTransactions(budgetId, {
        transactions,
      });

      return {
        transaction_ids: response.data.transaction_ids,
        duplicate_import_ids: response.data.duplicate_import_ids,
      };
    } catch (error) {
      logger.error(`Error updating transactions for budget ${budgetId}:`);
      logger.error(JSON.stringify(error, null, 2));
      return `Error updating transactions: ${
        error instanceof Error ? error.message : JSON.stringify(error)
      }`;
    }
  }
}

export default UpdateTransactionsTool;
