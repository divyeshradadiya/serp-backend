import express from 'express';
import { requireAuth, requireOrganization } from '../middleware/auth';
import { SearchController } from '../controllers/searchController';

const router = express.Router();
const searchController = new SearchController();

// POST /search - Perform a search request
router.post('/', requireAuth, requireOrganization, async (req: express.Request, res: express.Response) => {
  await searchController.search(req, res);
});

// GET /engines - Get list of supported search engines
router.get('/engines', requireAuth, requireOrganization, async (req: express.Request, res: express.Response) => {
  await searchController.getEngines(req, res);
});

export default router;