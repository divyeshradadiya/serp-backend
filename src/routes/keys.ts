import express from 'express';
import { requireAuth, requireOrganization } from '../middleware/auth';
import { KeysController } from '../controllers/keysController';

const router = express.Router();
const keysController = new KeysController();

// GET / - Get all API keys for an organization
router.get('/', requireAuth, requireOrganization, async (req: express.Request, res: express.Response) => {
  await keysController.getKeys(req, res);
});

// POST / - Create a new API key
router.post('/', requireAuth, requireOrganization, async (req: express.Request, res: express.Response) => {
  await keysController.createKey(req, res);
});

// PUT /:id - Update an API key
router.put('/:id', requireAuth, requireOrganization, async (req: express.Request, res: express.Response) => {
  await keysController.updateKey(req, res);
});

// DELETE /:id - Delete an API key
router.delete('/:id', requireAuth, requireOrganization, async (req: express.Request, res: express.Response) => {
  await keysController.deleteKey(req, res);
});

// GET /:id/usage - Get detailed usage statistics for a specific API key
router.get('/:id/usage', requireAuth, requireOrganization, async (req: express.Request, res: express.Response) => {
  await keysController.getKeyUsage(req, res);
});

// POST /:id/regenerate - Regenerate an API key
router.post('/:id/regenerate', requireAuth, requireOrganization, async (req: express.Request, res: express.Response) => {
  await keysController.regenerateKey(req, res);
});

export default router;