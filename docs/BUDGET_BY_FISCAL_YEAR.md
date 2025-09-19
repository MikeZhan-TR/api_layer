// Add this method to your SnowflakeApiService class

/**
 * Get budget summary by fiscal year with total, obligated, and remaining amounts
 */
async getBudgetByFiscalYear(fiscalYear?: number): Promise<{
  fiscalYear: number;
  totalBudget: number;
  obligated: number;
  remaining: number;
  enacted: number;
  discretionary: number;
  breakdown: {
    phase: string;
    amount: number;
    percentage: number;
  }[];
}> {
  try {
    // Get budget data for the specified fiscal year
    const response = await this.getBudgetData({
      fiscalYear: fiscalYear ? [fiscalYear] : undefined,
      pageSize: 5000, // Get all records for accurate calculation
    });

    if (!response.data || response.data.length === 0) {
      throw new Error(`No budget data found for fiscal year ${fiscalYear || 'all years'}`);
    }

    // Filter data by fiscal year if specified
    const data = fiscalYear 
      ? response.data.filter(record => record.FISCAL_YEAR === fiscalYear)
      : response.data;

    // Group by phase to calculate different budget amounts
    const phaseTotals = data.reduce((acc, record) => {
      const phase = record.PHASE || 'Unknown';
      acc[phase] = (acc[phase] || 0) + (record.AMOUNT_K || 0);
      return acc;
    }, {} as Record<string, number>);

    // Calculate totals
    const totalBudget = phaseTotals['Total'] || 0;
    const obligated = phaseTotals['Actual'] || 0;
    const enacted = phaseTotals['Enacted'] || 0;
    const discretionary = phaseTotals['Disc'] || 0;
    
    // Calculate remaining (Total - Actual)
    const remaining = totalBudget - obligated;

    // Create breakdown array
    const breakdown = Object.entries(phaseTotals)
      .map(([phase, amount]) => ({
        phase,
        amount: amount / 1000, // Convert to billions
        percentage: totalBudget > 0 ? (amount / totalBudget) * 100 : 0
      }))
      .sort((a, b) => b.amount - a.amount);

    // Get the fiscal year (use the most common one if not specified)
    const fiscalYearValue = fiscalYear || 
      data.reduce((acc, record) => {
        acc[record.FISCAL_YEAR] = (acc[record.FISCAL_YEAR] || 0) + 1;
        return acc;
      }, {} as Record<number, number>);

    const mostCommonYear = typeof fiscalYearValue === 'number' 
      ? fiscalYearValue 
      : Object.entries(fiscalYearValue).sort((a, b) => b[1] - a[1])[0][0];

    return {
      fiscalYear: Number(mostCommonYear),
      totalBudget: totalBudget / 1000, // Convert to billions
      obligated: obligated / 1000, // Convert to billions
      remaining: remaining / 1000, // Convert to billions
      enacted: enacted / 1000, // Convert to billions
      discretionary: discretionary / 1000, // Convert to billions
      breakdown
    };

  } catch (error) {
    console.error(`Error fetching budget by fiscal year ${fiscalYear}:`, error);
    throw error;
  }
}

/**
 * Get budget comparison across multiple fiscal years
 */
async getBudgetComparison(fiscalYears: number[]): Promise<{
  fiscalYear: number;
  totalBudget: number;
  obligated: number;
  remaining: number;
  obligationRate: number;
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
            : 0
        };
      })
    );

    return results.sort((a, b) => b.fiscalYear - a.fiscalYear);
  } catch (error) {
    console.error('Error fetching budget comparison:', error);
    throw error;
  }
}

/**
 * Get budget trends over time with obligation rates
 */
async getBudgetTrends(): Promise<{
  fiscalYear: number;
  totalBudget: number;
  obligated: number;
  remaining: number;
  obligationRate: number;
  growthRate: number;
}[]> {
  try {
    // Get all available fiscal years
    const availableYears = await this.getAvailableFiscalYears();
    
    if (availableYears.length === 0) {
      return [];
    }

    const results = await this.getBudgetComparison(availableYears);
    
    // Add growth rate calculation
    return results.map((result, index) => {
      const previousYear = results[index + 1];
      const growthRate = previousYear && previousYear.totalBudget > 0
        ? ((result.totalBudget - previousYear.totalBudget) / previousYear.totalBudget) * 100
        : 0;

      return {
        ...result,
        growthRate: Number(growthRate.toFixed(1))
      };
    });
  } catch (error) {
    console.error('Error fetching budget trends:', error);
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

// 3. Get budget trends over time
const trends = await snowflakeApi.getBudgetTrends();
console.log('Budget Trends:', trends);

// 4. Get all available fiscal years
const availableYears = await snowflakeApi.getAvailableFiscalYears();
console.log('Available Years:', availableYears);
