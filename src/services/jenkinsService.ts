import dotenv from 'dotenv';
dotenv.config();

const JENKINS_URL = process.env.JENKINS_URL || 'http://localhost:8080';
const JENKINS_USER = process.env.JENKINS_USER || '';
const JENKINS_API_TOKEN = process.env.JENKINS_API_TOKEN || '';
const DEFAULT_JOB = process.env.JENKINS_JOB_NAME || 'relay-builder';

export interface TriggerBuildParams {
  repoUrl: string;
  branch: string;
  githubToken?: string;
  dockerfileContent: string;
  imageName: string;
  imageTag: string;
  jobName?: string;
}

export interface ProgressiveLogResult {
  text: string;
  nextOffset: number;
  hasMore: boolean;
}

export class JenkinsService {
  private getAuthHeader(): string {
    const credentials = Buffer.from(`${JENKINS_USER}:${JENKINS_API_TOKEN}`).toString('base64');
    return `Basic ${credentials}`;
  }

  /**
   * Fetches the Jenkins CSRF crumb required for POST requests.
   */
  private async getCrumb(): Promise<{ field: string; value: string } | null> {
    try {
      const res = await fetch(`${JENKINS_URL}/crumbIssuer/api/json`, {
        headers: { Authorization: this.getAuthHeader() },
      });

      if (!res.ok) {
        // If CSRF is disabled on Jenkins, crumbIssuer might return 404
        return null;
      }

      const data = (await res.json()) as { crumbRequestField: string; crumb: string };
      return { field: data.crumbRequestField, value: data.crumb };
    } catch {
      return null;
    }
  }

  /**
   * Triggers a parameterized build in Jenkins.
   * Returns the Queue Item URL (e.g. "http://localhost:8080/queue/item/5/").
   */
  async triggerBuild(params: TriggerBuildParams): Promise<string> {
    const job = params.jobName || DEFAULT_JOB;
    const crumb = await this.getCrumb();

    const headers: Record<string, string> = {
      Authorization: this.getAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    if (crumb) {
      headers[crumb.field] = crumb.value;
    }

    const formBody = new URLSearchParams({
      REPO_URL: params.repoUrl,
      BRANCH: params.branch || 'main',
      GITHUB_TOKEN: params.githubToken || '',
      DOCKERFILE_CONTENT: params.dockerfileContent,
      IMAGE_NAME: params.imageName,
      IMAGE_TAG: params.imageTag,
    });

    const triggerUrl = `${JENKINS_URL}/job/${job}/buildWithParameters`;
    const res = await fetch(triggerUrl, {
      method: 'POST',
      headers,
      body: formBody.toString(),
    });

    if (res.status !== 201) {
      const errorText = await res.text();
      throw new Error(`Failed to trigger Jenkins build (${res.status}): ${errorText}`);
    }

    const queueUrl = res.headers.get('location');
    if (!queueUrl) {
      throw new Error('Jenkins did not return a queue location header.');
    }

    return queueUrl;
  }

  /**
   * Polls the Jenkins queue item until it starts and returns the real build number.
   */
  async getBuildNumberFromQueue(queueUrl: string, maxAttempts = 15, delayMs = 1500): Promise<number> {
    const cleanUrl = queueUrl.endsWith('/') ? queueUrl : `${queueUrl}/`;

    for (let i = 0; i < maxAttempts; i++) {
      const res = await fetch(`${cleanUrl}api/json`, {
        headers: { Authorization: this.getAuthHeader() },
      });

      if (res.ok) {
        const data = (await res.json()) as any;
        if (data.executable && data.executable.number) {
          return data.executable.number as number;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    throw new Error('Timed out waiting for Jenkins job to leave the queue.');
  }

  /**
   * Fetches progressive build console logs from a starting byte offset.
   */
  async getProgressiveLog(buildNumber: number, startOffset = 0, jobName = DEFAULT_JOB): Promise<ProgressiveLogResult> {
    const url = `${JENKINS_URL}/job/${jobName}/${buildNumber}/logText/progressiveText?start=${startOffset}`;
    const res = await fetch(url, {
      headers: { Authorization: this.getAuthHeader() },
    });

    if (!res.ok) {
      return { text: '', nextOffset: startOffset, hasMore: false };
    }

    const text = await res.text();
    const nextOffset = parseInt(res.headers.get('x-text-size') || `${startOffset}`, 10);
    const hasMore = res.headers.get('x-more-data') === 'true';

    return { text, nextOffset, hasMore };
  }

  /**
   * Checks the status and completion of a build.
   * Returns "SUCCESS", "FAILURE", "ABORTED", or null if still running.
   */
  async getBuildStatus(buildNumber: number, jobName = DEFAULT_JOB): Promise<string | null> {
    const url = `${JENKINS_URL}/job/${jobName}/${buildNumber}/api/json`;
    const res = await fetch(url, {
      headers: { Authorization: this.getAuthHeader() },
    });

    if (!res.ok) return null;

    const data = (await res.json()) as any;
    if (data.building) return null; // Still in progress
    return data.result as string;   // "SUCCESS" | "FAILURE"
  }
}

export const jenkinsService = new JenkinsService();