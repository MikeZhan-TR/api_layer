// Add this method to your SnowflakeApiService class

/**
 * Get budget summary by fiscal year with total, obligated, and remaining amounts
 * Based on actual data structure where:
 * - FY 2024: Only "Actual" (obligated amounts)
 * - FY 2025: "Enacted" and "Total" (budget authority)
 * - FY 2026: "Total", "Disc" (discretionary), "Recon" (reconciliation)
 */
async getBudgetByFiscalYear(fiscalYear: number): Promise<{
  fiscalYear: number;
  totalBudget: number;
  obligated: number;
  remaining: number;
  enacted?: number;
  discretionary?: number;
  reconciliation?: number;
  breakdown: {
    phase: string;
    amount: number;
    percentage: number;
  }[];
  dataAvailability: {
    hasObligated: boolean;
    hasEnacted: boolean;
    hasTotal: boolean;
    hasDiscretionary: boolean;
  };
}> {
  try {
    // Get budget data for the specified fiscal year
    const response = await this.getBudgetData({
      fiscalYear: [fiscalYear],
      pageSize: 5000, // Get all records for accurate calculation
    });

    if (!response.data || response.data.length === 0) {
      throw new Error(`No budget data found for fiscal year ${fiscalYear}`);
    }

    const data = response.data;

    // Group by phase to calculate different budget amounts
    const phaseTotals = data.reduce((acc, record) => {
      const phase = record.PHASE || 'Unknown';
      acc[phase] = (acc[phase] || 0) + (record.AMOUNT_K || 0);
      return acc;
    }, {} as Record<string, number>);

    // Calculate amounts based on available phases
    const totalBudget = phaseTotals['Total'] || 0;
    const obligated = phaseTotals['Actual'] || 0;
    const enacted = phaseTotals['Enacted'] || 0;
    const discretionary = phaseTotals['Disc'] || 0;
    const reconciliation = phaseTotals['Recon'] || 0;
    
    // Calculate remaining based on what data is available
    let remaining = 0;
    if (totalBudget > 0 && obligated > 0) {
      // If we have both total and obligated, calculate remaining
      remaining = totalBudget - obligated;
    } else if (enacted > 0 && obligated > 0) {
      // If we have enacted and obligated, use enacted as total
      remaining = enacted - obligated;
    } else if (totalBudget > 0) {
      // If we only have total, remaining equals total (no obligations yet)
      remaining = totalBudget;
    }

    // Create breakdown array
    const breakdown = Object.entries(phaseTotals)
      .map(([phase, amount]) => ({
        phase,
        amount: amount / 1000, // Convert to billions
        percentage: totalBudget > 0 ? (amount / totalBudget) * 100 : 0
      }))
      .sort((a, b) => b.amount - a.amount);

    // Determine data availability
    const dataAvailability = {
      hasObligated: obligated > 0,
      hasEnacted: enacted > 0,
      hasTotal: totalBudget > 0,
      hasDiscretionary: discretionary > 0
    };

    return {
      fiscalYear,
      totalBudget: totalBudget / 1000, // Convert to billions
      obligated: obligated / 1000, // Convert to billions
      remaining: remaining / 1000, // Convert to billions
      enacted: enacted > 0 ? enacted / 1000 : undefined,
      discretionary: discretionary > 0 ? discretionary / 1000 : undefined,
      reconciliation: reconciliation > 0 ? reconciliation / 1000 : undefined,
      breakdown,
      dataAvailability
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
  dataStatus: string;
}[]> {
  try {
    const results = await Promise.all(
      fiscalYears.map(async (year) => {
        const budget = await this.getBudgetByFiscalYear(year);
        
        // Determine data status
        let dataStatus = '';
        if (budget.dataAvailability.hasObligated && budget.dataAvailability.hasTotal) {
          dataStatus = 'Complete (Total + Obligated)';
        } else if (budget.dataAvailability.hasObligated) {
          dataStatus = 'Obligated Only';
        } else if (budget.dataAvailability.hasTotal) {
          dataStatus = 'Budget Authority Only';
        } else {
          dataStatus = 'Limited Data';
        }

        return {
          fiscalYear: budget.fiscalYear,
          totalBudget: budget.totalBudget,
          obligated: budget.obligated,
          remaining: budget.remaining,
          obligationRate: budget.totalBudget > 0 
            ? (budget.obligated / budget.totalBudget) * 100 
            : 0,
          dataStatus
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
  dataStatus: string;
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
console.log(`FY 2024: Obligated: $${budget2024.obligated}B (${budget2024.dataAvailability.hasObligated ? 'Actual' : 'No'} data)`);

const budget2025 = await snowflakeApi.getBudgetByFiscalYear(2025);
console.log(`FY 2025: Total: $${budget2025.totalBudget}B, Enacted: $${budget2025.enacted}B`);

const budget2026 = await snowflakeApi.getBudgetByFiscalYear(2026);
console.log(`FY 2026: Total: $${budget2026.totalBudget}B, Discretionary: $${budget2026.discretionary}B`);

// 2. Get budget comparison across years
const comparison = await snowflakeApi.getBudgetComparison([2024, 2025, 2026]);
console.log('Budget Comparison:', comparison);

// 3. Get budget trends over time
const trends = await snowflakeApi.getBudgetTrends();
console.log('Budget Trends:', trends);

// 4. Get all available fiscal years
const availableYears = await snowflakeApi.getAvailableFiscalYears();
console.log('Available Years:', availableYears);
