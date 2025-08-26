import { MCPTool, logger } from "mcp-framework";
import * as ynab from "ynab";
import { z } from "zod";

interface ListScheduledTransactionsInput {
  budgetId?: string;
  lastKnowledgeOfServer?: number;
}

interface ScheduledTransactionOutput {
  id: string;
  date_first: string;
  date_next: string;
  frequency: string;
  amount: number;
  account_name: string;
  payee_name?: string | null;
  category_name?: string | null;
  memo?: string | null;
}

class ListScheduledTransactionsTool extends MCPTool<ListScheduledTransactionsInput> {
  name = "list_scheduled_transactions";
  description = "Lists all scheduled transactions for the specified budget.";

  schema = {
    budgetId: {
      type: z.string().optional(),
      description: "The ID of the budget (optional, defaults to YNAB_BUDGET_ID env variable)",
    },
    lastKnowledgeOfServer: {
      type: z.number().optional(),
      description:
        "If provided, only scheduled transactions changed since this server knowledge will be returned",
    },
  };

  private api: ynab.API;
  private budgetId: string;

  constructor() {
    super();
    this.api = new ynab.API(process.env.YNAB_API_TOKEN || "");
    this.budgetId = process.env.YNAB_BUDGET_ID || "";
  }

  async execute(input: ListScheduledTransactionsInput) {
    const budgetId = input.budgetId || this.budgetId;

    if (!budgetId) {
      return "No budget ID provided. Please provide a budget ID or set the YNAB_BUDGET_ID environment variable.";
    }

    try {
      logger.info(`Listing scheduled transactions for budget ${budgetId}`);
      const response = await this.api.scheduledTransactions.getScheduledTransactions(
        budgetId,
        input.lastKnowledgeOfServer
      );

      const scheduledTransactions: ScheduledTransactionOutput[] =
        response.data.scheduled_transactions
          .filter((t) => !t.deleted)
          .map((t) => ({
            id: t.id,
            date_first: t.date_first,
            date_next: t.date_next,
            frequency: t.frequency,
            amount: t.amount / 1000,
            account_name: t.account_name,
            payee_name: t.payee_name,
            category_name: t.category_name,
            memo: t.memo,
          }));

      return {
        scheduled_transactions: scheduledTransactions,
        server_knowledge: response.data.server_knowledge,
      };
    } catch (error) {
      logger.error(`Error listing scheduled transactions for budget ${budgetId}:`);
      logger.error(JSON.stringify(error, null, 2));
      return `Error listing scheduled transactions: ${
        error instanceof Error ? error.message : JSON.stringify(error)
      }`;
    }
  }
}

export default ListScheduledTransactionsTool;
