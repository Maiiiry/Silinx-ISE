// A node --test reporter: how long each test file took (its own process, from the runner's summary of the
// file), at the end of the run, the slowest first (#566). The tests of one file run one after another,
// so a file longer than a CI job's limit cancels the job whatever the sharding; TAP names the tests,
// not their files, which made that hard to see. A file over the budget (SILINX_TEST_FILE_MINUTES,
// default 15) is a GitHub warning annotation: split it or make it lighter before it reaches the limit.
//
//   node --test --test-reporter=tap --test-reporter-destination=stdout \
//     --test-reporter=./scripts/test-file-times.mjs --test-reporter-destination=stdout "test/*.test.js"
import path from 'node:path';

export const BUDGET_MINUTES = 15;

/** Adds a reporter event to { file: ms }: a file's summary (the run's own, with no file, is not one). A
 *  test's own event names the file that called test(), a helper module's for the tests it declares. */
export function addTime(times, { type, data }) {
  if (type !== 'test:summary' || !data?.file) return times;
  times[data.file] = (times[data.file] || 0) + (data.duration_ms || 0);
  return times;
}

/** The report's lines: the slowest files first, and a warning for each one over the budget. */
export function report(times, { budget = BUDGET_MINUTES, count = 10, root = process.cwd() } = {}) {
  const rows = Object.entries(times).sort((a, b) => b[1] - a[1]);
  const name = f => path.relative(root, f).split(path.sep).join('/');
  const minutes = ms => (ms / 60000).toFixed(1);
  const out = [`# the slowest test files (minutes, the tests of a file one after another): ${rows.length} files`];
  for (const [f, ms] of rows.slice(0, count)) out.push(`# ${minutes(ms).padStart(6)}  ${name(f)}`);
  for (const [f, ms] of rows) {
    if (ms > budget * 60000) out.push(`::warning file=${name(f)}::${name(f)} takes ${minutes(ms)} minutes, over the ${budget} of a test file (#566): split it or make it lighter`);
  }
  return out;
}

export default async function* fileTimesReporter(source) {
  const times = {};
  for await (const event of source) addTime(times, event);
  const budget = Number(process.env.SILINX_TEST_FILE_MINUTES) || BUDGET_MINUTES;
  yield report(times, { budget }).join('\n') + '\n';
}
