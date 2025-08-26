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

interface TransactionOutput {
  id: string;
  date: string;
  account_name: string;
  payee_name?: string | null;
  category_name?: string | null;
  memo?: string | null;
  inflow: number;
  outflow: number;
  cleared: string;
  approved: boolean;
  transfer_transaction_id?: string | null;
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

      const transactions: TransactionOutput[] = response.data.transactions
        .filter((t) => !t.deleted)
        .map((t) => {
          const amount = t.amount / 1000;
          return {
            id: t.id,
            date: t.date,
            account_name: t.account_name || "",
            payee_name: t.payee_name,
            category_name: t.category_name,
            memo: t.memo,
            inflow: amount > 0 ? amount : 0,
            outflow: amount < 0 ? Math.abs(amount) : 0,
            cleared: t.cleared,
            approved: t.approved,
            transfer_transaction_id: t.transfer_transaction_id,
          };
        });

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
}

export default GetTransactionsByPayeeTool;
