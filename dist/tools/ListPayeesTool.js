import { MCPTool, logger } from "mcp-framework";
import * as ynab from "ynab";
import { z } from "zod";
class ListPayeesTool extends MCPTool {
    name = "list_payees";
    description = "Lists all payees for the specified budget.";
    schema = {
        budgetId: {
            type: z.string().optional(),
            description: "The ID of the budget (optional, defaults to YNAB_BUDGET_ID env variable)",
        },
        lastKnowledgeOfServer: {
            type: z.number().optional(),
            description: "If provided, only payees changed since this server knowledge will be returned",
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
        try {
            logger.info(`Listing payees for budget ${budgetId}`);
            const response = await this.api.payees.getPayees(budgetId, input.lastKnowledgeOfServer);
            const payees = response.data.payees
                .filter((p) => !p.deleted)
                .map((p) => ({
                id: p.id,
                name: p.name,
                transfer_account_id: p.transfer_account_id,
            }));
            return {
                payees,
                server_knowledge: response.data.server_knowledge,
            };
        }
        catch (error) {
            logger.error(`Error listing payees for budget ${budgetId}:`);
            logger.error(JSON.stringify(error, null, 2));
            return `Error listing payees: ${error instanceof Error ? error.message : JSON.stringify(error)}`;
        }
    }
}
export default ListPayeesTool;
