import { MCPTool, logger } from "mcp-framework";
import * as ynab from "ynab";
import { z } from "zod";
class ListCategoriesTool extends MCPTool {
    name = "list_categories";
    description = "Lists all categories in the specified budget, grouped by category group.";
    schema = {
        budgetId: {
            type: z.string().optional(),
            description: "The ID of the budget (optional, defaults to YNAB_BUDGET_ID env variable)",
        },
        lastKnowledgeOfServer: {
            type: z.number().optional(),
            description: "If provided, only categories changed since this server knowledge will be returned",
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
            logger.info(`Listing categories for budget ${budgetId}`);
            const response = await this.api.categories.getCategories(budgetId, input.lastKnowledgeOfServer);
            const groups = response.data.category_groups
                .filter((group) => !group.deleted)
                .map((group) => ({
                id: group.id,
                name: group.name,
                hidden: group.hidden,
                categories: group.categories
                    .filter((category) => !category.deleted)
                    .map((category) => ({
                    id: category.id,
                    name: category.name,
                    group_id: category.category_group_id,
                    group_name: group.name,
                    hidden: category.hidden,
                    budgeted: category.budgeted / 1000,
                    activity: category.activity / 1000,
                    balance: category.balance / 1000,
                })),
            }));
            return {
                category_groups: groups,
                server_knowledge: response.data.server_knowledge,
            };
        }
        catch (error) {
            logger.error(`Error listing categories for budget ${budgetId}:`);
            logger.error(JSON.stringify(error, null, 2));
            return `Error listing categories: ${error instanceof Error ? error.message : JSON.stringify(error)}`;
        }
    }
}
export default ListCategoriesTool;
