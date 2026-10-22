In short:

- **Program FPGA after a reload:** in the browser, Program FPGA offers to implement the design again when its
  programming file is gone (a build is kept for the browser session only), instead of failing with "no bitstream".

In detail:

- **Program FPGA asks whether the file is there (#1084):** the processes' state comes back with the project after a
  reload, the browser's bitstream does not. The file's state (web/js/impact-file.js) is now also the API's bitinfo:
  built but not there is 'gone', and Program FPGA asks to implement first, saying why (in the browser, or the
  project's build folder in the full application); in Portuguese.
