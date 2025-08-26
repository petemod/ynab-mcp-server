import { MCPTool } from "mcp-framework";
import { z } from "zod";
import * as ynab from "ynab";

interface CreateTransactionInput {
  budgetId?: string;
  accountId: string;
  date: string;
  amount: number;
  payeeId?: string;
  payeeName?: string;
  categoryId?: string;
  memo?: string;
  cleared?: "cleared" | "uncleared" | "reconciled";
  approved?: boolean;
  flagColor?: "red" | "orange" | "yellow" | "green" | "blue" | "purple";
}

class CreateTransactionTool extends MCPTool<CreateTransactionInput> {
  name = "create_transaction";
  description = "Creates a new transaction in your YNAB budget. Either payee_id or payee_name must be provided in addition to the other required fields.";

  private api: ynab.API;
  private budgetId: string;

  constructor() {
    super();
    this.api = new ynab.API(process.env.YNAB_API_TOKEN || "");
    this.budgetId = process.env.YNAB_BUDGET_ID || "";
  }

  schema = {
    budgetId: {
      type: z.string().optional(),
      description: "The id of the budget to create the transaction in (optional, defaults to the budget set in the YNAB_BUDGET_ID environment variable)",
    },
    accountId: {
      type: z.string(),
      description: "The id of the account to create the transaction in",
    },
    date: {
      type: z.string(),
      description: "The date of the transaction in ISO format (e.g. 2024-03-24)",
    },
    amount: {
      type: z.number(),
      description: "The amount in dollars (e.g. 10.99)",
    },
    payeeId: {
      type: z.string().optional(),
      description: "The id of the payee (optional if payee_name is provided)",
    },
    payeeName: {
      type: z.string().optional(),
      description: "The name of the payee (optional if payee_id is provided)",
    },
    categoryId: {
      type: z.string().optional(),
      description: "The category id for the transaction (optional)",
    },
    memo: {
      type: z.string().optional(),
      description: "A memo/note for the transaction (optional)",
    },
    cleared: {
      type: z
        .enum(["cleared", "uncleared", "reconciled"])
        .optional(),
      description: "The cleared status of the transaction",
    },
    approved: {
      type: z.boolean().optional(),
      description: "Whether the transaction is approved (optional, defaults to false)",
    },
    flagColor: {
      type: z
        .enum(["red", "orange", "yellow", "green", "blue", "purple"])
        .optional(),
      description:
        "The transaction flag color (red, orange, yellow, green, blue, purple) (optional)",
    },
  };

  async execute(input: CreateTransactionInput) {
    const budgetId = input.budgetId || this.budgetId;

    if (!budgetId) {
      throw new Error("No budget ID provided. Please provide a budget ID or set the YNAB_BUDGET_ID environment variable.");
    }

    if(!input.payeeId && !input.payeeName) {
      throw new Error("Either payee_id or payee_name must be provided");
    }

    const milliunitAmount = Math.round(input.amount * 1000);

    try {
      const transaction: ynab.PostTransactionsWrapper = {
        transaction: {
          account_id: input.accountId,
          date: input.date,
          amount: milliunitAmount,
          payee_id: input.payeeId,
          payee_name: input.payeeName,
          category_id: input.categoryId,
          memo: input.memo,
          cleared: input.cleared as ynab.TransactionClearedStatus,
          approved: input.approved ?? false,
          flag_color: input.flagColor as ynab.TransactionFlagColor,
        }
      };

      const response = await this.api.transactions.createTransaction(
        budgetId,
        transaction
      );

      if (!response.data.transaction) {
        throw new Error("Failed to create transaction - no transaction data returned");
      }

      return {
        success: true,
        transactionId: response.data.transaction.id,
        message: "Transaction created successfully",
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  }
}

export default CreateTransactionTool;
