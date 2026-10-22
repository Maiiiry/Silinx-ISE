In detail:

- **The ISE runner's PATH with Docker's CLI (#904):** registering the runner as its own user with `sudo` left
  sudo's `secure_path` in its `.path`, which `runsvc.sh` exports over the daemon's PATH, so the ISE jobs found no
  `docker` (`/usr/local/bin`). `install.sh --system` now writes `.path` with the daemon's PATH, owned by the
  runner's user. Tests: `test/ise-runner.test.js`.
