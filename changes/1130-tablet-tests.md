In detail:

- **UI tests on a tablet (#1130):** the harness's tablet mode (uiTest's `tablet`: landscape 1180 x 820 or portrait
  820 x 1180, touch with a coarse pointer and no hover, an Android tablet's user agent in Chrome, an iPad's in WebKit;
  `page.tap` a finger's tap), and test/ui/tablet.test.js in both orientations: the page fits the screen, a menu and a
  dialog by taps, a file opened, Simulate, the Board Emulator's switch tapped and its LEDs, Implement with the Silinx
  toolchain, iMPACT's Program FPGA on the screen, the Tasks interface's tasks by taps; in the cross-browser set
  (scripts/test-browsers.mjs), passing in Chrome, Firefox and WebKit.
