In short:

- **Toolchain Settings:** the ISE settings script must be a file of the ISE installation (outside the projects and
  the build folders, writable only by its owner), and Silinx never pulls a Docker image when it runs one.

In detail:

- **Stricter checks of the toolchain settings set through the API (#1244):** server/toolchain.js checks the ISE
  settings scripts a changed value names (this computer's: an absolute path to an existing file outside the
  workspace, owned by root or the user and writable by no one else, its folders too; in the image or on the ssh
  host: an absolute path outside `/work` and `ssh.remoteDir`) and the images (no leading `-`); server/ise.js runs
  `docker run --pull=never` (here and on the ssh host) and takes an `impl.xstOptions` value as one word.
