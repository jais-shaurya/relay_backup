import { Router } from 'express';
import type { Request, Response } from 'express';
import { db } from '../prisma/db.js';
import { generateDockerfile } from '../services/dockerfileGenerator.js';
import { jenkinsService } from '../services/jenkinsService.js';
import type { SupportedRuntime } from '../types/build.js';

const router = Router();
const DOCKERHUB_USERNAME = process.env.DOCKERHUB_USERNAME || 'jaisshaurya';

/**
 * POST /project
 * Registers a new repository project in the database.
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      userId,
      name,
      repoUrl,
      branch,
      runtime,
      runtimeVersion,
      installCommand,
      buildCommand,
      startCommand,
      port,
    } = req.body;

    if (!userId || !name || !repoUrl || !runtime || !startCommand) {
      return res.status(400).json({ error: 'Missing required project fields' });
    }

    const project = await db.orm.public.Project.create({
      userId: Number(userId),
      name,
      repoUrl,
      branch: branch || 'main',
      runtime,
      runtimeVersion: runtimeVersion || null,
      installCommand: installCommand || null,
      buildCommand: buildCommand || null,
      startCommand,
      port: port ? Number(port) : 3000,
    });

    res.status(201).json({ message: 'Project created successfully', project });
  } catch (error: any) {
    console.error('Error creating project:', error);
    res.status(500).json({ error: 'Failed to create project', details: error.message });
  }
});

/**
 * POST /project/:id/deploy
 * Generates the Dockerfile, creates a Deployment record, and triggers Jenkins!
 */
router.post('/:id/deploy', async (req: Request, res: Response) => {
  try {
    const projectId = Number(req.params.id);
    const { githubToken } = req.body;

    // 1. Fetch project from database
    const project = await db.orm.public.Project.first({ id: projectId });
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

        // 2. Dynamically generate Dockerfile based on project settings
    const dockerfileContent = generateDockerfile({
      runtime: project.runtime as SupportedRuntime,
      runtimeVersion: project.runtimeVersion,
      installCommand: project.installCommand,
      buildCommand: project.buildCommand,
      startCommand: project.startCommand,
      port: project.port,
    });

    // 3. Format Docker image name and unique build tag
    const cleanProjectName = project.name.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    const imageName = `${DOCKERHUB_USERNAME}/${cleanProjectName}`;
    const imageTag = `build-${Date.now()}`;

    // 4. Record new deployment as "QUEUED" in DB
    const deployment = await db.orm.public.Deployment.create({
      projectId: project.id,
      imageTag: `${imageName}:${imageTag}`,
      status: 'QUEUED',
    });

    // 5. Trigger Jenkins parameterized build
    const queueUrl = await jenkinsService.triggerBuild({
      repoUrl: project.repoUrl,
      branch: project.branch,
      githubToken: githubToken || '',
      dockerfileContent,
      imageName,
      imageTag,
    });

    // 6. Asynchronously resolve queue item to real build number in the background
    (async () => {
      try {
        const buildNumber = await jenkinsService.getBuildNumberFromQueue(queueUrl);
        await db.orm.public.Deployment.where({ id: deployment.id }).update({
          jenkinsBuildNo: buildNumber,
          status: 'BUILDING',
        });
      } catch (err) {
        console.error(`Failed to resolve queue for deployment ${deployment.id}:`, err);
        await db.orm.public.Deployment.where({ id: deployment.id }).update({
          status: 'FAILED',
        });
      }
    })();

    // 7. Immediately return the deployment ID to the frontend
    res.status(202).json({
      message: 'Deployment initiated',
      deploymentId: deployment.id,
      status: 'QUEUED',
      imageTag: `${imageName}:${imageTag}`,
    });
  } catch (error: any) {
    console.error('Error triggering deploy:', error);
    res.status(500).json({ error: 'Failed to trigger deployment', details: error.message });
  }
});

export default router;