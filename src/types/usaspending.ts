// Core USAspending data types based on the 83 imported tables

export interface Award {
  award_id?: string;
  recipient_name?: string;
  recipient_unique_id?: string;
  recipient_uei?: string;
  agency_name?: string;
  agency_code?: string;
  total_obligation?: number;
  base_and_all_options_value?: number;
  date_signed?: string;
  period_of_performance_start_date?: string;
  period_of_performance_current_end_date?: string;
  award_type?: string;
  award_type_code?: string;
  award_description?: string;
  naics_code?: string;
  naics_description?: string;
  psc_code?: string;
  psc_description?: string;
  place_of_performance_state?: string;
  place_of_performance_city?: string;
  place_of_performance_county?: string;
  place_of_performance_zip?: string;
  recipient_state?: string;
  recipient_city?: string;
  recipient_county?: string;
  recipient_zip?: string;
  fiscal_year?: number;
  created_at?: string;
  updated_at?: string;
}

export interface Transaction {
  transaction_id?: string;
  award_id?: string;
  modification_number?: string;
  transaction_description?: string;
  federal_action_obligation?: number;
  face_value_loan_guarantee?: number;
  original_loan_subsidy_cost?: number;
  action_date?: string;
  action_type?: string;
  action_type_description?: string;
  transaction_unique_id?: string;
  fiscal_year?: number;
  is_fpds?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Recipient {
  recipient_hash?: string;
  recipient_unique_id?: string;
  recipient_name?: string;
  recipient_uei?: string;
  duns?: string;
  recipient_address_line_1?: string;
  recipient_address_line_2?: string;
  recipient_city_name?: string;
  recipient_state_code?: string;
  recipient_zip?: string;
  recipient_country_code?: string;
  recipient_phone_number?: string;
  business_categories?: string[];
  business_types?: string[];
  entity_structure?: string;
  total_award_amount?: number;
  total_transaction_amount?: number;
  award_count?: number;
  transaction_count?: number;
  last_12_months_amount?: number;
  created_at?: string;
  updated_at?: string;
}

export interface Agency {
  agency_id?: string;
  agency_name?: string;
  agency_code?: string;
  agency_abbreviation?: string;
  toptier_agency_id?: string;
  subtier_agency_id?: string;
  cgac_code?: string;
  frec_code?: string;
  is_frec?: boolean;
  agency_type?: string;
  website?: string;
  mission?: string;
  created_at?: string;
  updated_at?: string;
}

export interface SpendingSummary {
  fiscal_year?: number;
  agency_name?: string;
  agency_code?: string;
  state_code?: string;
  state_name?: string;
  county_name?: string;
  congressional_district?: string;
  total_obligations?: number;
  total_outlays?: number;
  award_count?: number;
  recipient_count?: number;
  procurement_amount?: number;
  assistance_amount?: number;
  contract_amount?: number;
  grant_amount?: number;
  loan_amount?: number;
  other_amount?: number;
}

export interface NAICSCode {
  naics_code: string;
  naics_description: string;
  year?: number;
  created_at?: string;
  updated_at?: string;
}

export interface PSCCode {
  psc_code: string;
  psc_description: string;
  created_at?: string;
  updated_at?: string;
}

export interface GeographicData {
  state_code: string;
  state_name: string;
  county_code?: string;
  county_name?: string;
  city_name?: string;
  zip_code?: string;
  congressional_district?: string;
  population?: number;
  area_sqmi?: number;
}

export interface FederalAccount {
  federal_account_code: string;
  account_title: string;
  agency_identifier: string;
  main_account_code: string;
  created_at?: string;
  updated_at?: string;
}

// API Response types
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  pagination?: PaginationInfo;
  metadata?: Record<string, any>;
}

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface SearchFilters {
  fiscal_year?: number | number[];
  agency_code?: string | string[];
  state_code?: string | string[];
  award_type?: string | string[];
  recipient_name?: string;
  naics_code?: string | string[];
  psc_code?: string | string[];
  min_amount?: number;
  max_amount?: number;
  date_from?: string;
  date_to?: string;
  keywords?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface AggregationOptions {
  group_by: string[];
  metrics: string[];
  filters?: SearchFilters;
  time_period?: 'monthly' | 'quarterly' | 'yearly';
}

// Error types
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, any>;
  timestamp: string;
}

// Database query types
export interface QueryOptions {
  select?: string[];
  where?: Record<string, any>;
  orderBy?: string;
  limit?: number;
  offset?: number;
}

export interface QueryResult<T> {
  rows: T[];
  totalCount: number;
  executionTime: number;
}

// Cache types
export interface CacheOptions {
  key: string;
  ttl?: number;
  tags?: string[];
}

// User context from Supabase
export interface UserContext {
  id: string;
  email?: string | undefined;
  role?: string;
  permissions?: string[];
  subscription_tier?: 'free' | 'pro' | 'enterprise';
  rate_limit?: {
    requests_per_hour: number;
    requests_remaining: number;
  } | undefined;
}

