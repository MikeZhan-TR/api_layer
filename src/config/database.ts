import { ConnectionOptions } from 'snowflake-sdk';

export interface DatabaseConfig {
  snowflake: ConnectionOptions;
}

// Lazy initialization to ensure environment variables are loaded
let _databaseConfig: DatabaseConfig | null = null;

function createDatabaseConfig(): DatabaseConfig {
  const account = process.env.SNOWFLAKE_ACCOUNT;
  const username = process.env.SNOWFLAKE_USER || process.env.SNOWFLAKE_USERNAME;
  const password = process.env.SNOWFLAKE_PASSWORD;

  if (!account || !username || !password) {
    throw new Error('Missing required Snowflake environment variables. Make sure SNOWFLAKE_ACCOUNT, SNOWFLAKE_USER (or SNOWFLAKE_USERNAME), and SNOWFLAKE_PASSWORD are set.');
  }

  return {
    snowflake: {
      account,
      username,
      password,
      database: process.env.SNOWFLAKE_DATABASE || 'FOUNDRY',
      schema: process.env.SNOWFLAKE_SCHEMA || 'API_SCHEMA',
      warehouse: process.env.SNOWFLAKE_WAREHOUSE || 'COMPUTE_WH',
      role: process.env.SNOWFLAKE_ROLE || 'DEV_API_ROLE',
      // Connection pool settings
      maxConnections: 10,
      acquireTimeoutMillis: 30000,
      createRetryIntervalMillis: 500,
      // Query settings
      clientSessionKeepAlive: true,
      clientSessionKeepAliveHeartbeatFrequency: 3600, // 1 hour
    }
  };
}

export function getDatabaseConfig(): DatabaseConfig {
  if (!_databaseConfig) {
    _databaseConfig = createDatabaseConfig();
  }
  return _databaseConfig;
}

// For backward compatibility
export const databaseConfig = new Proxy({} as DatabaseConfig, {
  get(target, prop) {
    return getDatabaseConfig()[prop as keyof DatabaseConfig];
  }
});

// Validate required environment variables
export function validateDatabaseConfig(): void {
  const account = process.env.SNOWFLAKE_ACCOUNT;
  const username = process.env.SNOWFLAKE_USER || process.env.SNOWFLAKE_USERNAME;
  const password = process.env.SNOWFLAKE_PASSWORD;

  const missingVars = [];
  if (!account) missingVars.push('SNOWFLAKE_ACCOUNT');
  if (!username) missingVars.push('SNOWFLAKE_USER or SNOWFLAKE_USERNAME');
  if (!password) missingVars.push('SNOWFLAKE_PASSWORD');
  
  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }
}