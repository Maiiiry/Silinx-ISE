// The workflow files the tests check (#1438): GitHub runs .github/workflows/*.yml and *.yaml both, so the tests
// of the workflows (their permissions, the self-hosted runner's guard, the pinning of the actions) must list both,
// or a *.yaml file would escape every rule.
import fs from 'node:fs';

/** Whether a file of .github/workflows is a workflow GitHub runs: a .yml or .yaml file. */
export const isWorkflowFile = (name) => /\.ya?ml$/.test(name);

/** The workflow files of a folder, sorted. */
export const workflowFiles = (dir) => fs.readdirSync(dir).filter(isWorkflowFile).sort();
