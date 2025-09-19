# Budget Obligation Data Explanation

## **Understanding the Data Structure:**

### **What Each Phase Represents:**

1. **"Actual"** = **Obligated/Spent amounts** (money that has been committed/spent)
2. **"Enacted"** = **Enacted budget authority** (money approved by Congress)
3. **"Total"** = **Total budget authority** (complete budget allocation)
4. **"Disc"** = **Discretionary budget** (non-mandatory spending)
5. **"Recon"** = **Reconciliation** (budget adjustments)

### **Current Data Availability:**

| Fiscal Year | Total Budget | Obligated | Enacted | Data Status |
|-------------|--------------|-----------|---------|-------------|
| **2024** | $908.4B | **$117.7B** | $0B | **Historical data with actual obligations** |
| **2025** | $1,545.0B | **$0B** | $121.2B | **Current budget (no obligations yet)** |
| **2026** | $1,917.1B | **$0B** | $0B | **Future budget (no obligations yet)** |

## **Why No Obligation Data for 2025/2026:**

### **FY 2024 (Historical):**
- ✅ **Has "Actual" phase data** = $117.7B obligated
- This represents money that was actually spent/committed in FY 2024

### **FY 2025 (Current):**
- ❌ **No "Actual" phase data** = $0B obligated
- ✅ **Has "Enacted" and "Total" phase data**
- This means the budget has been approved but no money has been obligated yet

### **FY 2026 (Future):**
- ❌ **No "Actual" phase data** = $0B obligated
- ✅ **Has "Total" and "Disc" phase data**
- This is a proposed budget that hasn't been enacted yet

## **Corrected Method for Budget by Fiscal Year:**

```typescript
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
    // Get total budget from summary endpoint
    const summaryResponse = await this.makeGetRequest<BudgetSummaryResponse>(
      `/api/v1/budget/summary?fiscal_year=${fiscalYear}`
    );

    const totalBudget = summaryResponse.summary.reduce(
      (sum, record) => sum + record.TOTAL_AMOUNT_K, 
      0
    );

    // Get detailed phase data
    const detailResponse = await this.getBudgetData({
      fiscalYear: [fiscalYear],
      pageSize: 5000,
    });

    const detailData = detailResponse.data;
    const obligated = detailData
      .filter(record => record.PHASE === 'Actual')
      .reduce((sum, record) => sum + (record.AMOUNT_K || 0), 0);
    
    const enacted = detailData
      .filter(record => record.PHASE === 'Enacted')
      .reduce((sum, record) => sum + (record.AMOUNT_K || 0), 0);

    // Calculate remaining
    const remaining = totalBudget - obligated;

    // Determine data status and explanation
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
```

## **Usage Examples:**

```typescript
// Get budget for each fiscal year
const budget2024 = await snowflakeApi.getBudgetByFiscalYear(2024);
console.log(`FY 2024: ${budget2024.explanation}`);
// Output: "FY 2024 is complete with $117.7B actually obligated/spent."

const budget2025 = await snowflakeApi.getBudgetByFiscalYear(2025);
console.log(`FY 2025: ${budget2025.explanation}`);
// Output: "FY 2025 budget has been enacted but no obligations yet. All $1,545.0B is available."

const budget2026 = await snowflakeApi.getBudgetByFiscalYear(2026);
console.log(`FY 2026: ${budget2026.explanation}`);
// Output: "FY 2026 is a proposed budget. No obligations possible yet."
```

## **Summary:**

- **FY 2024**: Has actual obligation data ($117.7B obligated)
- **FY 2025**: No obligation data yet (budget enacted but not spent)
- **FY 2026**: No obligation data yet (future budget proposal)

The "Actual" phase is the only indicator of obligated amounts, and it's only available for completed fiscal years.
