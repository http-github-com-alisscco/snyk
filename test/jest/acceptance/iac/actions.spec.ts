import { readFileSync, unlinkSync } from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { startMockServer } from './helpers';
jest.setTimeout(50000);
const { Octokit } = require('@octokit/rest');
const zlib = require('zlib');

describe('GitHub action', () => {
  let run: (
    cmd: string,
  ) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
  let teardown: () => void;

  beforeAll(async () => {
    ({ run, teardown } = await startMockServer());
  });

  afterAll(async () => teardown());

  it('contains valid files when running in GitHub action', async () => {
    const sarifOutputFilename = path.join(__dirname, `${uuidv4()}.sarif`);
    await run(
      `snyk iac test ./cloned/test --sarif-file-output=${sarifOutputFilename}`,
    );

    const outputFileContents = readFileSync(sarifOutputFilename, 'utf-8');
    unlinkSync(sarifOutputFilename);
    const sarif = zlib.gzipSync(outputFileContents).toString('base64');
    // unlinkSync(sarifOutputFilename.replace('sarif', 'gz'));

    const octokit = new Octokit({
      auth: process.env.GH_AUTH_TOKEN, // TODO add it to CircleCI
      previews: ['dorian-preview'],
    });

    const octokitOptions = {
      owner: process.env.GH_ORG,
      repo: process.env.GH_REPO,
    };
    const { data: rateLimit } = await octokit.rest.rateLimit.get();
    if (rateLimit.rate.remaining <= 0) {
      throw new Error('Rate limit reached');
    }

    // TODO: uploading the local SARIF file causes problems because of the paths (404)
    await octokit.rest.codeScanning.uploadSarif({
      ...octokitOptions,
      // eslint-disable-next-line @typescript-eslint/camelcase
      commit_sha: process.env.GH_COMMIT_SHA,
      ref: 'refs/heads/main',
      sarif,
    });

    const uniqueAlertPaths: Set<string> = new Set();

    // TODO: get by date
    const alerts = await octokit.rest.codeScanning.getAnalysis({
      owner: process.env.GH_ORG,
      repo: process.env.GH_REPO,
    });

    // there may be many alerts for the same file, so de-duplicate them
    alerts.forEach((alert) => {
      const alertPath = alert.most_recent_instance.location.path;
      uniqueAlertPaths.add(alertPath);
    });

    await Promise.all(
      Array.from(uniqueAlertPaths).map(async (alertPath) => {
        await octokit.rest.repos.getContent({
          owner: process.env.GH_ORG,
          repo: process.env.GH_REPO,
          path: alertPath.replace('github/workspace/', ''),
        });
      }),
    );
  });
});
