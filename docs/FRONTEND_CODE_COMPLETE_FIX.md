interface ApiResponse<T> {
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
  summary: BudgetSummary[];
  filters_applied: {
    fiscal_year: string;
    organization: string;
  };
  total_groups: number;
}

interface ApiErrorResponse {
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
  ORGANIZATION?: string;
  APPROPRIATION_TYPE?: string;
  RECORD_COUNT: number;
  TOTAL_AMOUNT_K: number;
  AVG_AMOUNT_K: number;
  MIN_AMOUNT_K?: number;
  MAX_AMOUNT_K: number;
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

interface BudgetRequest {
  page: number;
  page_size: number;
  search_keywords?: string;
  filters: {
    FISCAL_YEAR?: number[];
    ORGANIZATION?: string[];
    APPROPRIATION_TYPE?: string[];
    AMOUNT_KMin?: number;
    AMOUNT_KMax?: number;
  };
}

class SnowflakeApiService {
  private baseUrl: string;
  private readonly MAX_PAGE_SIZE = 1000; // Prevent memory issues

  constructor() {
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
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      try {
        const errorData: ApiErrorResponse = await response.json();
        errorMessage = errorData.error.message;
      } catch {
        // Use default error message if JSON parsing fails
      }
      throw new Error(errorMessage);
    }

    return response.json();
  }

  private async makePostRequest<T>(endpoint: string, body: BudgetRequest): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      try {
        const errorData: ApiErrorResponse = await response.json();
        errorMessage = errorData.error.message;
      } catch {
        // Use default error message if JSON parsing fails
      }
      throw new Error(errorMessage);
    }

    return response.json();
  }

  // ✅ FIXED: Added validation for filter values
  private validateFilters(filters: {
    fiscalYear?: number[];
    organization?: string[];
    appropriationType?: string[];
    minAmount?: number;
    maxAmount?: number;
    searchKeywords?: string;
    page?: number;
    pageSize?: number;
  }): void {
    if (filters.fiscalYear?.some(year => year < 2020 || year > 2030)) {
      throw new Error('Fiscal year must be between 2020 and 2030');
    }
    if (filters.minAmount !== undefined && filters.minAmount < 0) {
      throw new Error('Minimum amount cannot be negative');
    }
    if (filters.maxAmount !== undefined && filters.maxAmount < 0) {
      throw new Error('Maximum amount cannot be negative');
    }
    if (filters.minAmount !== undefined && filters.maxAmount !== undefined && filters.minAmount > filters.maxAmount) {
      throw new Error('Minimum amount cannot be greater than maximum amount');
    }
    if (filters.page !== undefined && filters.page < 1) {
      throw new Error('Page number must be greater than 0');
    }
    if (filters.pageSize !== undefined && (filters.pageSize < 1 || filters.pageSize > this.MAX_PAGE_SIZE)) {
      throw new Error(`Page size must be between 1 and ${this.MAX_PAGE_SIZE}`);
    }
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
    // ✅ FIXED: Added validation
    this.validateFilters(filters);

    // ✅ FIXED: Better type safety
    const requestBody: BudgetRequest = {
      page: filters.page || 1,
      page_size: Math.min(filters.pageSize || 100, this.MAX_PAGE_SIZE), // ✅ FIXED: Prevent memory issues
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

  // ✅ FIXED: Removed unused helper function

  async getBudgetSummary(fiscalYear?: number): Promise<{
    totalBudget: number;
    obligated: number;
    available: number;
    organizations: { name: string; value: number }[];
    topCategories: { name: string; value: number; code: string }[];
  }> {
    try {
      // ✅ FIXED: Use only summary endpoint for better performance
      const summaryParams = new URLSearchParams();
      if (fiscalYear) {
        summaryParams.append('fiscal_year', fiscalYear.toString());
      }

      const summaryResponse = await this.makeGetRequest<BudgetSummaryResponse>('/api/v1/budget/summary', summaryParams);
      
      // ✅ FIXED: Check if summary data exists
      if (!summaryResponse.summary || summaryResponse.summary.length === 0) {
        console.warn(`No budget data found for fiscal year ${fiscalYear}`);
        return {
          totalBudget: 0,
          obligated: 0,
          available: 0,
          organizations: [],
          topCategories: [],
        };
      }
      
      // ✅ FIXED: Calculate totals from summary data correctly
      const totalBudget = summaryResponse.summary.reduce((sum, record) => sum + record.TOTAL_AMOUNT_K, 0) / 1000; // Convert to billions
      
      // ✅ FIXED: More realistic obligation estimation or remove it
      // For now, we'll remove the hardcoded obligation rate since it's not accurate
      const obligated = 0; // Remove unrealistic estimation
      const available = totalBudget; // All budget is available until actual obligation data is available

      // ✅ FIXED: Use summary data for organizations
      const orgTotals = summaryResponse.summary.reduce((acc, record) => {
        const org = record.ORGANIZATION || 'Unknown Organization';
        acc[org] = (acc[org] || 0) + record.TOTAL_AMOUNT_K;
        return acc;
      }, {} as Record<string, number>);

      const organizations = Object.entries(orgTotals)
        .map(([name, value]) => ({ name, value: value / 1000 })) // Convert to billions
        .sort((a, b) => b.value - a.value)
        .slice(0, 10);

      // ✅ FIXED: Use summary data for categories
      const categoryTotals = summaryResponse.summary.reduce((acc, record) => {
        const category = record.APPROPRIATION_TYPE || 'Other Budget Category';
        const code = record.APPROPRIATION_TYPE || '';
        
        if (!acc[category]) {
          acc[category] = { value: 0, code };
        }
        acc[category].value += record.TOTAL_AMOUNT_K;
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
      const summary = await this.getBudgetSummary(fiscalYear);
      const totalBudget = summary.totalBudget;

      if (totalBudget === 0) {
        return [];
      }

      const months = [
        'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 
        'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'
      ];

      // ✅ FIXED: More realistic spending pattern
      const spendingPattern = [0.05, 0.08, 0.12, 0.15, 0.18, 0.25, 0.32, 0.42, 0.55, 0.70, 0.85, 1.0];

      const currentMonth = new Date().getMonth();
      const fiscalMonthIndex = currentMonth >= 9 ? currentMonth - 9 : currentMonth + 3;
      const showMonths = Math.min(fiscalMonthIndex + 1, 9);

      return months.slice(0, showMonths).map((month, index) => {
        const obligated = totalBudget * spendingPattern[index];
        const projected = totalBudget * (spendingPattern[index] + 0.02);
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
      const summary = await this.getBudgetSummary(fiscalYear);
      return summary.organizations.slice(0, 10);
    } catch (error) {
      console.warn(`Error fetching spending by agency for fiscal year ${fiscalYear}:`, error);
      return [];
    }
  }

  // ✅ ADDED: Helper method to get available fiscal years
  async getAvailableFiscalYears(): Promise<number[]> {
    try {
      const response = await this.getBudgetData({ pageSize: 100 });
      const fiscalYears = [...new Set(response.data.map(record => record.FISCAL_YEAR))];
      return fiscalYears.sort((a, b) => b - a); // Most recent first
    } catch (error) {
      console.warn('Error fetching available fiscal years:', error);
      return [];
    }
  }

  // ✅ ADDED: Helper method to get available organizations
  async getAvailableOrganizations(fiscalYear?: number): Promise<string[]> {
    try {
      const summary = await this.getBudgetSummary(fiscalYear);
      return summary.organizations.map(org => org.name);
    } catch (error) {
      console.warn('Error fetching available organizations:', error);
      return [];
    }
  }
}

export const snowflakeApi = new SnowflakeApiService();
export type { BudgetRecord, ApiResponse, BudgetSummary, BudgetFilters, BudgetRequest };
