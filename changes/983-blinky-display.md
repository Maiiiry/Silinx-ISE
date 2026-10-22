In short:

- **Blinky counts on the display:** the blinky example shows on the board's 4-digit 7-segment display how
  many steps its LED pattern has made, in decimal from 0000 to 9999 (SW0 resets it, a pause stops it).

In detail:

- **The blinky example's step counter (#983):** a decimal (BCD) counter (`src/bcd_counter.vhd`, 0000 to 9999
  and then 0000 again) counts each step of the LED pattern (each move of the knight rider's light, each count of
  the binary counter; not while paused) and the clock example's display driver (`src/sevenseg.v`) shows it on the
  four digits, multiplexed (active-low segments and anodes, one digit per ms); the UCF has the display's pins, the
  test bench checks the count, the pause, the wrap from 9999 to 0000 and the reset, and fails on a wrong design
  (`test/blinky-example.test.js`); the Board Emulator shows the digits counting on the Basys2 and the Nexys2.
