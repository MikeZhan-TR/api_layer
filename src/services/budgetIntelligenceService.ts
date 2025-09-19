/**
 * DoD Budget Intelligence Service
 * Migrated from foundry-point-prod backend to api_layer
 * Provides comprehensive budget analytics and intelligence
 */

import { snowflakeService } from './snowflakeService';
import { createLogger } from '../utils/logger';

const logger = createLogger();

// Database configuration for budget data
const BUDGET_CONFIG = {
  database: 'FOUNDRY',
  schema: 'BUDGET',
  table: 'UNIFIED',
  p40Table: 'P40'
};

export interface BudgetProgramsSummary {
  total_budget: number;
  total_programs: number;
  total_organizations: number;
  total_categories: number;
  contract_linkable_programs: number;
  pe_programs: number;
  bli_programs: number;
  weapons_programs: number;
  fy_2024_total: number;
  fy_2025_total: number;
  fy_2026_total: number;
  real_utilization_rate?: number;
  total_obligated?: number;
}

export interface AccountShift {
  branch: string;
  branch_display_name: string;
  fy2025_budget: number;
  fy2026_budget: number;
  budget_change: number;
  change_percent: number;
}

export interface BudgetExecutionTrend {
  identifier: string;
  program_name: string;
  category: string;
  organization: string;
  budget_amount: number;
  spent_amount: number;
  remaining_amount: number;
  execution_rate: number;
  variance_rate?: number;
  requested_amount: number;
  enacted_amount: number;
  actual_amount: number;
  reconciliation_amount: number;
  total_program_amount: number;
  supplemental_amount: number;
  total_authorized_amount: number;
  phases_available: number;
  contract_linkable: boolean;
}

export interface BudgetProgram {
  identifier: string;
  program_name: string;
  appropriation_type: string;
  account_code: string;
  primary_budget_amount: number;
  fiscal_year: number;
  phase: string;
  category: string;
  identifier_type: string;
  organization: string;
  contract_linkable: boolean;
  fy_2024_budget: number;
  fy_2025_budget: number;
  fy_2026_budget: number;
}

export interface CategoryBudget {
  category: string;
  total_programs: number;
  total_budget: number;
  organizations_count: number;
  percentage_of_total: number;
}

export interface WeaponsIntelligence {
  summary: {
    total_categories: number;
  };
  high_value_systems: Array<{
    weapons_category: string;
    organization: string;
    system_count: number;
    total_budget: number;
    avg_budget: number;
  }>;
  categories: string[];
  organizations: string[];
}

export class DoDBudgetIntelligence {
  private unifiedTable: string;
  private p40Table: string;

  constructor() {
    this.unifiedTable = `${BUDGET_CONFIG.database}.${BUDGET_CONFIG.schema}.${BUDGET_CONFIG.table}`;
    this.p40Table = `${BUDGET_CONFIG.database}.${BUDGET_CONFIG.schema}.${BUDGET_CONFIG.p40Table}`;
  }

  async connect(): Promise<boolean> {
    try {
      const isConnected = await snowflakeService.testConnection();
      if (isConnected) {
        logger.info('DoDBudgetIntelligence connection successful');
        return true;
      }
      return false;
    } catch (error) {
      logger.error('DoDBudgetIntelligence connection failed:', error);
      return false;
    }
  }

  async executeQuery(query: string, params?: any[]): Promise<any[]> {
    try {
      const result = await snowflakeService.executeQuery(query, params || []);
      return result.rows;
    } catch (error) {
      logger.error('Query execution failed:', error);
      return [];
    }
  }

  async get_budget_programs_summary(): Promise<BudgetProgramsSummary> {
    try {
      // Main budget summary query - prioritize Enacted for 2025, Actual for 2024
      const budgetQuery = `
        WITH all_data AS (
            -- FY2025: Include both Total and Enacted phases (prioritize Enacted)
            SELECT *, 1 as data_source
            FROM ${this.unifiedTable}
            WHERE FISCAL_YEAR = 2025 AND PHASE IN ('Total', 'Enacted')
            UNION ALL
            -- FY2024: Include Total and Actual phases (prioritize Actual)
            SELECT *, 2 as data_source
            FROM ${this.unifiedTable}
            WHERE FISCAL_YEAR = 2024 AND PHASE IN ('Total', 'Actual')
            UNION ALL
            -- Other years: Use only Total phase
            SELECT *, 3 as data_source
            FROM ${this.unifiedTable}
            WHERE FISCAL_YEAR NOT IN (2024, 2025) AND PHASE = 'Total'
        ),
        phase_prioritized AS (
            SELECT *,
                   ROW_NUMBER() OVER (
                       PARTITION BY ELEMENT_CODE, FISCAL_YEAR, APPROPRIATION_TYPE
                       ORDER BY CASE 
                           WHEN FISCAL_YEAR = 2025 AND PHASE = 'Enacted' THEN 1
                           WHEN FISCAL_YEAR = 2025 AND PHASE = 'Total' THEN 2
                           WHEN FISCAL_YEAR = 2024 AND PHASE = 'Actual' THEN 1
                           WHEN FISCAL_YEAR = 2024 AND PHASE = 'Total' THEN 2
                           ELSE 3
                       END
                   ) as phase_rank
            FROM all_data
            WHERE FISCAL_YEAR IN (2024, 2025)
            UNION ALL
            SELECT *, 1 as phase_rank FROM all_data WHERE FISCAL_YEAR NOT IN (2024, 2025)
        )
        SELECT
            SUM(AMOUNT_K) * 1000 as total_budget,
            COUNT(DISTINCT ELEMENT_CODE) as total_programs,
            COUNT(DISTINCT APPROPRIATION_TYPE) as total_organizations,
            COUNT(DISTINCT
                CASE
                    WHEN APPROPRIATION_TYPE LIKE '%R1_RDT%' THEN 'R&D'
                    WHEN APPROPRIATION_TYPE LIKE '%P1_Procurement%' THEN 'Procurement'
                    WHEN APPROPRIATION_TYPE LIKE '%O1_OpMaint%' THEN 'Operations'
                    WHEN APPROPRIATION_TYPE LIKE '%M1_MilCon%' THEN 'Military Construction'
                    ELSE 'Other'
                END
            ) as total_categories,
            COUNT(DISTINCT CASE WHEN ELEMENT_CODE IS NOT NULL AND ELEMENT_CODE != '0' THEN ELEMENT_CODE END) as contract_linkable_programs,
            COUNT(DISTINCT CASE WHEN APPROPRIATION_TYPE LIKE '%R1_%' THEN ELEMENT_CODE END) as pe_programs,
            COUNT(DISTINCT CASE WHEN APPROPRIATION_TYPE LIKE '%P1_%' THEN ELEMENT_CODE END) as bli_programs,
            COUNT(DISTINCT CASE WHEN APPROPRIATION_TYPE LIKE '%P1_%' THEN ELEMENT_CODE END) as weapons_programs,
            SUM(CASE WHEN FISCAL_YEAR = 2024 THEN AMOUNT_K ELSE 0 END) * 1000 as fy_2024_total,
            SUM(CASE WHEN FISCAL_YEAR = 2025 THEN AMOUNT_K ELSE 0 END) * 1000 as fy_2025_total,
            SUM(CASE WHEN FISCAL_YEAR = 2026 THEN AMOUNT_K ELSE 0 END) * 1000 as fy_2026_total
        FROM phase_prioritized
        WHERE phase_rank = 1
      `;

      // Real utilization calculation using available phases
      const utilizationQuery = `
        WITH budget_execution AS (
            -- FY2025 Enacted vs Total budget analysis
            SELECT
                SUM(CASE WHEN PHASE = 'Enacted' AND FISCAL_YEAR = 2025 THEN AMOUNT_K ELSE 0 END) * 1000 as fy2025_enacted,
                SUM(CASE WHEN PHASE = 'Total' AND FISCAL_YEAR = 2025 THEN AMOUNT_K ELSE 0 END) * 1000 as fy2025_total,
                -- FY2024 Actual execution for utilization baseline
                SUM(CASE WHEN PHASE = 'Actual' AND FISCAL_YEAR = 2024 THEN AMOUNT_K ELSE 0 END) * 1000 as fy2024_actual,
                -- Historical actual execution for utilization baseline
                SUM(CASE WHEN PHASE = 'Actual' THEN AMOUNT_K ELSE 0 END) * 1000 as historical_actual,
                SUM(CASE WHEN PHASE = 'Total' THEN AMOUNT_K ELSE 0 END) * 1000 as total_budget_all_years
            FROM ${this.unifiedTable}
            WHERE PHASE IN ('Enacted', 'Actual', 'Total')
        )
        SELECT
            fy2025_enacted,
            fy2025_total,
            fy2024_actual,
            historical_actual,
            total_budget_all_years,
            -- Calculate real budget utilization: Enacted/Actual ÷ Total Available
            CASE
                WHEN total_budget_all_years > 0 AND fy2025_enacted > 0 THEN ROUND(CAST(fy2025_enacted AS FLOAT) / CAST(total_budget_all_years AS FLOAT), 3)
                -- Fallback: FY2024 Actual execution rate
                WHEN total_budget_all_years > 0 AND fy2024_actual > 0 THEN ROUND(CAST(fy2024_actual AS FLOAT) / CAST(total_budget_all_years AS FLOAT), 3)
                -- Fallback: Historical execution rate
                WHEN total_budget_all_years > 0 AND historical_actual > 0 THEN ROUND(CAST(historical_actual AS FLOAT) / CAST(total_budget_all_years AS FLOAT), 3)
                ELSE NULL -- No fallback - return NULL if real data unavailable
            END as real_utilization_rate
        FROM budget_execution
      `;

      // Execute budget summary query
      const resultRows = await this.executeQuery(budgetQuery);
      if (resultRows.length === 0) {
        return {} as BudgetProgramsSummary;
      }

      const result = resultRows[0];

      // Execute utilization query
      const utilizationRows = await this.executeQuery(utilizationQuery);
      
      let real_utilization_rate: number | undefined;
      let total_obligated: number | undefined;

      if (utilizationRows.length > 0) {
        const utilization = utilizationRows[0];
        real_utilization_rate = utilization.REAL_UTILIZATION_RATE;
        
        const fy2025_enacted = parseFloat(utilization.FY2025_ENACTED || 0);
        const fy2024_actual = parseFloat(utilization.FY2024_ACTUAL || 0);
        const historical_actual = parseFloat(utilization.HISTORICAL_ACTUAL || 0);

        if (fy2025_enacted > 0) {
          total_obligated = fy2025_enacted;
          logger.info(`Using FY2025 Enacted as obligated: $${total_obligated.toLocaleString()}`);
        } else if (fy2024_actual > 0) {
          total_obligated = fy2024_actual;
          logger.info(`Using FY2024 Actual as obligated: $${total_obligated.toLocaleString()}`);
        } else if (historical_actual > 0) {
          total_obligated = historical_actual;
          logger.info(`Using historical actual as obligated: $${total_obligated.toLocaleString()}`);
        } else if (real_utilization_rate !== null && real_utilization_rate !== undefined) {
          const total_budget = parseFloat(result.TOTAL_BUDGET);
          total_obligated = total_budget * real_utilization_rate;
          logger.info(`Calculated obligated: $${total_obligated.toLocaleString()}`);
        } else {
          total_obligated = undefined;
          logger.info('No real utilization rate available - total_obligated set to undefined');
        }

        if (real_utilization_rate !== null && real_utilization_rate !== undefined) {
          logger.info(`Real utilization rate: ${(real_utilization_rate * 100).toFixed(1)}%`);
        } else {
          logger.info('Real utilization rate: undefined (no real data available)');
        }
      } else {
        logger.warning('No utilization data found - returning undefined for utilization metrics');
        real_utilization_rate = undefined;
        total_obligated = undefined;
      }

      const summary: BudgetProgramsSummary = {
        total_budget: parseFloat(result.TOTAL_BUDGET || 0),
        total_programs: parseInt(result.TOTAL_PROGRAMS || 0),
        total_organizations: parseInt(result.TOTAL_ORGANIZATIONS || 0),
        total_categories: parseInt(result.TOTAL_CATEGORIES || 0),
        contract_linkable_programs: parseInt(result.CONTRACT_LINKABLE_PROGRAMS || 0),
        pe_programs: parseInt(result.PE_PROGRAMS || 0),
        bli_programs: parseInt(result.BLI_PROGRAMS || 0),
        weapons_programs: parseInt(result.WEAPONS_PROGRAMS || 0),
        fy_2024_total: parseFloat(result.FY_2024_TOTAL || 0),
        fy_2025_total: parseFloat(result.FY_2025_TOTAL || 0),
        fy_2026_total: parseFloat(result.FY_2026_TOTAL || 0)
      };

      if (real_utilization_rate !== undefined) {
        summary.real_utilization_rate = real_utilization_rate;
      }
      
      if (total_obligated !== undefined) {
        summary.total_obligated = Math.round(total_obligated);
      }

      return summary;
    } catch (error) {
      logger.error('Error getting budget programs summary:', error);
      return {} as BudgetProgramsSummary;
    }
  }

  async get_account_shifts_analysis(): Promise<AccountShift[]> {
    try {
      // Debug: Check what organizations actually exist
      const debugQuery = `
        SELECT DISTINCT 
            COALESCE(ORGANIZATION, 'DoD') as ORGANIZATION,
            COUNT(*) as record_count,
            SUM(CASE WHEN FISCAL_YEAR = 2025 THEN AMOUNT_K ELSE 0 END) as fy2025_total,
            SUM(CASE WHEN FISCAL_YEAR = 2026 THEN AMOUNT_K ELSE 0 END) as fy2026_total
        FROM ${this.unifiedTable}
        WHERE PHASE = 'Total' AND FISCAL_YEAR IN (2025, 2026)
        GROUP BY COALESCE(ORGANIZATION, 'DoD')
        ORDER BY fy2025_total DESC
      `;

      const debugResult = await this.executeQuery(debugQuery);
      if (debugResult.length > 0) {
        logger.info('=== ORGANIZATION DEBUG INFO ===');
        debugResult.forEach(row => {
          const org = row.ORGANIZATION;
          const count = row.RECORD_COUNT;
          const fy2025 = row.FY2025_TOTAL;
          const fy2026 = row.FY2026_TOTAL;
          logger.info(`Org: ${org} | Records: ${count} | FY2025: $${fy2025.toLocaleString()}K | FY2026: $${fy2026.toLocaleString()}K`);
        });
      }

      const query = `
        WITH yearly_budget AS (
            SELECT 
                COALESCE(ORGANIZATION, 'DoD') as ORGANIZATION,
                FISCAL_YEAR,
                SUM(AMOUNT_K) * 1000 as TOTAL_BUDGET
            FROM ${this.unifiedTable}
            WHERE PHASE = 'Total' AND FISCAL_YEAR IN (2025, 2026)
              AND COALESCE(ORGANIZATION, 'DoD') IN ('A', 'N', 'F', 'M', 'S', 'DoD')
            GROUP BY COALESCE(ORGANIZATION, 'DoD'), FISCAL_YEAR
        ),
        budget_comparison AS (
            SELECT 
                ORGANIZATION,
                SUM(CASE WHEN FISCAL_YEAR = 2025 THEN TOTAL_BUDGET ELSE 0 END) as FY2025_BUDGET,
                SUM(CASE WHEN FISCAL_YEAR = 2026 THEN TOTAL_BUDGET ELSE 0 END) as FY2026_BUDGET
            FROM yearly_budget
            GROUP BY ORGANIZATION
            HAVING 
                SUM(CASE WHEN FISCAL_YEAR = 2025 THEN TOTAL_BUDGET ELSE 0 END) > 0 OR
                SUM(CASE WHEN FISCAL_YEAR = 2026 THEN TOTAL_BUDGET ELSE 0 END) > 0
        )
        SELECT 
            ORGANIZATION as branch,
            COALESCE(FY2025_BUDGET, 0) as fy2025_budget,
            COALESCE(FY2026_BUDGET, 0) as fy2026_budget,
            (COALESCE(FY2026_BUDGET, 0) - COALESCE(FY2025_BUDGET, 0)) as budget_change,
            CASE WHEN COALESCE(FY2025_BUDGET, 0) > 0 THEN ROUND(((COALESCE(FY2026_BUDGET, 0) - COALESCE(FY2025_BUDGET, 0)) / FY2025_BUDGET) * 100, 1) ELSE 0.0 END as change_percent,
            CASE
                WHEN ORGANIZATION = 'A' THEN 'ARMY'
                WHEN ORGANIZATION = 'N' THEN 'NAVY'
                WHEN ORGANIZATION = 'F' THEN 'AIR_FORCE'
                WHEN ORGANIZATION = 'M' THEN 'MARINES'
                WHEN ORGANIZATION = 'S' THEN 'SPACE_FORCE'
                WHEN ORGANIZATION = 'DoD' THEN 'DEFENSE'
                ELSE UPPER(ORGANIZATION)
            END as branch_display_name
        FROM budget_comparison
        WHERE ORGANIZATION IN ('A', 'N', 'F', 'M', 'S', 'DoD')
        ORDER BY COALESCE(FY2025_BUDGET, 0) DESC
      `;

      const result = await this.executeQuery(query);
      logger.info(`Account shifts query returned ${result.length} rows`);

      if (result.length > 0) {
        logger.info('=== ACCOUNT SHIFTS RESULTS ===');
        result.forEach(row => {
          const branch = row.BRANCH || 'Unknown';
          const branchDisplay = row.BRANCH_DISPLAY_NAME || 'Unknown';
          const fy2025 = row.FY2025_BUDGET || 0;
          const fy2026 = row.FY2026_BUDGET || 0;
          const changePct = row.CHANGE_PERCENT || 0;
          logger.info(`Branch: ${branch} | Display: ${branchDisplay} | FY2025: $${fy2025.toLocaleString()} | FY2026: $${fy2026.toLocaleString()} | Change: ${changePct}%`);
        });
      }

      return result.map(row => ({
        branch: row.BRANCH,
        branch_display_name: row.BRANCH_DISPLAY_NAME,
        fy2025_budget: parseFloat(row.FY2025_BUDGET || 0),
        fy2026_budget: parseFloat(row.FY2026_BUDGET || 0),
        budget_change: parseFloat(row.BUDGET_CHANGE || 0),
        change_percent: parseFloat(row.CHANGE_PERCENT || 0)
      }));
    } catch (error) {
      logger.error('Error in get_account_shifts_analysis:', error);
      return [];
    }
  }

  async get_budget_execution_trends(params: {
    organization?: string;
    category?: string;
    fiscal_year?: number | undefined;
    min_budget?: number | undefined;
    limit?: number;
    offset?: number;
  } = {}): Promise<{
    data: BudgetExecutionTrend[];
    total: number;
    summary: any;
  }> {
    try {
      const {
        organization,
        category,
        fiscal_year = 2025,
        min_budget,
        limit = 100,
        offset = 0
      } = params;

      // Build filters
      const whereConditions = [`FISCAL_YEAR = ${fiscal_year}`];

      // Organization filter
      if (organization && organization !== "All Agencies") {
        const orgMapping: { [key: string]: string } = {
          "Navy": "N",
          "Air Force": "F",
          "Army": "A",
          "N": "N",
          "F": "F",
          "A": "A",
          "DoD": "DoD"
        };
        const actualOrg = orgMapping[organization] || organization;
        whereConditions.push(`COALESCE(ORGANIZATION, 'DoD') = '${actualOrg}'`);
      }

      // Category filter
      if (category && category !== "All Categories") {
        const categoryPatterns: { [key: string]: string } = {
          "R&D": "R1_%",
          "Procurement": "P1_%",
          "Operations": "O1_%",
          "Military Construction": "M1_%"
        };
        const pattern = categoryPatterns[category] || category;
        whereConditions.push(`APPROPRIATION_TYPE LIKE '${pattern}'`);
      }

      const whereClause = whereConditions.join(' AND ');

      const query = `
        WITH phase_data AS (
            SELECT 
                ELEMENT_CODE, ELEMENT_TITLE, APPROPRIATION_TYPE, COALESCE(ORGANIZATION, 'DoD') as ORGANIZATION, PHASE,
                SUM(AMOUNT_K) * 1000 as AMOUNT_DOLLARS
            FROM ${this.unifiedTable}
            WHERE ${whereClause}
              AND ELEMENT_CODE IS NOT NULL AND ELEMENT_CODE != '0'
              AND PHASE IN ('Enacted', 'Total', 'Supplemental', 'Supp')
            GROUP BY ELEMENT_CODE, ELEMENT_TITLE, APPROPRIATION_TYPE, ORGANIZATION, PHASE
        ),
        program_authorization AS (
            SELECT
                pd.ELEMENT_CODE, pd.ELEMENT_TITLE, pd.APPROPRIATION_TYPE, pd.ORGANIZATION,
                SUM(CASE WHEN pd.PHASE = 'Enacted' THEN pd.AMOUNT_DOLLARS ELSE 0 END) as ENACTED_AMOUNT,
                SUM(CASE WHEN pd.PHASE = 'Total' THEN pd.AMOUNT_DOLLARS ELSE 0 END) as TOTAL_AMOUNT,
                SUM(CASE WHEN pd.PHASE IN ('Supplemental', 'Supp') THEN pd.AMOUNT_DOLLARS ELSE 0 END) as SUPPLEMENTAL_AMOUNT,
                COUNT(DISTINCT pd.PHASE) as PHASE_COUNT
            FROM phase_data pd
            GROUP BY pd.ELEMENT_CODE, pd.ELEMENT_TITLE, pd.APPROPRIATION_TYPE, pd.ORGANIZATION
        ),
        authorization_analysis AS (
            SELECT *,
                -- Use Enacted as primary budget if available, else Total
                CASE WHEN ENACTED_AMOUNT > 0 THEN ENACTED_AMOUNT ELSE TOTAL_AMOUNT END as BUDGET_AMOUNT,
                -- Calculate authorization variance (Enacted vs Total)
                CASE WHEN TOTAL_AMOUNT > 0 AND ENACTED_AMOUNT > 0 THEN ((ENACTED_AMOUNT - TOTAL_AMOUNT) / TOTAL_AMOUNT) * 100 ELSE NULL END as AUTHORIZATION_VARIANCE_PCT,
                -- Calculate total authorized (including supplemental)
                (COALESCE(ENACTED_AMOUNT, TOTAL_AMOUNT) + SUPPLEMENTAL_AMOUNT) as TOTAL_AUTHORIZED,
                ROW_NUMBER() OVER (ORDER BY CASE WHEN ENACTED_AMOUNT > 0 THEN ENACTED_AMOUNT ELSE TOTAL_AMOUNT END DESC ) as ROW_NUM
            FROM program_authorization
            WHERE (ENACTED_AMOUNT > 0 OR TOTAL_AMOUNT > 0)
        ),
        final_analysis AS (
            SELECT aa.*,
                -- Calculate authorization rate (how much of Total was Enacted)
                CASE WHEN TOTAL_AMOUNT > 0 AND ENACTED_AMOUNT > 0 THEN (ENACTED_AMOUNT / TOTAL_AMOUNT) * 100 ELSE 100
                END as AUTHORIZATION_RATE_PCT,
                -- Calculate program category for trend grouping
                CASE
                    WHEN aa.APPROPRIATION_TYPE LIKE 'R1_%' THEN 'R&D'
                    WHEN aa.APPROPRIATION_TYPE LIKE 'P1_%' THEN 'Procurement'
                    WHEN aa.APPROPRIATION_TYPE LIKE 'O1_%' THEN 'Operations'
                    WHEN aa.APPROPRIATION_TYPE LIKE 'M1_%' THEN 'Military Construction'
                    ELSE 'Other'
                END as CATEGORY
            FROM authorization_analysis aa
        )
        SELECT
            ELEMENT_CODE as identifier,
            ELEMENT_TITLE as program_name,
            CATEGORY as category,
            ORGANIZATION as organization,
            BUDGET_AMOUNT as budget_amount,
            0 as spent_amount,
            BUDGET_AMOUNT as remaining_amount,
            AUTHORIZATION_RATE_PCT as execution_rate,
            AUTHORIZATION_VARIANCE_PCT as variance_rate,
            0 as requested_amount,
            ENACTED_AMOUNT as enacted_amount,
            0 as actual_amount,
            0 as reconciliation_amount,
            TOTAL_AMOUNT as total_program_amount,
            SUPPLEMENTAL_AMOUNT as supplemental_amount,
            TOTAL_AUTHORIZED as total_authorized_amount,
            PHASE_COUNT as phases_available,
            TRUE as contract_linkable
        FROM final_analysis
        WHERE ROW_NUM > ${offset} AND ROW_NUM <= ${offset + limit}
        ORDER BY BUDGET_AMOUNT DESC
      `;

      // Summary query for totals
      const summaryQuery = `
        WITH phase_data AS (
            SELECT PHASE, SUM(AMOUNT_K) * 1000 as AMOUNT_DOLLARS
            FROM ${this.unifiedTable}
            WHERE ${whereClause}
              AND ELEMENT_CODE IS NOT NULL AND ELEMENT_CODE != '0'
              AND PHASE IN ('Enacted', 'Total', 'Supplemental', 'Supp')
            GROUP BY PHASE
        )
        SELECT
            0 as total_requested,
            SUM(CASE WHEN PHASE = 'Enacted' THEN AMOUNT_DOLLARS ELSE 0 END) as total_enacted,
            SUM(CASE WHEN PHASE = 'Total' THEN AMOUNT_DOLLARS ELSE 0 END) as total_budget,
            0 as total_actual,
            0 as total_reconciliation,
            SUM(CASE WHEN PHASE IN ('Supplemental', 'Supp') THEN AMOUNT_DOLLARS ELSE 0 END) as total_supplemental
        FROM phase_data
      `;

      // Get program data
      const resultRows = await this.executeQuery(query);
      const summaryRows = await this.executeQuery(summaryQuery);

      if (resultRows.length === 0) {
        return { data: [], total: 0, summary: {} };
      }

      // Get total count
      const countQuery = `
        SELECT COUNT(DISTINCT ELEMENT_CODE) as total_programs
        FROM ${this.unifiedTable}
        WHERE ${whereClause}
          AND ELEMENT_CODE IS NOT NULL AND ELEMENT_CODE != '0'
          AND PHASE IN ('Requested', 'Enacted', 'Total', 'Actual', 'Reconciliation')
      `;
      const countRows = await this.executeQuery(countQuery);
      const totalCount = parseInt(countRows[0]?.TOTAL_PROGRAMS || 0);

      // Process results
      const data = resultRows.map((row, i) => {
        const trend: BudgetExecutionTrend = {
          identifier: row.IDENTIFIER,
          program_name: row.PROGRAM_NAME,
          category: row.CATEGORY,
          organization: row.ORGANIZATION,
          budget_amount: parseFloat(row.BUDGET_AMOUNT || 0),
          spent_amount: 0,
          remaining_amount: parseFloat(row.BUDGET_AMOUNT || 0),
          execution_rate: parseFloat(row.EXECUTION_RATE || 0),
          requested_amount: 0,
          enacted_amount: parseFloat(row.ENACTED_AMOUNT || 0),
          actual_amount: 0,
          reconciliation_amount: 0,
          total_program_amount: parseFloat(row.TOTAL_PROGRAM_AMOUNT || 0),
          supplemental_amount: parseFloat(row.SUPPLEMENTAL_AMOUNT || 0),
          total_authorized_amount: parseFloat(row.TOTAL_AUTHORIZED_AMOUNT || 0),
          phases_available: parseInt(row.PHASES_AVAILABLE || 0),
          contract_linkable: true
        };

        if (row.VARIANCE_RATE) {
          trend.variance_rate = parseFloat(row.VARIANCE_RATE);
        }

        return trend;
      });

      // Prepare summary
      let summary = {};
      if (summaryRows.length > 0) {
        const summaryRow = summaryRows[0];
        const totalEnacted = parseFloat(summaryRow.TOTAL_ENACTED || 0);
        const totalBudget = parseFloat(summaryRow.TOTAL_BUDGET || 0);
        const totalSupplemental = parseFloat(summaryRow.TOTAL_SUPPLEMENTAL || 0);
        
        const primaryAuthorization = Math.max(totalEnacted, totalBudget);
        const totalAuthorized = primaryAuthorization + totalSupplemental;
        const authorizationRate = totalBudget > 0 && totalEnacted > 0 ? (totalEnacted / totalBudget) * 100 : 100;
        
        summary = {
          total_requested: 0,
          total_enacted: totalEnacted,
          total_budget: primaryAuthorization,
          total_spent: 0,
          total_remaining: primaryAuthorization,
          total_supplemental: totalSupplemental,
          total_authorized: totalAuthorized,
          overall_execution_rate: authorizationRate,
          data_note: "Authorization data only - no spending/execution data available",
          total_programs: totalCount
        };
      }

      return {
        data,
        total: totalCount,
        summary
      };
    } catch (error) {
      logger.error('Error getting budget execution trends:', error);
      return { data: [], total: 0, summary: {} };
    }
  }

  async get_budget_programs(params: {
    organization?: string;
    category?: string;
    weapons_category?: string;
    fiscal_year?: number | undefined;
    min_budget?: number | undefined;
    search_query?: string;
    sort_by?: string;
    sort_order?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{
    data: BudgetProgram[];
    total: number;
  }> {
    try {
      const {
        organization,
        category,
        weapons_category,
        fiscal_year,
        min_budget,
        search_query,
        sort_by = "primary_budget_amount",
        sort_order = "desc",
        limit = 100,
        offset = 0
      } = params;

      // Convert fiscal_year to number if it's a string
      const fiscalYearNum = fiscal_year ? Number(fiscal_year) : undefined;

      // Build WHERE conditions for fiscal year and phase filtering
      const whereConditions: string[] = [];
      
      // Fiscal year filtering
      if (fiscalYearNum) {
        whereConditions.push(`FISCAL_YEAR = ${fiscalYearNum}`);
      } else {
        whereConditions.push(`FISCAL_YEAR IN (2024, 2025, 2026)`);
      }
      
      // Phase filtering based on fiscal year
      if (fiscalYearNum === 2024) {
        whereConditions.push(`PHASE IN ('Total', 'Actual')`);
      } else if (fiscalYearNum === 2025) {
        whereConditions.push(`PHASE IN ('Total', 'Enacted')`);
      } else if (fiscalYearNum === 2026) {
        whereConditions.push(`PHASE = 'Total'`);
      } else {
        // Default: include all phases for all years
        whereConditions.push(`PHASE IN ('Total', 'Enacted', 'Actual')`);
      }

      // Organization filter
      if (organization && organization !== "All Agencies") {
        const orgMapping: { [key: string]: string } = {
          "Navy": "N",
          "Air Force": "F",
          "Army": "A",
          "N": "N",
          "F": "F",
          "A": "A",
          "DoD": "DoD"
        };
        const actualOrg = orgMapping[organization] || organization;
        whereConditions.push(`COALESCE(ORGANIZATION, 'DoD') = '${actualOrg}'`);
      }

      // Category filter
      if (category && category !== "All Categories") {
        const categoryPatterns: { [key: string]: string } = {
          "R&D": "R1_%",
          "Procurement": "P1_%",
          "Operations": "O1_%",
          "Military Construction": "M1_%"
        };
        const pattern = categoryPatterns[category] || category;
        whereConditions.push(`APPROPRIATION_TYPE LIKE '${pattern}'`);
      }

      // Budget filter
      if (min_budget && min_budget > 0) {
        const minBudgetK = min_budget * 1000;
        whereConditions.push(`AMOUNT_K >= ${minBudgetK}`);
      }

      // Search query filter
      if (search_query && search_query.trim()) {
        const searchTerm = search_query.trim();
        whereConditions.push(`(
            ELEMENT_TITLE ILIKE '%${searchTerm}%'
            OR ELEMENT_CODE ILIKE '%${searchTerm}%'
            OR ORGANIZATION ILIKE '%${searchTerm}%'
        )`);
      }

      const whereClause = whereConditions.join(' AND ');

      // Map sort fields
      const sortFieldMapping: { [key: string]: string } = {
        "primary_budget_amount": "AMOUNT_K",
        "program_name": "ELEMENT_TITLE",
        "organization": "ORGANIZATION",
        "fiscal_year": "FISCAL_YEAR",
        "category": "APPROPRIATION_TYPE"
      };
      const sortField = sortFieldMapping[sort_by] || "AMOUNT_K";

      // Build query based on fiscal year with proper phase prioritization
      let query: string;
      
      if (fiscalYearNum === 2025) {
        // FY2025: Prioritize Enacted over Total
        query = `
          WITH phase_prioritized AS (
              SELECT *,
                  ROW_NUMBER() OVER (
                      PARTITION BY ELEMENT_CODE, FISCAL_YEAR, APPROPRIATION_TYPE
                      ORDER BY CASE WHEN PHASE = 'Enacted' THEN 1 WHEN PHASE = 'Total' THEN 2 ELSE 3 END
                  ) as phase_rank
              FROM ${this.unifiedTable}
              WHERE ${whereClause}
          ),
          program_data AS (
              SELECT
                  ROW_NUMBER() OVER (ORDER BY ${sortField} ${sort_order.toUpperCase()}) as row_num,
                  ELEMENT_CODE as identifier,
                  ELEMENT_TITLE as program_name,
                  APPROPRIATION_TYPE,
                  ACCOUNT_CODE,
                  AMOUNT_K as primary_budget_amount,
                  FISCAL_YEAR,
                  PHASE,
                  CASE
                      WHEN APPROPRIATION_TYPE LIKE 'R1_%' THEN 'R&D'
                      WHEN APPROPRIATION_TYPE LIKE 'P1_%' THEN 'Procurement'
                      WHEN APPROPRIATION_TYPE LIKE 'O1_%' THEN 'Operations'
                      WHEN APPROPRIATION_TYPE LIKE 'M1_%' THEN 'Military Construction'
                      ELSE 'Other'
                  END as category,
                  CASE
                      WHEN APPROPRIATION_TYPE LIKE 'R1_%' THEN 'R1'
                      WHEN APPROPRIATION_TYPE LIKE 'P1_%' THEN 'P1'
                      WHEN APPROPRIATION_TYPE LIKE 'O1_%' THEN 'O1'
                      WHEN APPROPRIATION_TYPE LIKE 'M1_%' THEN 'M1'
                      ELSE 'OTHER'
                  END as identifier_type,
                  COALESCE(ORGANIZATION, 'DoD') as organization,
                  TRUE as contract_linkable
              FROM phase_prioritized
              WHERE phase_rank = 1
          ),
          total_count AS (
              SELECT COUNT(DISTINCT identifier) as total FROM program_data
          )
          SELECT pd.*, tc.total, CONCAT('program_', pd.row_num) as id
          FROM program_data pd
          CROSS JOIN total_count tc
          WHERE pd.row_num > ${offset} AND pd.row_num <= ${offset + limit}
          ORDER BY pd.row_num
        `;
      } else if (fiscalYearNum === 2024) {
        // FY2024: Prioritize Actual over Total
        query = `
          WITH phase_prioritized AS (
              SELECT *,
                  ROW_NUMBER() OVER (
                      PARTITION BY ELEMENT_CODE, FISCAL_YEAR, APPROPRIATION_TYPE
                      ORDER BY CASE WHEN PHASE = 'Actual' THEN 1 WHEN PHASE = 'Total' THEN 2 ELSE 3 END
                  ) as phase_rank
              FROM ${this.unifiedTable}
              WHERE ${whereClause}
          ),
          program_data AS (
              SELECT
                  ROW_NUMBER() OVER (ORDER BY ${sortField} ${sort_order.toUpperCase()}) as row_num,
                  ELEMENT_CODE as identifier,
                  ELEMENT_TITLE as program_name,
                  APPROPRIATION_TYPE,
                  ACCOUNT_CODE,
                  AMOUNT_K as primary_budget_amount,
                  FISCAL_YEAR,
                  PHASE,
                  CASE
                      WHEN APPROPRIATION_TYPE LIKE 'R1_%' THEN 'R&D'
                      WHEN APPROPRIATION_TYPE LIKE 'P1_%' THEN 'Procurement'
                      WHEN APPROPRIATION_TYPE LIKE 'O1_%' THEN 'Operations'
                      WHEN APPROPRIATION_TYPE LIKE 'M1_%' THEN 'Military Construction'
                      ELSE 'Other'
                  END as category,
                  CASE
                      WHEN APPROPRIATION_TYPE LIKE 'R1_%' THEN 'R1'
                      WHEN APPROPRIATION_TYPE LIKE 'P1_%' THEN 'P1'
                      WHEN APPROPRIATION_TYPE LIKE 'O1_%' THEN 'O1'
                      WHEN APPROPRIATION_TYPE LIKE 'M1_%' THEN 'M1'
                      ELSE 'OTHER'
                  END as identifier_type,
                  COALESCE(ORGANIZATION, 'DoD') as organization,
                  TRUE as contract_linkable
              FROM phase_prioritized
              WHERE phase_rank = 1
          ),
          total_count AS (
              SELECT COUNT(DISTINCT identifier) as total FROM program_data
          )
          SELECT pd.*, tc.total, CONCAT('program_', pd.row_num) as id
          FROM program_data pd
          CROSS JOIN total_count tc
          WHERE pd.row_num > ${offset} AND pd.row_num <= ${offset + limit}
          ORDER BY pd.row_num
        `;
      } else if (fiscalYearNum === 2026) {
        // FY2026: Use Total phase only
        query = `
          WITH phase_prioritized AS (
              SELECT *,
                  ROW_NUMBER() OVER (
                      PARTITION BY ELEMENT_CODE, FISCAL_YEAR, APPROPRIATION_TYPE
                      ORDER BY CASE WHEN PHASE = 'Total' THEN 1 ELSE 2 END
                  ) as phase_rank
              FROM ${this.unifiedTable}
              WHERE ${whereClause}
          ),
          program_data AS (
              SELECT
                  ROW_NUMBER() OVER (ORDER BY ${sortField} ${sort_order.toUpperCase()}) as row_num,
                  ELEMENT_CODE as identifier,
                  ELEMENT_TITLE as program_name,
                  APPROPRIATION_TYPE,
                  ACCOUNT_CODE,
                  AMOUNT_K as primary_budget_amount,
                  FISCAL_YEAR,
                  PHASE,
                  CASE
                      WHEN APPROPRIATION_TYPE LIKE 'R1_%' THEN 'R&D'
                      WHEN APPROPRIATION_TYPE LIKE 'P1_%' THEN 'Procurement'
                      WHEN APPROPRIATION_TYPE LIKE 'O1_%' THEN 'Operations'
                      WHEN APPROPRIATION_TYPE LIKE 'M1_%' THEN 'Military Construction'
                      ELSE 'Other'
                  END as category,
                  CASE
                      WHEN APPROPRIATION_TYPE LIKE 'R1_%' THEN 'R1'
                      WHEN APPROPRIATION_TYPE LIKE 'P1_%' THEN 'P1'
                      WHEN APPROPRIATION_TYPE LIKE 'O1_%' THEN 'O1'
                      WHEN APPROPRIATION_TYPE LIKE 'M1_%' THEN 'M1'
                      ELSE 'OTHER'
                  END as identifier_type,
                  COALESCE(ORGANIZATION, 'DoD') as organization,
                  TRUE as contract_linkable
              FROM phase_prioritized
              WHERE phase_rank = 1
          ),
          total_count AS (
              SELECT COUNT(DISTINCT identifier) as total FROM program_data
          )
          SELECT pd.*, tc.total, CONCAT('program_', pd.row_num) as id
          FROM program_data pd
          CROSS JOIN total_count tc
          WHERE pd.row_num > ${offset} AND pd.row_num <= ${offset + limit}
          ORDER BY pd.row_num
        `;
      } else {
        // Default: Use phase prioritization for all fiscal years
        query = `
          WITH phase_prioritized AS (
              SELECT *,
                  ROW_NUMBER() OVER (
                      PARTITION BY ELEMENT_CODE, FISCAL_YEAR, APPROPRIATION_TYPE
                      ORDER BY CASE 
                          WHEN FISCAL_YEAR = 2024 AND PHASE = 'Actual' THEN 1
                          WHEN FISCAL_YEAR = 2024 AND PHASE = 'Total' THEN 2
                          WHEN FISCAL_YEAR = 2025 AND PHASE = 'Enacted' THEN 1
                          WHEN FISCAL_YEAR = 2025 AND PHASE = 'Total' THEN 2
                          WHEN FISCAL_YEAR = 2026 AND PHASE = 'Total' THEN 1
                          ELSE 2
                      END
                  ) as phase_rank
              FROM ${this.unifiedTable}
              WHERE ${whereClause}
          ),
          program_data AS (
              SELECT
                  ROW_NUMBER() OVER (ORDER BY ${sortField} ${sort_order.toUpperCase()}) as row_num,
                  ELEMENT_CODE as identifier,
                  ELEMENT_TITLE as program_name,
                  APPROPRIATION_TYPE,
                  ACCOUNT_CODE,
                  AMOUNT_K as primary_budget_amount,
                  FISCAL_YEAR,
                  PHASE,
                  CASE
                      WHEN APPROPRIATION_TYPE LIKE 'R1_%' THEN 'R&D'
                      WHEN APPROPRIATION_TYPE LIKE 'P1_%' THEN 'Procurement'
                      WHEN APPROPRIATION_TYPE LIKE 'O1_%' THEN 'Operations'
                      WHEN APPROPRIATION_TYPE LIKE 'M1_%' THEN 'Military Construction'
                      ELSE 'Other'
                  END as category,
                  CASE
                      WHEN APPROPRIATION_TYPE LIKE 'R1_%' THEN 'R1'
                      WHEN APPROPRIATION_TYPE LIKE 'P1_%' THEN 'P1'
                      WHEN APPROPRIATION_TYPE LIKE 'O1_%' THEN 'O1'
                      WHEN APPROPRIATION_TYPE LIKE 'M1_%' THEN 'M1'
                      ELSE 'OTHER'
                  END as identifier_type,
                  COALESCE(ORGANIZATION, 'DoD') as organization,
                  TRUE as contract_linkable
              FROM phase_prioritized
              WHERE phase_rank = 1
          ),
          total_count AS (
              SELECT COUNT(DISTINCT identifier) as total FROM program_data
          )
          SELECT pd.*, tc.total, CONCAT('program_', pd.row_num) as id
          FROM program_data pd
          CROSS JOIN total_count tc
          WHERE pd.row_num > ${offset} AND pd.row_num <= ${offset + limit}
          ORDER BY pd.row_num
        `;
      }

      const resultRows = await this.executeQuery(query);
      if (resultRows.length === 0) {
        return { data: [], total: 0 };
      }

      const total = parseInt(resultRows[0]?.TOTAL || 0);

      // Convert data types and add missing fields
      const data = resultRows.map(row => {
        const primaryBudgetK = parseFloat(row.PRIMARY_BUDGET_AMOUNT || 0);
        const primaryBudgetActual = primaryBudgetK * 1000;
        const fy = parseInt(row.FISCAL_YEAR || 2025);

        return {
          identifier: row.IDENTIFIER,
          program_name: row.PROGRAM_NAME,
          appropriation_type: row.APPROPRIATION_TYPE,
          account_code: row.ACCOUNT_CODE,
          primary_budget_amount: primaryBudgetActual,
          fiscal_year: fy,
          phase: row.PHASE,
          category: row.CATEGORY,
          identifier_type: row.IDENTIFIER_TYPE,
          organization: row.ORGANIZATION,
          contract_linkable: true,
          fy_2024_budget: 0,
          fy_2025_budget: fy === 2025 ? primaryBudgetActual : 0,
          fy_2026_budget: fy === 2026 ? primaryBudgetActual : 0
        };
      });

      return { data, total };
    } catch (error) {
      logger.error('Error getting budget programs:', error);
      return { data: [], total: 0 };
    }
  }

  async get_programs_by_category(fiscal_year?: number): Promise<CategoryBudget[]> {
    try {
      // Determine fiscal year filter
      const yearFilter = fiscal_year ? `FISCAL_YEAR = ${fiscal_year}` : "FISCAL_YEAR IN (2025, 2026)";

      const query = `
        WITH phase_prioritized AS (
            SELECT
                APPROPRIATION_TYPE, ELEMENT_CODE, AMOUNT_K, PHASE,
                CASE
                    WHEN APPROPRIATION_TYPE LIKE '%P1_%' AND PHASE = 'Enacted' THEN 1
                    WHEN PHASE = 'Total' THEN 2
                    WHEN PHASE = 'Enacted' THEN 3
                    WHEN PHASE = 'Disc' THEN 4
                    ELSE 5
                END as phase_priority
            FROM ${this.unifiedTable}
            WHERE ${yearFilter}
              AND PHASE IN ('Total', 'Enacted', 'Disc')
        ),
        best_data AS (
            SELECT APPROPRIATION_TYPE, ELEMENT_CODE, AMOUNT_K
            FROM phase_prioritized p1
            WHERE phase_priority = (
                SELECT MIN(phase_priority)
                FROM phase_prioritized p2
                WHERE p1.APPROPRIATION_TYPE = p2.APPROPRIATION_TYPE
                  AND p1.ELEMENT_CODE = p2.ELEMENT_CODE
            )
        )
        SELECT
            CASE
                WHEN APPROPRIATION_TYPE LIKE '%R1_%' OR APPROPRIATION_TYPE = 'R1_RDT&E' THEN 'R&D'
                WHEN APPROPRIATION_TYPE LIKE '%P1_%' OR APPROPRIATION_TYPE = 'P1_Procurement' THEN 'Procurement'
                WHEN APPROPRIATION_TYPE LIKE '%O1_%' OR UPPER(APPROPRIATION_TYPE) LIKE '%OPERATION%' THEN 'Operations'
                WHEN APPROPRIATION_TYPE LIKE '%M1_%' OR UPPER(APPROPRIATION_TYPE) LIKE '%MILITARY%' OR UPPER(APPROPRIATION_TYPE) LIKE '%CONSTRUCTION%' THEN 'Military Construction'
                ELSE 'Other'
            END as category,
            COUNT(DISTINCT ELEMENT_CODE) as total_programs,
            SUM(AMOUNT_K) * 1000 as total_budget,
            COUNT(DISTINCT APPROPRIATION_TYPE) as organizations_count,
            ROUND((SUM(AMOUNT_K) * 100.0 / (
                SELECT SUM(sub.AMOUNT_K) FROM best_data sub
            )), 2) as percentage_of_total
        FROM best_data
        GROUP BY
            CASE
                WHEN APPROPRIATION_TYPE LIKE '%R1_%' OR APPROPRIATION_TYPE = 'R1_RDT&E' THEN 'R&D'
                WHEN APPROPRIATION_TYPE LIKE '%P1_%' OR APPROPRIATION_TYPE = 'P1_Procurement' THEN 'Procurement'
                WHEN APPROPRIATION_TYPE LIKE '%O1_%' OR UPPER(APPROPRIATION_TYPE) LIKE '%OPERATION%' THEN 'Operations'
                WHEN APPROPRIATION_TYPE LIKE '%M1_%' OR UPPER(APPROPRIATION_TYPE) LIKE '%MILITARY%' OR UPPER(APPROPRIATION_TYPE) LIKE '%CONSTRUCTION%' THEN 'Military Construction'
                ELSE 'Other'
            END
        HAVING SUM(AMOUNT_K) > 0
        ORDER BY total_budget DESC
      `;

      const result = await this.executeQuery(query);
      return result.map(row => ({
        category: row.CATEGORY,
        total_programs: parseInt(row.TOTAL_PROGRAMS || 0),
        total_budget: parseFloat(row.TOTAL_BUDGET || 0),
        organizations_count: parseInt(row.ORGANIZATIONS_COUNT || 0),
        percentage_of_total: parseFloat(row.PERCENTAGE_OF_TOTAL || 0)
      }));
    } catch (error) {
      logger.error('Error getting programs by category:', error);
      return [];
    }
  }

  async get_weapons_intelligence(params: {
    category?: string;
    min_budget?: number | undefined;
    limit?: number;
  } = {}): Promise<WeaponsIntelligence> {
    try {
      const { category, min_budget, limit = 50 } = params;

      const whereConditions = ["PHASE = 'Total'", "WEAPONS_CATEGORY IS NOT NULL"];
      if (category) {
        whereConditions.push(`WEAPONS_CATEGORY ILIKE '%${category}%'`);
      }
      if (min_budget) {
        whereConditions.push(`AMOUNT_K >= ${min_budget}`);
      }
      const whereClause = whereConditions.join(' AND ');

      const query = `
        SELECT
            WEAPONS_CATEGORY,
            ORGANIZATION,
            COUNT(DISTINCT ELEMENT_CODE) as system_count,
            SUM(AMOUNT_K) * 1000 as total_budget,
            AVG(AMOUNT_K) * 1000 as avg_budget
        FROM ${this.unifiedTable}
        WHERE ${whereClause}
        GROUP BY WEAPONS_CATEGORY, ORGANIZATION
        ORDER BY total_budget DESC
        LIMIT ${limit}
      `;

      const result = await this.executeQuery(query);
      
      return {
        summary: { total_categories: result.length },
        high_value_systems: result.map(row => ({
          weapons_category: row.WEAPONS_CATEGORY,
          organization: row.ORGANIZATION,
          system_count: parseInt(row.SYSTEM_COUNT || 0),
          total_budget: parseFloat(row.TOTAL_BUDGET || 0),
          avg_budget: parseFloat(row.AVG_BUDGET || 0)
        })),
        categories: Array.from(new Set(result.map(row => row.WEAPONS_CATEGORY))),
        organizations: Array.from(new Set(result.map(row => row.ORGANIZATION)))
      };
    } catch (error) {
      logger.error('Error in get_weapons_intelligence:', error);
      return {
        summary: { total_categories: 0 },
        high_value_systems: [],
        categories: [],
        organizations: []
      };
    }
  }

  async close_connection(): Promise<void> {
    // Connection is managed by snowflakeService
    // No explicit close needed as it's handled by the service
  }
}

export const budgetIntelligenceService = new DoDBudgetIntelligence();
