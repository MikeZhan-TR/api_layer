import { spawn } from 'child_process';
import { createLogger } from '../utils/logger';
import path from 'path';

const logger = createLogger();

export interface CortexSearchRequest {
  query: string;
  columns?: string[];
  limit?: number;
}

export interface CortexSearchResult {
  DESCRIPTION?: string;
  TITLE?: string;
  SOL_NUMBER?: string;
  FPDS_CODE?: string;
  [key: string]: any;
}

export interface CortexSearchResponse {
  results: CortexSearchResult[];
  request_id: string;
}

/**
 * Execute Cortex search using Python wrapper script
 */
export async function searchCortex(request: CortexSearchRequest): Promise<CortexSearchResponse> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(process.cwd(), 'cortex_search_wrapper.py');
    
    // Use python3 for production, python for Windows dev
    const pythonCommand = process.platform === 'win32' ? 'python' : 'python3';
    
    // Execute the Python wrapper script
    const pythonProcess = spawn(pythonCommand, [scriptPath, JSON.stringify(request)]);
    
    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        logger.error('Python script failed:', stderr);
        reject(new Error(`Cortex search failed: ${stderr}`));
        return;
      }

      try {
        const result = JSON.parse(stdout);
        if (result.error) {
          reject(new Error(`Cortex search error: ${result.error}`));
          return;
        }
        resolve(result);
      } catch (parseError) {
        logger.error('Failed to parse Cortex search result:', parseError);
        logger.error('Raw output:', stdout);
        reject(new Error('Failed to parse Cortex search result'));
      }
    });

    pythonProcess.on('error', (error) => {
      logger.error('Failed to start Python process:', error);
      reject(new Error(`Failed to execute Cortex search: ${error.message}`));
    });
  });
}

/**
 * Convert Cortex search results to opportunities format
 */
export function convertCortexResultsToOpportunities(cortexResults: CortexSearchResult[]): any[] {
  return cortexResults.map(result => ({
    // Map Cortex results to opportunities format
    DESCRIPTION: result.DESCRIPTION || '',
    TITLE: result.TITLE || '',
    SOL_NUMBER: result.SOL_NUMBER || '',
    FPDS_CODE: result.FPDS_CODE || '',
    // Add any other fields that might be present
    ...result
  }));
}
