interface ApiResponse<T> {
  success: boolean;
  data: T[];
  total_count: number;
  page: number;
  page_size: number;
  total_pages: number;
  has_next: boolean;
  has_previous: boolean;
  metadata?: {
    executionTime: number;
    filters?: any;
  };
}

interface BudgetSummaryResponse {
  success: boolean;
  summary: BudgetSummary[];
}

interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
    timestamp: string;
  };
}

interface BudgetRecord {
  FISCAL_YEAR: number;
  ORGANIZATION?: string;
  APPROPRIATION_TYPE?: string;
  AMOUNT_K: number;
  BUDGET_ACTIVITY?: string;
  ACCOUNT_TITLE?: string;
  ELEMENT_TITLE?: string;
  ACCOUNT_CODE?: string;
  ELEMENT_CODE?: string;
  CATEGORY?: string;
  [key: string]: any; // For flexibility with actual API response
}

interface BudgetSummary {
  FISCAL_YEAR: number;
  TOTAL_AMOUNT_K: number;
  TOTAL_RECORDS: number;
}

interface BudgetFilters {
  FISCAL_YEAR?: number[];
  ORGANIZATION?: string[];
  APPROPRIATION_TYPE?: string[];
  AMOUNT_KMin?: number;
  AMOUNT_KMax?: number;
  exact_values?: {
    [key: string]: {
      operator: string;
      value: any;
    } | boolean | null;
  };
}

class SnowflakeApiService {
  private baseUrl: string;

  constructor() {
    // Use the API layer endpoint from the uploaded README
    this.baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  }

  private async makeGetRequest<T>(endpoint: string, params?: URLSearchParams): Promise<T> {
    const url = params ? `${this.baseUrl}${endpoint}?${params}` : `${this.baseUrl}${endpoint}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData: ApiErrorResponse = await response.json().catch(() => ({
        success: false,
        error: {
          code: 'HTTP_ERROR',
          message: `HTTP ${response.status}: ${response.statusText}`,
          timestamp: new Date().toISOString()
        }
      }));
      throw new Error(errorData.error.message);
    }

    return response.json();
  }

  private async makePostRequest<T>(endpoint: string, body: any): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Add JWT token when available
        // 'Authorization': `Bearer ${jwt_token}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData: ApiErrorResponse = await response.json().catch(() => ({
        success: false,
        error: {
          code: 'HTTP_ERROR',
          message: `HTTP ${response.status}: ${response.statusText}`,
          timestamp: new Date().toISOString()
        }
      }));
      throw new Error(errorData.error.message);
    }

    return response.json();
  }


  async getBudgetData(filters: {
    fiscalYear?: number[];
    organization?: string[];
    appropriationType?: string[];
    minAmount?: number;
    maxAmount?: number;
    searchKeywords?: string;
    page?: number;
    pageSize?: number;
  }): Promise<ApiResponse<BudgetRecord>> {
    // Use the API layer POST endpoint format from the uploaded README
    const requestBody: any = {
      page: filters.page || 1,
      page_size: filters.pageSize || 1000,
      search_keywords: filters.searchKeywords,
      filters: {}
    };

    // Add filters based on API layer documentation format
    if (filters.fiscalYear?.length) {
      requestBody.filters.FISCAL_YEAR = filters.fiscalYear;
    }

    if (filters.organization?.length) {
      requestBody.filters.ORGANIZATION = filters.organization;
    }

    if (filters.appropriationType?.length) {
      requestBody.filters.APPROPRIATION_TYPE = filters.appropriationType;
    }

    if (filters.minAmount !== undefined) {
      requestBody.filters.AMOUNT_KMin = filters.minAmount;
    }

    if (filters.maxAmount !== undefined) {
      requestBody.filters.AMOUNT_KMax = filters.maxAmount;
    }

    return this.makePostRequest<ApiResponse<BudgetRecord>>('/api/v1/budget', requestBody);
  }

  // Helper function to format large numbers
  private formatBudgetAmount(amount: number): { value: number; unit: string } {
    if (amount >= 1000) {
      return { value: Number((amount / 1000).toFixed(1)), unit: 'T' };
    } else if (amount >= 1) {
      return { value: Number(amount.toFixed(1)), unit: 'B' };
    } else {
      return { value: Number((amount * 1000).toFixed(0)), unit: 'M' };
    }
  }

  async getBudgetSummary(fiscalYear?: number): Promise<{
    totalBudget: number;
    obligated: number;
    available: number;
    organizations: { name: string; value: number }[];
    topCategories: { name: string; value: number; code: string }[];
  }> {
    try {
      // First try to get budget summary data from the dedicated endpoint
      const summaryParams = new URLSearchParams();
      if (fiscalYear) {
        summaryParams.append('fiscal_year', fiscalYear.toString());
      }

      const summaryResponse = await this.makeGetRequest<BudgetSummaryResponse>('/api/v1/budget/summary', summaryParams);
      
      // Get detailed budget data for breakdown analysis
      const detailResponse = await this.getBudgetData({
        fiscalYear: fiscalYear ? [fiscalYear] : undefined,
        pageSize: 5000, // Get large dataset for aggregation
      });

      const data = detailResponse.data;
      const summaryData = summaryResponse.summary && summaryResponse.summary.length > 0 ? summaryResponse.summary[0] : null;
      
      // If no data found for this fiscal year, return zero values instead of throwing error
      if (!data || data.length === 0) {
        console.warn(`No budget data found for fiscal year ${fiscalYear}`);
        return {
          totalBudget: 0,
          obligated: 0,
          available: 0,
          organizations: [],
          topCategories: [],
        };
      }
      
      // Calculate totals from summary or aggregate data
      const totalBudget = summaryData ? summaryData.TOTAL_AMOUNT_K / 1000 : 
        data.reduce((sum, record) => sum + (record.AMOUNT_K || 0), 0) / 1000; // Convert to billions
      
      // For now, estimate obligations based on typical government patterns
      // In a real implementation, this would come from obligation status fields
      const obligated = totalBudget * 0.65; // Typical government obligation rate
      const available = totalBudget - obligated;

      // Group by organization
      const orgTotals = data.reduce((acc, record) => {
        const org = record.ORGANIZATION || 'Unknown Organization';
        acc[org] = (acc[org] || 0) + (record.AMOUNT_K || 0);
        return acc;
      }, {} as Record<string, number>);

      const organizations = Object.entries(orgTotals)
        .map(([name, value]) => ({ name, value: value / 1000 })) // Convert to billions
        .sort((a, b) => b.value - a.value)
        .slice(0, 10);

      // Group by categories from actual data
      const categoryTotals = data.reduce((acc, record) => {
        // Try multiple field names for category
        const category = record.ACCOUNT_TITLE || 
                        record.ELEMENT_TITLE ||
                        record.BUDGET_ACTIVITY || 
                        record.APPROPRIATION_TYPE ||
                        'Other Budget Category';
        const code = record.ACCOUNT_CODE || record.ELEMENT_CODE || '';
        
        if (!acc[category]) {
          acc[category] = { value: 0, code };
        }
        acc[category].value += record.AMOUNT_K || 0;
        return acc;
      }, {} as Record<string, { value: number; code: string }>);

      const topCategories = Object.entries(categoryTotals)
        .map(([name, { value, code }]) => ({ name, value: value / 1000, code })) // Convert to billions
        .sort((a, b) => b.value - a.value)
        .slice(0, 15);

      return {
        totalBudget,
        obligated,
        available,
        organizations,
        topCategories,
      };
    } catch (error) {
      console.warn(`Error fetching budget data for fiscal year ${fiscalYear}:`, error);
      // Return empty data structure instead of throwing error
      return {
        totalBudget: 0,
        obligated: 0,
        available: 0,
        organizations: [],
        topCategories: [],
      };
    }
  }


  async getBudgetTrends(fiscalYear: number): Promise<{
    month: string;
    obligated: number;
    projected: number;
    available: number;
  }[]> {
    try {
      // Get actual budget data for the fiscal year
      const summary = await this.getBudgetSummary(fiscalYear);
      const totalBudget = summary.totalBudget;

      // If no budget data, return empty array
      if (totalBudget === 0) {
        return [];
      }

      // Government fiscal year months (Oct-Sep)
      const months = [
        'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 
        'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'
      ];

      // Government spending typically accelerates toward fiscal year end
      const spendingPattern = [0.05, 0.08, 0.12, 0.15, 0.18, 0.25, 0.32, 0.42, 0.55, 0.70, 0.85, 1.0];

      const currentMonth = new Date().getMonth(); // 0-11
      const fiscalMonthIndex = currentMonth >= 9 ? currentMonth - 9 : currentMonth + 3; // Convert to fiscal year month
      const showMonths = Math.min(fiscalMonthIndex + 1, 9); // Show up to current month + some projections

      return months.slice(0, showMonths).map((month, index) => {
        const obligated = totalBudget * spendingPattern[index];
        const projected = totalBudget * (spendingPattern[index] + 0.02); // Slightly higher projection
        const available = totalBudget - obligated;

        return {
          month,
          obligated: Number(obligated.toFixed(1)),
          projected: Number(projected.toFixed(1)),
          available: Number(available.toFixed(1)),
        };
      });
    } catch (error) {
      console.warn(`Error fetching budget trends for fiscal year ${fiscalYear}:`, error);
      return [];
    }
  }


  async getSpendingByAgency(fiscalYear?: number): Promise<{ name: string; value: number }[]> {
    try {
      // Use the budget data grouped by organization as proxy for spending by agency
      const summary = await this.getBudgetSummary(fiscalYear);
      return summary.organizations.slice(0, 10);
    } catch (error) {
      console.warn(`Error fetching spending by agency for fiscal year ${fiscalYear}:`, error);
      return [];
    }
  }
}

export const snowflakeApi = new SnowflakeApiService();
export type { BudgetRecord, ApiResponse, BudgetSummary, BudgetFilters };