import { MCPTool, logger } from "mcp-framework";
import * as ynab from "ynab";
import { z } from "zod";
class UpdateTransactionsTool extends MCPTool {
    name = "update_transactions";
    description = "Updates multiple transactions in your YNAB budget.";
    schema = {
        budgetId: {
            type: z.string().optional(),
            description: "The ID of the budget (optional, defaults to YNAB_BUDGET_ID env variable)",
        },
        transactions: {
            type: z
                .array(z.object({
                id: z.string().optional(),
                importId: z.string().optional(),
                accountId: z.string().optional(),
                date: z.string().optional(),
                amount: z.number().optional(),
                payeeId: z.string().optional(),
                payeeName: z.string().optional(),
                categoryId: z.string().optional(),
                memo: z.string().optional(),
                cleared: z.boolean().optional(),
                approved: z.boolean().optional(),
                flagColor: z.string().optional(),
            }))
                .min(1),
            description: "Array of transactions to update. Each must include either id or importId",
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
        const transactions = [];
        for (const tx of input.transactions) {
            if (!tx.id && !tx.importId) {
                return "Each transaction must specify either an id or an importId";
            }
            const clearedStatus = tx.cleared === undefined
                ? undefined
                : tx.cleared
                    ? ynab.TransactionClearedStatus.Cleared
                    : ynab.TransactionClearedStatus.Uncleared;
            transactions.push({
                id: tx.id,
                import_id: tx.importId,
                account_id: tx.accountId,
                date: tx.date,
                amount: tx.amount !== undefined ? Math.round(tx.amount * 1000) : undefined,
                payee_id: tx.payeeId,
                payee_name: tx.payeeName,
                category_id: tx.categoryId,
                memo: tx.memo,
                cleared: clearedStatus,
                approved: tx.approved,
                flag_color: tx.flagColor,
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
        }
        catch (error) {
            logger.error(`Error updating transactions for budget ${budgetId}:`);
            logger.error(JSON.stringify(error, null, 2));
            return `Error updating transactions: ${error instanceof Error ? error.message : JSON.stringify(error)}`;
        }
    }
}
export default UpdateTransactionsTool;
