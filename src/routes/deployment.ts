import { Router } from 'express';
import type { Request, Response } from 'express';
import { db } from '../prisma/db.js';
import { jenkinsService } from '../services/jenkinsService.js';

const router = Router();

/**
 * GET /deployment/:id
 * Returns current status of a deployment record.
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const deploymentId = Number(req.params.id);
    const deployment = await db.orm.public.Deployment.first({ id: deploymentId });

    if (!deployment) {
      return res.status(404).json({ error: 'Deployment not found' });
    }

    res.json(deployment);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch deployment', details: error.message });
  }
});

/**
 * GET /deployment/:id/logs
 * Server-Sent Events (SSE) route streaming live Jenkins console logs!
 */
router.get('/:id/logs', async (req: Request, res: Response) => {
  const deploymentId = Number(req.params.id);

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  try {
    // 1. Wait for deployment record to have jenkinsBuildNo
    let deployment = await db.orm.public.Deployment.first({ id: deploymentId });
    if (!deployment) {
      res.write(`data: ${JSON.stringify({ error: 'Deployment not found' })}\n\n`);
      return res.end();
    }

    let attempts = 0;
    while (!deployment?.jenkinsBuildNo && attempts < 20) {
      res.write(`data: ${JSON.stringify({ message: 'Waiting for build to leave queue...' })}\n\n`);
      await new Promise((r) => setTimeout(r, 1000));
      deployment = await db.orm.public.Deployment.first({ id: deploymentId });
      attempts++;
    }

    const buildNo = deployment?.jenkinsBuildNo;
    if (!buildNo) {
      res.write(`data: ${JSON.stringify({ error: 'Timed out waiting for build number' })}\n\n`);
      return res.end();
    }

    // 2. Progressively stream logs from Jenkins
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const logChunk = await jenkinsService.getProgressiveLog(buildNo, offset);

      if (logChunk.text && logChunk.text.length > 0) {
        res.write(`data: ${JSON.stringify({ log: logChunk.text })}\n\n`);
      }

      offset = logChunk.nextOffset;
      hasMore = logChunk.hasMore;

      if (hasMore) {
        await new Promise((r) => setTimeout(r, 1500)); // Poll every 1.5s
      }
    }

    // 3. Check final build outcome and update database
    const finalStatus = (await jenkinsService.getBuildStatus(buildNo)) || 'SUCCESS';

    await db.orm.public.Deployment.where({ id: deploymentId }).update({
      status: finalStatus,
    });

    res.write(`data: ${JSON.stringify({ finished: true, status: finalStatus })}\n\n`);
    res.end();
  } catch (error: any) {
    console.error('Error streaming logs:', error);
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});

export default router;