import { MCPTool, logger } from "mcp-framework";
import * as ynab from "ynab";
import { z } from "zod";

interface SearchTransactionsInput {
  budgetId?: string;
  searchText: string;
  sinceDate: string;
  page?: number;
  pageSize?: number;
}

interface TransactionOutput
  extends Omit<ynab.TransactionDetail, "amount" | "subtransactions"> {
  amount: number;
  subtransactions: (Omit<ynab.SubTransaction, "amount"> & { amount: number })[];
  inflow: number;
  outflow: number;
}

interface SearchResult extends TransactionOutput {
  matched_field: "memo" | "payee" | "both";
  relevance_score: number;
}

class SearchTransactionsTool extends MCPTool<SearchTransactionsInput> {
  name = "search_transactions";
  description =
    "Search transactions by memo or payee name (excluding transfers) with fuzzy matching. Returns most relevant results.";

  schema = {
    budgetId: {
      type: z.string().optional(),
      description: "The ID of the budget (optional, defaults to YNAB_BUDGET_ID env variable)",
    },
    searchText: {
      type: z.string().min(1),
      description: "Text to search for in memo and payee names",
    },
    sinceDate: {
      type: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      description: "Start date for search in YYYY-MM-DD format",
    },
    page: {
      type: z.number().min(1).optional(),
      description: "Page number to retrieve (1-indexed, default: 1)",
    },
    pageSize: {
      type: z.number().min(1).max(100).optional(),
      description: "Number of results per page (default: 50, max: 100)",
    },
  };

  private api: ynab.API;
  private budgetId: string;

  constructor() {
    super();
    if (!process.env.YNAB_API_TOKEN) {
      throw new Error("YNAB_API_TOKEN environment variable is not set. Please set it to a valid YNAB API token.");
    }
    this.api = new ynab.API(process.env.YNAB_API_TOKEN);
    this.budgetId = process.env.YNAB_BUDGET_ID || "";
  }

  async execute(input: SearchTransactionsInput) {
    const budgetId = input.budgetId || this.budgetId;
    const page = input.page || 1;
    const pageSize = input.pageSize || 50;

    if (!budgetId) {
      return "No budget ID provided. Please provide a budget ID or set the YNAB_BUDGET_ID environment variable.";
    }

    try {
      logger.info(`Searching transactions in budget ${budgetId} for "${input.searchText}" since ${input.sinceDate}, page ${page}`);

      // Fetch all transactions since the specified date
      const response = await this.api.transactions.getTransactions(
        budgetId,
        input.sinceDate
      );

      const allTransactions = response.data.transactions || [];

      // Filter out deleted transactions
      const activeTransactions = allTransactions.filter((t) => !t.deleted);

      // Search and score transactions
      const searchResults = this.searchAndScoreTransactions(
        activeTransactions,
        input.searchText.toLowerCase()
      );

      // Sort by relevance score (highest first), then by date (newest first)
      searchResults.sort((a, b) => {
        if (a.relevance_score !== b.relevance_score) {
          return b.relevance_score - a.relevance_score;
        }
        return b.date.localeCompare(a.date);
      });

      // Calculate pagination
      const totalMatches = searchResults.length;
      const totalPages = Math.ceil(totalMatches / pageSize);
      const startIndex = (page - 1) * pageSize;
      const endIndex = startIndex + pageSize;

      // Get the current page of results
      const pageResults = searchResults.slice(startIndex, endIndex);

      return {
        total_matches: totalMatches,
        results: pageResults,
        next_page: page < totalPages ? page + 1 : null,
      };
    } catch (error) {
      logger.error(`Error searching transactions in budget ${budgetId}:`);
      logger.error(JSON.stringify(error, null, 2));
      return `Error searching transactions: ${
        error instanceof Error ? error.message : JSON.stringify(error)
      }`;
    }
  }

  private searchAndScoreTransactions(
    transactions: ynab.TransactionDetail[],
    searchText: string
  ): SearchResult[] {
    const results: SearchResult[] = [];

    for (const transaction of transactions) {
      let memoScore = 0;
      let payeeScore = 0;

      if (transaction.memo) {
        memoScore = this.calculateMatchScore(
          transaction.memo.toLowerCase(),
          searchText
        );
      }

      if (transaction.payee_name && !transaction.transfer_transaction_id) {
        payeeScore = this.calculateMatchScore(
          transaction.payee_name.toLowerCase(),
          searchText
        );
      }

      const maxScore = Math.max(memoScore, payeeScore);
      if (maxScore > 0) {
        let matchedField: "memo" | "payee" | "both";
        if (memoScore > 0 && payeeScore > 0) {
          matchedField = "both";
        } else if (memoScore > 0) {
          matchedField = "memo";
        } else {
          matchedField = "payee";
        }

        const formatted = this.formatTransaction(transaction);
        results.push({
          ...formatted,
          matched_field: matchedField,
          relevance_score: maxScore,
        });
      }
    }

    return results;
  }

  private formatTransaction(
    transaction: ynab.TransactionDetail | ynab.HybridTransaction
  ): TransactionOutput {
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
  }

  private calculateMatchScore(text: string, searchText: string): number {
    // Exact match gets highest score
    if (text === searchText) {
      return 100;
    }

    // Contains as substring gets high score
    if (text.includes(searchText)) {
      // Score based on position (earlier matches score higher)
      const position = text.indexOf(searchText);
      return 80 - (position * 0.5);
    }

    // Fuzzy match using simple character overlap
    const overlap = this.calculateOverlap(text, searchText);
    if (overlap > 0.5) {
      return overlap * 50;
    }

    // Check if all words in search text appear in the text
    const searchWords = searchText.split(/\s+/);
    const textWords = text.split(/\s+/);
    let wordMatches = 0;
    
    for (const searchWord of searchWords) {
      if (textWords.some(textWord => textWord.includes(searchWord))) {
        wordMatches++;
      }
    }

    if (wordMatches === searchWords.length) {
      return 40;
    } else if (wordMatches > 0) {
      return 20 * (wordMatches / searchWords.length);
    }

    return 0;
  }

  private calculateOverlap(text: string, searchText: string): number {
    // Simple character overlap ratio
    const chars = new Set(searchText.split(''));
    let matches = 0;
    
    for (const char of chars) {
      if (text.includes(char)) {
        matches++;
      }
    }
    
    return matches / chars.size;
  }

}

export default SearchTransactionsTool;