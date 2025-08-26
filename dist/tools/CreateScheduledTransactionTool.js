import { MCPTool, logger } from "mcp-framework";
import * as ynab from "ynab";
import { z } from "zod";
class CreateScheduledTransactionTool extends MCPTool {
    name = "create_scheduled_transaction";
    description = "Creates a new scheduled transaction.";
    schema = {
        budgetId: {
            type: z.string().optional(),
            description: "The ID of the budget (optional, defaults to YNAB_BUDGET_ID env variable)",
        },
        accountId: {
            type: z.string(),
            description: "The ID of the account for the scheduled transaction",
        },
        date: {
            type: z.string(),
            description: "The scheduled transaction date in ISO format",
        },
        amount: {
            type: z.number(),
            description: "The amount in dollars",
        },
        payeeId: {
            type: z.string().optional(),
            description: "The ID of the payee (optional if payee_name is provided)",
        },
        payeeName: {
            type: z.string().optional(),
            description: "The name of the payee (optional if payee_id is provided)",
        },
        categoryId: {
            type: z.string().optional(),
            description: "The category ID for the transaction (optional)",
        },
        memo: {
            type: z.string().optional(),
            description: "A memo for the transaction (optional)",
        },
        flagColor: {
            type: z.string().optional(),
            description: "The transaction flag color (red, orange, yellow, green, blue, purple)",
        },
        frequency: {
            type: z.string().optional(),
            description: "How often the scheduled transaction occurs",
        },
    };
    api;
    budgetId;
    constructor() {
        super();
        this.api = new ynab.API(process.env.YNAB_API_TOKEN || "");
        this.budgetId = process.env.YNAB_BUDGET_ID || "";
    }
    async execute(input) {
        const budgetId = input.budgetId || this.budgetId;
        if (!budgetId) {
            return "No budget ID provided. Please provide a budget ID or set the YNAB_BUDGET_ID environment variable.";
        }
        const milliunitAmount = Math.round(input.amount * 1000);
        try {
            const scheduledTransaction = {
                scheduled_transaction: {
                    account_id: input.accountId,
                    date: input.date,
                    amount: milliunitAmount,
                    payee_id: input.payeeId,
                    payee_name: input.payeeName,
                    category_id: input.categoryId,
                    memo: input.memo,
                    flag_color: input.flagColor,
                    frequency: input.frequency,
                },
            };
            const response = await this.api.scheduledTransactions.createScheduledTransaction(budgetId, scheduledTransaction);
            const t = response.data.scheduled_transaction;
            return {
                scheduled_transaction: {
                    id: t.id,
                    date_first: t.date_first,
                    date_next: t.date_next,
                    frequency: t.frequency,
                    amount: t.amount / 1000,
                    account_name: t.account_name,
                    payee_name: t.payee_name,
                    category_name: t.category_name,
                    memo: t.memo,
                },
            };
        }
        catch (error) {
            logger.error(`Error creating scheduled transaction for budget ${budgetId}:`);
            logger.error(JSON.stringify(error, null, 2));
            return `Error creating scheduled transaction: ${error instanceof Error ? error.message : JSON.stringify(error)}`;
        }
    }
}
export default CreateScheduledTransactionTool;
