import express, { Router } from 'express';

const router: Router = express.Router();

/* GET home page. */
router.get('/', (req, res, next) => {
  res.json({ title: 'Serpex', message: 'Welcome to Serpex API' });
});

export default router;