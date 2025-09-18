import express from 'express';

const router = express.Router();

/* GET home page. */
router.get('/', (req, res, next) => {
  res.json({ title: 'SERP API', message: 'Welcome to SERP Scraping API' });
});

export default router;