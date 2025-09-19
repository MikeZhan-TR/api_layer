/**
 * Dashboard API Routes
 * Provides dashboard summary and overview data using DoD Budget Intelligence
 * Migrated from foundry-point-prod backend
 */

import { Router, Request, Response } from 'express';
import { createLogger } from '../utils/logger';
import { budgetIntelligenceService } from '../services/budgetIntelligenceService';

const router = Router();
const logger = createLogger();

/**
 * GET /api/v1/dashboard/summary
 * Get comprehensive dashboard summary with real budget data
 */
router.get('/summary', async (req: Request, res: Response) => {
  try {
    // Try to get real budget data
    let budgetSummary = null;

    try {
      // Get real budget programs summary (same as Budget Intelligence page)
      const programsSummary = await budgetIntelligenceService.get_budget_programs_summary();
      
      if (programsSummary && Object.keys(programsSummary).length > 0) {
        // Always show budget totals - utilization is optional
        const realUtilization = programsSummary.real_utilization_rate;
        const realObligated = programsSummary.total_obligated;
        
        budgetSummary = {
          total_programs: programsSummary.total_programs || 0,
          total_budget: Math.round(programsSummary.total_budget || 0),
          total_obligated: realObligated ? Math.round(realObligated) : 0,
          utilization_rate: realUtilization || 0,
        };
        
        // Dashboard summary prepared with real data
        logger.info('Dashboard summary prepared with real budget data');
      } else {
        budgetSummary = null;
        logger.warning('No budget data available for dashboard summary');
      }
    } catch (error) {
      logger.error('Error getting budget data for dashboard:', error);
      budgetSummary = null;
    }

    // Create dashboard summary with only real data
    const data = {
      budget_summary: budgetSummary,
      last_updated: new Date().toISOString(),
    };

    res.json({
      success: true,
      data,
      message: 'Dashboard summary retrieved successfully'
    });

  } catch (error) {
    logger.error('Error getting dashboard summary:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

/**
 * GET /api/v1/dashboard/overview
 * Get detailed dashboard overview with all metrics
 */
router.get('/overview', async (req: Request, res: Response) => {
  try {
    // Try to get real budget data first
    let budgetMetrics = {};

    try {
      // Get real budget programs summary (consistent with Budget Intelligence page)
      const programsSummary = await budgetIntelligenceService.get_budget_programs_summary();

      if (programsSummary && Object.keys(programsSummary).length > 0) {
        // Use real utilization data
        const realObligated = programsSummary.total_obligated || 0;
        
        budgetMetrics = {
          total_programs: programsSummary.total_programs || 0,
          total_budget: Math.round(programsSummary.total_budget || 0),
          total_obligated: Math.round(realObligated), // Real obligated amount
          active_programs: programsSummary.total_programs || 0, // All programs considered active
        };
        
        logger.info('Dashboard overview prepared with real budget metrics');
      } else {
        logger.error('No budget data available for dashboard overview');
        return res.status(500).json({
          success: false,
          error: 'No budget data available',
          message: 'Unable to retrieve budget data for dashboard overview'
        });
      }
    } catch (error) {
      logger.error('Error getting budget data for dashboard overview:', error);
      return res.status(500).json({
        success: false,
        error: 'No budget data available',
        message: 'Unable to retrieve budget data for dashboard overview'
      });
    }

    res.json({
      success: true,
      data: budgetMetrics,
      message: 'Dashboard overview retrieved successfully'
    });

  } catch (error) {
    logger.error('Error getting dashboard overview:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

/**
 * GET /api/v1/dashboard/health
 * Check dashboard service health
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const isConnected = await budgetIntelligenceService.connect();
    
    res.json({
      success: true,
      data: {
        status: isConnected ? 'healthy' : 'unhealthy',
        service: 'Dashboard Service',
        budget_intelligence: isConnected ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString()
      },
      message: isConnected ? 'Dashboard service is healthy' : 'Dashboard service is unhealthy'
    });
  } catch (error) {
    logger.error('Error checking dashboard health:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

export default router;
