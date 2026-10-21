In detail:

- **The ISE runner as a user of its own (#482):** `scripts/ise-runner/install.sh --system <user> <folder>`
  installs the self-hosted runner as a launchd daemon run by a standard user with no keys or tokens, and its
  on-line window as a daemon of root, whose scripts and Node.js are copied where that user cannot change them
  (`window.mjs` `serviceCommands`: the daemon loaded and unloaded with `launchctl`). The runner's jobs keep
  their temporary files in its folder (`TMPDIR`) and reach Docker Desktop through its socket, which
  `install.sh --docker-acl <user>` opens to that user again each time Docker Desktop makes it. Docker Desktop
  shares only `/Users/Shared/silinx-ise`, so that no container can mount the machine's main user's home; ISE
  work over ssh goes there too (`ssh.remoteDir`). A tag ruleset lets only the admin create, move or delete a
  `v*` tag. Tests: `test/ise-runner.test.js` (both install modes in a scratch folder, with `launchctl` and
  `chown` recorded; the service's commands).
