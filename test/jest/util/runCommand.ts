import { SpawnOptionsWithoutStdio } from 'child_process';
import { spawn } from 'cross-spawn';

type RunCommandResult = {
  code: number;
  stdout: string;
  stderr: string;
};

type RunCommandOptions = SpawnOptionsWithoutStdio;

const runCommand = (
  command: string,
  args: string[],
  options?: RunCommandOptions,
): Promise<RunCommandResult> => {
  return new Promise((resolve, reject) => {
    const cli = spawn(command, args, options);
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    cli.on('error', (error) => {
      reject(error);
    });

    cli.stdout.on('data', (chunk) => {
      stdout.push(Buffer.from(chunk));
    });

    cli.stderr.on('data', (chunk) => {
      stderr.push(Buffer.from(chunk));
    });

    cli.on('close', (code) => {
      resolve({
        code: code || 0,
        stdout: Buffer.concat(stdout)
          .toString('utf-8')
          .trim(),
        stderr: Buffer.concat(stderr)
          .toString('utf-8')
          .trim(),
      });
    });
  });
};

export { runCommand, RunCommandResult, RunCommandOptions };
