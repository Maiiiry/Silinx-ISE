In detail:

- **The ISE container isolated (#1435):** every `docker run` of ISE (the docker mode, the ssh host's image, the
  open-flow check, the netlist fixtures and the quality comparison) runs with `--network none --cap-drop ALL
  --security-opt no-new-privileges --pids-limit 512`, and with `--memory` when Toolchain Settings' configuration
  file sets `docker.memory` (8g); the image's base, `ubuntu:14.04`, pinned by its digest in the Dockerfile.
