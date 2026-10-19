// The SDF of ISE's Post-Place & Route Simulation Model (netgen's <top>_timesim.sdf, #558) read and built into ISE's
// model (core/sdf.js parseSdf / annotateSdf), as Simulate runs it in an ISE mode. A small netlist and SDF written by
// hand in netgen's format (no ISE output in the repository): the delays as min:typ:max triples (the max taken, the one
// ISE's trce times), the clock network's delays (the input buffer, the BUFGMUX's IOPATH, the slice's clock inverter,
// a PORT delay on the clock pin), the clock to out written without an edge (IOPATH CLK O), the asynchronous reset's
// path (IOPATH RST O), the setup checks of both edges of an input, a negative hold, a PERIOD check.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, elaborate } from '../core/compile.js';
import { primitiveSources } from '../core/unisim.js';
import { scalarizeNetlist } from '../core/netlist-hier.js';
import { Simulator } from '../core/simulator.js';
import { parseSdf, annotateSdf } from '../core/sdf.js';

const NET = `library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
library SIMPRIM;
use SIMPRIM.VCOMPONENTS.ALL;
use SIMPRIM.VPACKAGE.ALL;

entity top is
  port (
    clk : in STD_LOGIC := 'X';
    d : in STD_LOGIC := 'X';
    r : in STD_LOGIC := 'X';
    q : out STD_LOGIC
  );
end top;

architecture STRUCTURE of top is
  signal clk_INBUF : STD_LOGIC;
  signal clk_BUFGP : STD_LOGIC;
  signal q_ff_CLKINV_1 : STD_LOGIC;
  signal d_IBUF_2 : STD_LOGIC;
  signal r_IBUF_3 : STD_LOGIC;
  signal q_ff_SRINV_4 : STD_LOGIC;
  signal q_O : STD_LOGIC;
begin
  clk_BUFGP_IBUFG : X_BUF
    generic map(
      LOC => "IPAD22",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk,
      O => clk_INBUF
    );
  clk_BUFGP_BUFG : X_BUFGMUX
    generic map(
      LOC => "BUFGMUX_X2Y11"
    )
    port map (
      I0 => clk_INBUF,
      I1 => '0',
      S => '0',
      O => clk_BUFGP
    );
  q_ff_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X29Y43",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => q_ff_CLKINV_1
    );
  d_IBUF : X_BUF
    generic map(
      LOC => "IPAD61",
      PATHPULSE => 638 ps
    )
    port map (
      I => d,
      O => d_IBUF_2
    );
  r_IBUF : X_BUF
    generic map(
      LOC => "IPAD62",
      PATHPULSE => 638 ps
    )
    port map (
      I => r,
      O => r_IBUF_3
    );
  q_ff_SRINV : X_BUF
    generic map(
      LOC => "SLICE_X29Y43",
      PATHPULSE => 638 ps
    )
    port map (
      I => r_IBUF_3,
      O => q_ff_SRINV_4
    );
  q_ff : X_SFF
    generic map(
      LOC => "SLICE_X29Y43",
      INIT => '0'
    )
    port map (
      I => d_IBUF_2,
      CE => '1',
      CLK => q_ff_CLKINV_1,
      SET => '0',
      RST => q_ff_SRINV_4,
      SSET => '0',
      SRST => '0',
      O => q_O
    );
  q_OBUF : X_OBUF
    generic map(
      LOC => "PAD110"
    )
    port map (
      I => q_O,
      O => q
    );
end STRUCTURE;
`;
const SDF = `(DELAYFILE
  (SDFVERSION "3.0")
  (DESIGN "top")
  (DATE "Mon Oct 19 07:00:00 2026")
  (VENDOR "Xilinx")
  (PROGRAM "Xilinx SDF Writer")
  (VERSION "P.20131013")
  (DIVIDER /)
  (VOLTAGE 1.14)
  (TEMPERATURE 85)
  (TIMESCALE 1 ps)
  (CELL (CELLTYPE "X_BUF")
    (INSTANCE clk_BUFGP_IBUFG)
      (DELAY
        (ABSOLUTE
          (IOPATH I O (420:526:526))
        )
      )
  )
  (CELL (CELLTYPE "X_BUFGMUX")
    (INSTANCE clk_BUFGP_BUFG)
      (DELAY
        (ABSOLUTE
          (IOPATH I0 O (1165:1457:1457))
          (IOPATH I1 O (1165:1457:1457))
        )
      )
      (TIMINGCHECK
        (SETUPHOLD (posedge S) (negedge I0) (499:624:624)(0))
      )
  )
  (CELL (CELLTYPE "X_BUF")
    (INSTANCE q_ff_CLKINV)
      (DELAY
        (ABSOLUTE
          (IOPATH I O (78:78:92))
        )
      )
  )
  (CELL (CELLTYPE "X_BUF")
    (INSTANCE d_IBUF)
      (DELAY
        (ABSOLUTE
          (IOPATH I O (420:526:526))
        )
      )
  )
  (CELL (CELLTYPE "X_BUF")
    (INSTANCE r_IBUF)
      (DELAY
        (ABSOLUTE
          (IOPATH I O (420:526:526))
        )
      )
  )
  (CELL (CELLTYPE "X_BUF")
    (INSTANCE q_ff_SRINV)
      (DELAY
        (ABSOLUTE
          (IOPATH I O (953:953:1191))
        )
      )
  )
  (CELL (CELLTYPE "X_SFF")
    (INSTANCE q_ff)
      (DELAY
        (ABSOLUTE
          (PORT I (387:387:484))
          (PORT CLK (100:100:125))
          (IOPATH CLK O (468:586:586))
          (IOPATH SET O (468:586:586))
          (IOPATH RST O (468:586:586))
        )
      )
      (TIMINGCHECK
        (SETUPHOLD (posedge I) (posedge CLK) (105:132:132)(38:48:48))
        (SETUPHOLD (negedge I) (posedge CLK) (105:132:132)(38:48:48))
        (PERIOD (posedge CLK) (1276:1596:1596))
        (SETUPHOLD (posedge SRST) (posedge CLK) (727:909:909)(-392:-490:-490))
        (SETUPHOLD (negedge SRST) (posedge CLK) (727:909:909)(-392:-490:-490))
      )
  )
  (CELL (CELLTYPE "X_OBUF")
    (INSTANCE q_OBUF)
      (DELAY
        (ABSOLUTE
          (PORT I (479:599:599))
          (IOPATH I O (1442:1804:1804))
        )
      )
  )
)
`;

test('parseSdf on ISE\'s SDF: the max of each triple, the clock to out without an edge, both edges\' setup checks, a negative hold', () => {
  const s = parseSdf(SDF);
  assert.equal(s.timescale, 1);
  assert.deepEqual([...s.cells.keys()], ['clk_BUFGP_IBUFG', 'clk_BUFGP_BUFG', 'q_ff_CLKINV', 'd_IBUF', 'r_IBUF', 'q_ff_SRINV', 'q_ff', 'q_OBUF']);
  assert.deepEqual(s.cells.get('clk_BUFGP_BUFG'), { type: 'X_BUFGMUX', port: new Map(), iopath: [{ from: 'I0', to: 'O', edge: null, ps: 1457 }, { from: 'I1', to: 'O', edge: null, ps: 1457 }],
    setup: [{ pin: 'S', clock: 'I0', edge: 'negedge', setup: 624, hold: 0 }] });
  assert.deepEqual(s.cells.get('q_ff_SRINV').iopath, [{ from: 'I', to: 'O', edge: null, ps: 1191 }]);
  const ff = s.cells.get('q_ff');
  assert.deepEqual([...ff.port], [['I', 484], ['CLK', 125]]);
  assert.deepEqual(ff.iopath, [{ from: 'CLK', to: 'O', edge: null, ps: 586 }, { from: 'SET', to: 'O', edge: null, ps: 586 }, { from: 'RST', to: 'O', edge: null, ps: 586 }]);
  assert.deepEqual(ff.setup, [
    { pin: 'I', clock: 'CLK', edge: 'posedge', setup: 132, hold: 48 }, { pin: 'I', clock: 'CLK', edge: 'posedge', setup: 132, hold: 48 },
    { pin: 'SRST', clock: 'CLK', edge: 'posedge', setup: 909, hold: -490 }, { pin: 'SRST', clock: 'CLK', edge: 'posedge', setup: 909, hold: -490 },
  ]);
});

test('annotateSdf on ISE\'s model: the clock network\'s delays, the clock to out on the output, the reset\'s path once, one setup check per pin', () => {
  const a = annotateSdf(NET, 'vhdl', parseSdf(SDF));
  assert.deepEqual([a.annotated, a.missing], [8, []]);
  const body = a.text.slice(a.text.lastIndexOf('\nbegin\n'));
  // the delays (X_SDFDLY: a wire's transport delay, then a gate's inertial one) and the setup checks (X_SDFCHECK)
  const dly = [...body.matchAll(/ : X_SDFDLY\n {4}generic map \(\n {6}WIRE_PS => (\d+),\n {6}GATE_PS => (\d+)\n {4}\)\n {4}port map \(\n {6}I => (\w+),\n {6}O => (\w+)\n/g)].map(m => `${m[3]} -> ${m[4]}: ${m[1]} + ${m[2]}`);
  assert.deepEqual(dly, [
    // the clock: the input buffer's, the BUFGMUX's, the inverter's paths, the clock pin's connection
    'clk -> clk_BUFGP_IBUFG_I_DLY: 0 + 526',
    'clk_INBUF -> clk_BUFGP_BUFG_I0_DLY: 0 + 1457',
    'clk_BUFGP -> q_ff_CLKINV_I_DLY: 0 + 92',
    'd -> d_IBUF_I_DLY: 0 + 526',
    'r -> r_IBUF_I_DLY: 0 + 526',
    'r_IBUF_3 -> q_ff_SRINV_I_DLY: 0 + 1191',
    // the flip-flop: its data's connection, its clock pin's, its clock to out on its output; its reset (RST -> O,
    // as the clock to out) through the output's delay only
    'd_IBUF_2 -> q_ff_I_DLY: 484 + 0',
    'q_ff_CLKINV_1 -> q_ff_CLK_DLY: 125 + 0',
    'q_ff_O_Q -> q_O: 0 + 586',
    'q_O -> q_OBUF_I_DLY: 599 + 1804',
  ]);
  assert.match(body, /^ {6}I0 => clk_BUFGP_BUFG_I0_DLY,\n {6}I1 => '0',\n {6}S => '0',$/m);
  assert.match(body, /^ {6}RST => q_ff_SRINV_4,$/m);
  // one setup check of I (both edges' checks are one), none of SRST (a constant), none on the BUFGMUX (S constant)
  assert.deepEqual([...body.matchAll(/^ {2}(\w+) : X_SDFCHECK\n {4}generic map \(\n {6}SETUP_PS => (\d+),\n {6}FROM_PS => 100000,\n {6}NEGEDGE => (\w+),\n {6}NAME => "([\w.]+)"\n {4}\)\n {4}port map \(\n {6}D => (\w+),\n {6}CLK => (\w+)\n/gm)].map(m => m.slice(1).join(' ')),
    ['q_ff_I_SETUP 132 FALSE q_ff.I q_ff_I_DLY q_ff_CLK_DLY']);
});

// the test bench: a clock of 20 ns (rising at 10, 30, … ns at the pad; 2.2 ns later at the flip-flop's clock pin:
// 526 + 1457 + 92 + 125 ps), the data 1.01 ns from the pad to the flip-flop (526 + 484 ps), the output 2.403 ns from
// it to the pad (599 + 1804 ps); the reset released at 100 ns
const TB = `library IEEE; use IEEE.STD_LOGIC_1164.ALL;
entity tb is end;
architecture t of tb is
  signal clk, d, q : std_logic := '0';
  signal r : std_logic := '1';
begin
  u : entity work.top port map (clk => clk, d => d, r => r, q => q);
  clk <= not clk after 10 ns;
  process begin
    wait for 100 ns; r <= '0';
    wait for 11 ns; d <= '1';          -- 111 ns: 1 ns after the edge of 110 ns, at the flip-flop 190 ps before its clock
    wait for 20.1 ns; d <= '0';        -- 131.1 ns: at the flip-flop 90 ps before its clock: a setup violation
    wait for 9.9 ns; d <= '1';         -- 141 ns: taken at 150 ns
    wait for 19 ns; r <= '1';          -- 160 ns: the asynchronous reset
    wait for 20 ns; report "done"; wait;
  end process;
  process (q) begin report "q = " & std_logic'image(q); end process;
end;`;

test('ISE\'s model simulated with its SDF: clock to out through the clock network, a setup violation, the asynchronous reset\'s delay', () => {
  const a = annotateSdf(NET, 'vhdl', parseSdf(SDF));
  const all = [{ path: 'tb.vhd', lang: 'vhdl', text: TB }, { path: 'netgen/par/top_timesim.vhd', lang: 'vhdl', text: scalarizeNetlist(a.text) }];
  const lib = compile([...primitiveSources(all), ...all]);
  const d = elaborate(lib, 'tb');
  assert.deepEqual([...lib.errors, ...d.diags].filter(x => !/redefined/.test(x.message)).map(x => `${x.file}:${x.line} ${x.message}`), []);
  const s = new Simulator(d);
  for (let t = 1e4; t <= 3e5 && !s.log.some(e => e.text === 'done'); t += 1e4) s.run(t);
  assert.deepEqual(s.log.filter(e => e.time >= 100000).map(e => `${e.time} ${e.kind}: ${e.text}`), [
    '115189 note: q = \'1\'',                // 110 + 2.2 (the clock) + 0.586 (clock to out) + 2.403 (to the pad) ns
    '132200 warning: Timing violation (setup 132 ps) on q_ff.I: changed 90 ps before the clock\'s edge',
    '135189 note: q = \'0\'',
    '155189 note: q = \'1\'',
    '164706 note: q = \'0\'',                // 160 + 0.526 + 1.191 (to the reset pin) + 0.586 (RST -> O) + 2.403 ns
    '180000 note: done',
  ]);
});
