import { readFileSync, unlinkSync, readdirSync, statSync } from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { startMockServer } from './helpers';
jest.setTimeout(50000);

async function* walk(dir: string) {
  const files = readdirSync(dir);
  for (const file of files) {
    const entry = path.join(dir, file);
    if (statSync(entry).isDirectory()) {
      yield* walk(entry);
    } else {
      yield entry;
    }
  }
}

describe('GitHub action', () => {
  let run: (
    cmd: string,
  ) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
  let teardown: () => void;

  beforeAll(async () => {
    ({ run, teardown } = await startMockServer());
  });

  afterAll(async () => teardown());

  it.each([
    ['', './iac', ''],
    ['cd iac;', '.', ''],
    ['cd iac;', '', ''],
    ['cd iac/file-output;', '../../iac', ''],
    ['', './iac', '--legacy'],
    ['cd iac;', '.', '--legacy'],
    ['cd iac;', '', '--legacy'],
    ['cd iac/file-output;', '../../iac', '--legacy'],
  ])(
    'contains valid files when running %p as pre-step and provided with %p as a path and %p as a flag',
    async (preSteps, inputPath, flag) => {
      const sarifOutputFilename = path.join(__dirname, `${uuidv4()}.sarif`);
      const { stderr, exitCode } = await run(
        `${preSteps} snyk iac test ${inputPath} ${flag} --sarif-file-output=${sarifOutputFilename}`,
      );
      expect(stderr).toBe('');
      if (flag === '--legacy') {
        expect(exitCode).toBe(0);
      } else {
        expect(exitCode).toBe(1);
      }

      const actualPaths = new Set();
      for await (const p of walk('./test/fixtures/iac')) {
        actualPaths.add(`file://${process.cwd()}/${p}`);
      }

      const outputFileContents = readFileSync(sarifOutputFilename, 'utf-8');
      unlinkSync(sarifOutputFilename);
      const jsonObj = JSON.parse(outputFileContents);

      const generatedPaths = new Set();
      for (const run of jsonObj.runs) {
        const projectRoot = run.originalUriBaseIds.PROJECTROOT.uri;

        for (const result of run.results) {
          for (const loc of result.locations) {
            generatedPaths.add(
              projectRoot + loc.physicalLocation.artifactLocation.uri,
            );
          }
        }
      }

      for (const p of generatedPaths) {
        expect(actualPaths).toContainEqual(p);
      }
    },
  );
});
