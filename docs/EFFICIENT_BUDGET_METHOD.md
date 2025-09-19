// Add this method to your SnowflakeApiService class

/**
 * Get budget summary by fiscal year with total, obligated, and remaining amounts
 * EFFICIENT APPROACH: Uses summary endpoint for totals + filtered detailed queries for obligations
 */
async getBudgetByFiscalYear(fiscalYear: number): Promise<{
  fiscalYear: number;
  totalBudget: number;
  obligated: number;
  remaining: number;
  enacted?: number;
  dataStatus: string;
  explanation: string;
}> {
  try {
    // 1. Get total budget from summary endpoint (most efficient)
    const summaryResponse = await this.makeGetRequest<BudgetSummaryResponse>(
      `/api/v1/budget/summary?fiscal_year=${fiscalYear}`
    );

    if (!summaryResponse.summary || summaryResponse.summary.length === 0) {
      throw new Error(`No budget data found for fiscal year ${fiscalYear}`);
    }

    const totalBudget = summaryResponse.summary.reduce(
      (sum, record) => sum + record.TOTAL_AMOUNT_K, 
      0
    );

    // 2. Get obligated amounts by filtering for "Actual" phase only
    const obligatedResponse = await this.makePostRequest<ApiResponse<BudgetRecord>>(
      '/api/v1/budget',
      {
        page: 1,
        page_size: 10000, // Get all records
        filters: {
          FISCAL_YEAR: [fiscalYear],
          PHASE: ['Actual'] // Only get obligated amounts
        }
      }
    );

    const obligated = obligatedResponse.data.reduce(
      (sum, record) => sum + (record.AMOUNT_K || 0), 
      0
    );

    // 3. Get enacted amounts by filtering for "Enacted" phase only
    const enactedResponse = await this.makePostRequest<ApiResponse<BudgetRecord>>(
      '/api/v1/budget',
      {
        page: 1,
        page_size: 10000,
        filters: {
          FISCAL_YEAR: [fiscalYear],
          PHASE: ['Enacted']
        }
      }
    );

    const enacted = enactedResponse.data.reduce(
      (sum, record) => sum + (record.AMOUNT_K || 0), 
      0
    );

    // 4. Calculate remaining
    const remaining = totalBudget - obligated;

    // 5. Determine data status and explanation
    let dataStatus = '';
    let explanation = '';
    
    if (obligated > 0) {
      dataStatus = 'Historical with obligations';
      explanation = `FY ${fiscalYear} is complete with $${(obligated/1000).toFixed(1)}B actually obligated/spent.`;
    } else if (enacted > 0) {
      dataStatus = 'Current budget authority';
      explanation = `FY ${fiscalYear} budget has been enacted but no obligations yet. All $${(totalBudget/1000).toFixed(1)}B is available.`;
    } else {
      dataStatus = 'Future budget proposal';
      explanation = `FY ${fiscalYear} is a proposed budget. No obligations possible yet.`;
    }

    return {
      fiscalYear,
      totalBudget: totalBudget / 1000,
      obligated: obligated / 1000,
      remaining: remaining / 1000,
      enacted: enacted > 0 ? enacted / 1000 : undefined,
      dataStatus,
      explanation
    };

  } catch (error) {
    console.error(`Error fetching budget by fiscal year ${fiscalYear}:`, error);
    throw error;
  }
}

/**
 * Get budget comparison across multiple fiscal years (efficient version)
 */
async getBudgetComparison(fiscalYears: number[]): Promise<{
  fiscalYear: number;
  totalBudget: number;
  obligated: number;
  remaining: number;
  obligationRate: number;
  dataStatus: string;
}[]> {
  try {
    const results = await Promise.all(
      fiscalYears.map(async (year) => {
        const budget = await this.getBudgetByFiscalYear(year);
        
        return {
          fiscalYear: budget.fiscalYear,
          totalBudget: budget.totalBudget,
          obligated: budget.obligated,
          remaining: budget.remaining,
          obligationRate: budget.totalBudget > 0 
            ? (budget.obligated / budget.totalBudget) * 100 
            : 0,
          dataStatus: budget.dataStatus
        };
      })
    );

    return results.sort((a, b) => b.fiscalYear - a.fiscalYear);
  } catch (error) {
    console.error('Error fetching budget comparison:', error);
    throw error;
  }
}

// Usage Examples:

// 1. Get budget for a specific fiscal year
const budget2024 = await snowflakeApi.getBudgetByFiscalYear(2024);
console.log(`FY 2024: Total: $${budget2024.totalBudget}B, Obligated: $${budget2024.obligated}B, Remaining: $${budget2024.remaining}B`);

// 2. Get budget comparison across years
const comparison = await snowflakeApi.getBudgetComparison([2024, 2025, 2026]);
console.log('Budget Comparison:', comparison);

// 3. Get all available fiscal years
const availableYears = await snowflakeApi.getAvailableFiscalYears();
console.log('Available Years:', availableYears);
