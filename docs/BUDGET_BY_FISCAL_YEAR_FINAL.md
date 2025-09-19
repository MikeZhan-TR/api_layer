// Add this method to your SnowflakeApiService class

/**
 * Get budget summary by fiscal year with total, obligated, and remaining amounts
 * CORRECTED APPROACH: Use summary endpoint for totals, detailed endpoint for phase breakdown
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
  note: string;
}> {
  try {
    // 1. Get total budget from summary endpoint (this gives us the complete picture)
    const summaryResponse = await this.makeGetRequest<BudgetSummaryResponse>(
      `/api/v1/budget/summary?fiscal_year=${fiscalYear}`
    );

    if (!summaryResponse.summary || summaryResponse.summary.length === 0) {
      throw new Error(`No budget data found for fiscal year ${fiscalYear}`);
    }

    // Calculate total budget from summary (this is the authoritative total)
    const totalBudget = summaryResponse.summary.reduce(
      (sum, record) => sum + record.TOTAL_AMOUNT_K, 
      0
    );

    // 2. Get detailed phase data to understand what's obligated vs available
    const detailResponse = await this.getBudgetData({
      fiscalYear: [fiscalYear],
      pageSize: 5000,
    });

    const detailData = detailResponse.data;

    // Group detailed data by phase
    const phaseTotals = detailData.reduce((acc, record) => {
      const phase = record.PHASE || 'Unknown';
      acc[phase] = (acc[phase] || 0) + (record.AMOUNT_K || 0);
      return acc;
    }, {} as Record<string, number>);

    // Calculate phase amounts
    const obligated = phaseTotals['Actual'] || 0;
    const enacted = phaseTotals['Enacted'] || 0;
    const discretionary = phaseTotals['Disc'] || 0;
    const reconciliation = phaseTotals['Recon'] || 0;
    
    // Calculate remaining
    // For FY 2024: Only obligated data available, so remaining = total - obligated
    // For FY 2025/2026: Use total budget authority minus any obligated amounts
    let remaining = 0;
    if (fiscalYear === 2024) {
      // FY 2024: We have obligated amounts, remaining is total - obligated
      remaining = totalBudget - obligated;
    } else {
      // FY 2025/2026: Use total budget authority (no obligations yet)
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

    // Add total budget to breakdown
    breakdown.unshift({
      phase: 'Total Budget Authority',
      amount: totalBudget / 1000,
      percentage: 100
    });

    // Determine data availability
    const dataAvailability = {
      hasObligated: obligated > 0,
      hasEnacted: enacted > 0,
      hasTotal: totalBudget > 0,
      hasDiscretionary: discretionary > 0
    };

    // Create explanatory note
    let note = '';
    if (fiscalYear === 2024) {
      note = 'FY 2024: Historical data showing actual obligated amounts. Remaining calculated as Total Budget Authority minus Obligated.';
    } else if (fiscalYear === 2025) {
      note = 'FY 2025: Current budget authority. No obligations yet, so remaining equals total budget.';
    } else if (fiscalYear === 2026) {
      note = 'FY 2026: Future budget authority. No obligations yet, so remaining equals total budget.';
    }

    return {
      fiscalYear,
      totalBudget: totalBudget / 1000, // Convert to billions
      obligated: obligated / 1000, // Convert to billions
      remaining: remaining / 1000, // Convert to billions
      enacted: enacted > 0 ? enacted / 1000 : undefined,
      discretionary: discretionary > 0 ? discretionary / 1000 : undefined,
      reconciliation: reconciliation > 0 ? reconciliation / 1000 : undefined,
      breakdown,
      dataAvailability,
      note
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
console.log(`FY 2024: Total: $${budget2024.totalBudget}B, Obligated: $${budget2024.obligated}B, Remaining: $${budget2024.remaining}B`);
console.log(`Note: ${budget2024.note}`);

const budget2025 = await snowflakeApi.getBudgetByFiscalYear(2025);
console.log(`FY 2025: Total: $${budget2025.totalBudget}B, Obligated: $${budget2025.obligated}B, Remaining: $${budget2025.remaining}B`);
console.log(`Note: ${budget2025.note}`);

const budget2026 = await snowflakeApi.getBudgetByFiscalYear(2026);
console.log(`FY 2026: Total: $${budget2026.totalBudget}B, Obligated: $${budget2026.obligated}B, Remaining: $${budget2026.remaining}B`);
console.log(`Note: ${budget2026.note}`);

// 2. Get budget comparison across years
const comparison = await snowflakeApi.getBudgetComparison([2024, 2025, 2026]);
console.log('Budget Comparison:', comparison);

// 3. Get budget trends over time
const trends = await snowflakeApi.getBudgetTrends();
console.log('Budget Trends:', trends);
