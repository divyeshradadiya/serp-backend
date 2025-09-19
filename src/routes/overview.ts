import express, { Router } from 'express';
import { requireAuth, requireOrganization } from '../middleware/auth';
import { OverviewController } from '../controllers/overviewController';

const router: Router = express.Router();
const overviewController = new OverviewController();

// GET /stats - Get overview statistics
router.get('/stats', requireAuth, requireOrganization, async (req: express.Request, res: express.Response) => {
  await overviewController.getStats(req, res);
});

// GET /activity - Get recent API activity
router.get('/activity', requireAuth, requireOrganization, async (req: express.Request, res: express.Response) => {
  await overviewController.getActivity(req, res);
});

// GET /usage-chart - Get usage chart data
router.get('/usage-chart', requireAuth, requireOrganization, async (req: express.Request, res: express.Response) => {
  await overviewController.getUsageChart(req, res);
});

// GET /chart - Get chart data with flexible time periods
router.get('/chart', requireAuth, requireOrganization, async (req: express.Request, res: express.Response) => {
  await overviewController.getChart(req, res);
});

export default router;