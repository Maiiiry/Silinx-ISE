// VHDL conformance: types and objects — integer subtypes, enumerations, arrays (1-D, arrays of
// vectors, 2-D), records, constants, aliases and the predefined attributes (IEEE 1076-2008 §5, §16.2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { out, outW, vproc, vhd, sim, diags } from './lang-util.js';

test('integer, natural, positive and ranged subtypes: defaults are the left bound', () => {
  const r = out(vproc(`
    report integer'image(i) & " " & integer'image(n) & " " & integer'image(p) & " " & integer'image(r) & " " & integer'image(d);
    report integer'image(small'low) & " " & integer'image(small'high) & " " & integer'image(small'right);`,
  `variable i : integer; variable n : natural; variable p : positive; variable r : small; variable d : integer range 10 downto -3;`,
  `subtype small is integer range 3 to 9;`));
  // the default value of a scalar object is T'left (§6.4.2.3)
  assert.deepEqual(r, ['-2147483648 0 1 3 10', '3 9 9']);
});

test('enumeration types: default is the first literal; case on an enumeration; enum signal events', () => {
  const r = out(vhd(`
  process begin
    report state_t'image(s);
    s <= b; wait for 1 ns; report state_t'image(s);
    s <= state_t'succ(s); wait for 1 ns; report state_t'image(s);
    wait;
  end process;
  process(s) begin
    case s is
      when a => n <= n + 1;
      when b | c => n <= n + 10;
    end case;
  end process;
  process begin wait for 5 ns; report integer'image(n); wait; end process;`,
  `type state_t is (a, b, c); signal s : state_t; signal n : integer := 0;`));
  // the case process runs at time 0 (s = a) and after each of the two changes
  assert.deepEqual(r, ['a', 'b', 'c', '21']);
});

test('constrained arrays: indexing with to and downto ranges, slices, \'left \'right \'low \'high \'length \'range \'reverse_range', () => {
  const r = out(vproc(`
    report std_logic'image(d(7)) & std_logic'image(d(0)) & std_logic'image(u(0)) & std_logic'image(u(7));
    report to_string(d(7 downto 4)) & " " & to_string(u(0 to 3));
    report integer'image(d'left) & integer'image(d'right) & integer'image(d'low) & integer'image(d'high) & integer'image(d'length);
    report integer'image(u'left) & integer'image(u'right) & integer'image(u'low) & integer'image(u'high) & integer'image(u'length);
    for i in d'range loop s := s & integer'image(i); end loop;
    report s; s := "";
    for i in d'reverse_range loop s := s & integer'image(i); end loop;
    report s;
    report boolean'image(d'ascending) & boolean'image(u'ascending);`,
  `variable d : std_logic_vector(7 downto 0) := "10000001"; variable u : std_logic_vector(0 to 7) := "10000000";
   variable s : string(1 to 0);`));
  assert.deepEqual(r, [
    "'1''1''1''0'", '1000 1000', '70078', '07078', '76543210', '01234567', 'falsetrue',
  ]);
});

test('arrays of vectors (memories): element read/write, element bit and slice, aggregates with others', () => {
  const r = out(vproc(`
    m(2) := x"A5"; m(3)(0) := '1'; m(3)(7 downto 4) := "1100";
    report to_hstring(m(0)) & " " & to_hstring(m(1)) & " " & to_hstring(m(2)) & " " & to_hstring(m(3));
    report std_logic'image(m(2)(7)) & " " & to_string(m(2)(3 downto 0)) & " " & integer'image(m'length) & " " & integer'image(m(0)'length);
    for i in m'range loop m(i) := std_logic_vector(to_unsigned(i * 3, 8)); end loop;
    report to_hstring(m(0)) & to_hstring(m(1)) & to_hstring(m(2)) & to_hstring(m(3));`,
  `variable m : mem_t := (0 => x"11", 1 => x"22", others => x"00");`,
  `type mem_t is array (0 to 3) of std_logic_vector(7 downto 0);`));
  assert.deepEqual(r, ['11 22 A5 C1', "'1' 0101 4 8", '00030609']);
});

test('array signals: element assignments from different processes, signal arrays of integers', () => {
  const r = out(vhd(`
  process begin a(0) <= 5; wait for 1 ns; a(0) <= a(0) + a(1); wait; end process;
  process begin a(1) <= 7; wait; end process;
  process begin wait for 2 ns; report integer'image(a(0)) & " " & integer'image(a(1)) & " " & integer'image(a(2)); wait; end process;`,
  `type int_arr is array (0 to 2) of integer; signal a : int_arr := (others => 0);`));
  assert.deepEqual(r, ['12 7 0']);
});

test('array equality and assignment copy whole arrays', () => {
  const r = out(vproc(`
    b := a; b(1) := 9;
    report boolean'image(a = b) & " " & integer'image(a(1)) & " " & integer'image(b(1));
    b(1) := 2; report boolean'image(a = b) & boolean'image(a /= b);`,
  `variable a : arr := (1, 2, 3); variable b : arr;`, `type arr is array (0 to 2) of integer;`));
  assert.deepEqual(r, ['false 2 9', 'truefalse']);
});

test('2-D arrays: element access and loops over both dimensions', () => {
  const r = out(vproc(`
    for i in 0 to 1 loop for j in 0 to 2 loop m(i, j) := i * 10 + j; end loop; end loop;
    report integer'image(m(1, 2)) & " " & integer'image(m(0, 1)) & " " & integer'image(m'length(2));`,
  `variable m : mat;`, `type mat is array (0 to 1, 0 to 2) of integer;`));
  assert.deepEqual(r, ['12 1 3']);
});

test('arrays of arrays (array of an array type): element-of-element access', () => {
  const r = out(vproc(`
    g(1)(2) := 7; g(0) := (4, 5, 6);
    report integer'image(g(1)(2)) & " " & integer'image(g(0)(0)) & " " & integer'image(g(1)(0));`,
  `variable g : grid := (others => (others => 0));`,
  `type row is array (0 to 2) of integer; type grid is array (0 to 1) of row;`));
  assert.deepEqual(r, ['7 4 0']);
});

test('records: field read/write, aggregate (positional and named), record signals and equality', () => {
  const r = out(vhd(`
  process
    variable v : pkt_t := (x"01", 3, '1');
  begin
    report to_hstring(v.data) & " " & integer'image(v.len) & " " & std_logic'image(v.valid);
    v.len := v.len + 1; v.data(7) := '1';
    report to_hstring(v.data) & " " & integer'image(v.len);
    s <= v; wait for 1 ns;
    report to_hstring(s.data) & " " & boolean'image(s = v);
    s.valid <= '0'; wait for 1 ns;
    report std_logic'image(s.valid) & " " & boolean'image(s = v);
    v := (data => x"FF", len => 0, valid => '0');
    report to_hstring(v.data) & integer'image(v.len);
    wait;
  end process;`,
  `type pkt_t is record data : std_logic_vector(7 downto 0); len : integer; valid : std_logic; end record;
   signal s : pkt_t;`));
  assert.deepEqual(r, ["01 3 '1'", '81 4', '81 true', "'0' false", 'FF0']);
});

test('arrays of records', () => {
  const r = out(vproc(`
    t(1).a := 5; t(1).b := "11";
    report integer'image(t(0).a) & " " & integer'image(t(1).a) & " " & to_string(t(1).b);`,
  `variable t : tab_t;`,
  `type rec is record a : integer; b : std_logic_vector(1 downto 0); end record;
   type tab_t is array (0 to 1) of rec;`));
  assert.deepEqual(r, ['-2147483648 5 11']);
});

test('constants: scalar, vector, array, computed from other constants and functions', () => {
  const r = out(vproc(`
    report integer'image(W) & " " & integer'image(D) & " " & to_string(ONES) & " " & integer'image(TAB(2)) & " " & integer'image(SQ);`,
  '',
  `constant W : integer := 4; constant D : natural := 2 ** W - 1;
   constant ONES : std_logic_vector(W - 1 downto 0) := (others => '1');
   type tab is array (0 to 3) of integer; constant TAB : tab := (10, 20, 30, 40);
   function sq(x : integer) return integer is begin return x * x; end function;
   constant SQ : integer := sq(W + 1);`));
  assert.deepEqual(r, ['4 15 1111 30 25']);
});

test('aliases of signals, slices and variables', () => {
  const r = out(vhd(`
  process
    variable v : std_logic_vector(7 downto 0) := x"3C";
    alias vh : std_logic_vector(3 downto 0) is v(7 downto 4);
  begin
    vh := "1010"; report to_hstring(v);
    hi <= "0110"; wait for 1 ns; report to_hstring(w);
    wait;
  end process;`,
  `signal w : std_logic_vector(7 downto 0) := x"00"; alias hi : std_logic_vector(3 downto 0) is w(7 downto 4);`));
  assert.deepEqual(r, ['AC', '60']);
});

test("signal attributes: 'event 'last_value 'stable 'last_event 'stable(T)", () => {
  const r = out(vhd(`
  process begin
    s <= '1'; wait for 0 ns;
    report boolean'image(s'event) & " " & std_logic'image(s'last_value) & " " & boolean'image(s'stable);
    wait for 1 ns;
    report boolean'image(s'event) & " " & boolean'image(s'stable);
    wait for 2 ns;
    report integer'image(s'last_event / 1 ps) & " " & boolean'image(s'stable(2 ns)) & " " & boolean'image(s'stable(5 ns));
    wait;
  end process;`, `signal s : std_logic := '0';`));
  assert.deepEqual(r, ["true '0' false", 'false true', '3000 true false']);
});

test("signal attributes 'delayed(T), 'transaction, 'quiet(T), 'active", { todo: "implicit signals 'delayed, 'transaction, 'quiet and 'active are not implemented" }, () => {
  const r = out(vhd(`
  d <= s'delayed(2 ns);
  process begin
    s <= '1'; wait for 0 ns;
    report boolean'image(s'active) & " " & boolean'image(s'quiet(1 ns)) & " " & std_logic'image(d);
    wait for 3 ns; report std_logic'image(d) & " " & bit'image(s'transaction);
    wait;
  end process;`, `signal s, d : std_logic := '0';`));
  assert.deepEqual(r, ["true false '0'", "'1' '1'"]);
});

test("'image of integers, booleans, enumerations and std_logic", () => {
  const r = out(vproc(`
    report integer'image(-42) & "|" & boolean'image(false) & "|" & e_t'image(two) & "|" & std_logic'image('Z');`,
  '', `type e_t is (one, two);`));
  assert.deepEqual(r, ["-42|false|two|'Z'"]);
});

// Regression (#15): a null range (`N - 1 downto 0` with N = 0, `0 to -1`) has no element; it gave
// one bit (two for `-1 downto 0`)
test('null ranges: vectors and arrays of no element, loops not run, null slices, aggregates and concatenations (#15)', () => {
  const r = outW(vproc(`
    report integer'image(a'length) & " " & integer'image(b'length) & " " & integer'image(c'length) & " " & integer'image(m'length);
    report integer'image(a'left) & " " & integer'image(a'right) & " " & boolean'image(a'ascending) & " " & boolean'image(b'ascending);
    for i in -1 downto 0 loop report "never"; end loop;
    for i in 0 to -1 loop report "never"; end loop;
    for i in a'range loop report "never"; end loop;
    for i in m'range loop report "never"; end loop;
    a := (others => '1');
    v := v(-1 downto 0) & v & b;
    report to_string(v) & " " & integer'image(v(-1 downto 0)'length) & " " & integer'image(v(7 downto 8)'length);
    report to_string(a & "01" & b);
    v(-1 downto 0) := a;
    report to_string(v);`,
  `variable a : std_logic_vector(-1 downto 0); variable b : std_logic_vector(0 to -1);
   variable v : std_logic_vector(7 downto 0) := x"A5"; variable m : int_arr(0 to -1);`,
  `constant N : natural := 0; signal c : std_logic_vector(N - 1 downto 0);
   type int_arr is array (natural range <>) of integer;`));
  assert.deepEqual(r, ['0 0 0 0', '-1 0 false true', '10100101 0 0', '01', '10100101']);
});

// Regression (#61): an integer subtype keeps its bounds and direction as declared; a null one
// (`range 5 to 3`) has no value: loops over it do not run, arrays of it have no element
test('integer subtypes: \'left / \'right / \'low / \'high / \'ascending, \'leftof / \'rightof and loops, descending and null ranges (#61)', () => {
  const img = (t) => `integer'image(${t}'left) & " " & integer'image(${t}'right) & " " & integer'image(${t}'low) & " " & integer'image(${t}'high) & " " & boolean'image(${t}'ascending)`;
  const r = outW(vproc(`
    report ${img('up')}; report ${img('dn')}; report ${img('nu')}; report ${img('nd')};
    for i in dn loop acc := acc * 10 + i; end loop;
    report integer'image(acc);
    report integer'image(dn'leftof(2)) & " " & integer'image(dn'rightof(2)) & " " & integer'image(up'leftof(2)) & " " & integer'image(up'rightof(2));
    for i in nu loop report "never"; end loop;
    for i in nu'range loop report "never"; end loop;
    for i in nu'reverse_range loop report "never"; end loop;
    for i in nd loop report "never"; end loop;
    report integer'image(arr'length) & " " & integer'image(nv'low) & " " & integer'image(nv'high) & " " & integer'image(nv'length);`,
  `variable acc : integer := 0;`,
  `subtype up is integer range 1 to 3; subtype dn is integer range 3 downto 1;
   subtype nu is integer range 5 to 3; subtype nd is integer range 3 downto 5;
   type nu_arr is array (nu) of bit; constant arr : nu_arr := (others => '0');
   signal nv : std_logic_vector(3 downto 5);`));
  assert.deepEqual(r, ['1 3 1 3 true', '3 1 1 3 false', '5 3 5 3 true', '3 5 5 3 false', '321', '3 1 1 3', '0 5 3 0']);
});

// Regression (#61): a slice with non-constant bounds against its direction is null too
// (`v(i + N - 1 downto i)` with N = 0): nothing read or written
test('null ranges: a non-constant slice against its direction reads and writes nothing (#61)', () => {
  const r = outW(vproc(`
    v := x"B2";
    for i in 0 to 3 loop v(i + N - 1 downto i) := a(2 * i + N - 1 downto 2 * i); end loop;
    report to_string(v);
    for i in 0 to 3 loop report integer'image(a(i + N - 1 downto i)'length); exit; end loop;`,
  `variable v : std_logic_vector(7 downto 0); variable a : std_logic_vector(7 downto 0) := x"FF";`,
  `constant N : natural := 0;`));
  assert.deepEqual(r, ['10110010', '0']);
});

// Regression (#11): slices of arrays of vectors (`mem(0 to 3)`): read, assigned (variables,
// signals, aggregates), sliced again, null, passed to an unconstrained parameter, in a constant
test('arrays of vectors: slices read and assigned, signals, aggregates, slices of slices, null slices, constants and calls (#11)', () => {
  const r = outW(vproc(`
    v := ROM(4 to 7);
    report to_hstring(v(0)) & to_hstring(v(3)) & " " & integer'image(ROM(2 to 5)'length) & " " & integer'image(ROM(2 to 5)'left) & " " & integer'image(ROM(2 to 5)'right);
    report to_hstring(HEAD(3)) & " " & integer'image(sum(ROM(1 to 2))) & " " & integer'image(sum(ROM(3 to 2))) & " " & integer'image(ROM(3 to 2)'length);
    w(2 to 5) := ROM(0 to 3);
    report to_hstring(w(1)) & to_hstring(w(2)) & to_hstring(w(5)) & to_hstring(w(6));
    w(0 to 1) := (x"AA", x"BB");
    report to_hstring(w(0)) & to_hstring(w(1)) & " " & to_hstring(ROM(0 to 5)(2 to 3)(3));
    sm(6 to 7) <= ROM(1 to 2);
    dm(3 downto 2) <= (x"5", x"6");
    wait for 1 ns;
    report to_hstring(sm(5)) & to_hstring(sm(6)) & to_hstring(sm(7)) & " " & to_hstring(dm(4)) & to_hstring(dm(3)) & to_hstring(dm(2)) & to_hstring(dm(1));`,
  `variable v : mem_t(0 to 3); variable w : mem_t(0 to 7) := (others => x"00");`,
  `type mem_t is array (natural range <>) of std_logic_vector(7 downto 0);
   constant ROM : mem_t(0 to 7) := (x"00", x"11", x"22", x"33", x"44", x"55", x"66", x"77");
   constant HEAD : mem_t(0 to 3) := ROM(0 to 3);
   function sum(m : mem_t) return integer is variable s : integer := 0; begin
     for i in m'range loop s := s + to_integer(unsigned(m(i))); end loop; return s; end function;
   signal sm : mem_t(0 to 7) := (others => x"FF");
   type dm_t is array (7 downto 0) of std_logic_vector(3 downto 0);
   signal dm : dm_t := (others => x"0");`));
  assert.deepEqual(r, ['4477 4 2 5', '33 51 0 0', '00003300', 'AABB 33', 'FF1122 0560']);
});

// Regression (#11, light8080's objcode_to_bram): a slice of an array with bounds known at run time
// only: (others => …) into it, a copy into it and out of it, a null one
test('arrays of vectors: slices with run-time bounds, filled with others, copied, null (#11)', () => {
  const r = outW(vproc(`
    report to_hstring(INIT(0)) & to_hstring(INIT(2)) & to_hstring(INIT(3)) & to_hstring(INIT(7));
    n := 5;
    w(n to 7) := ROM(0 to 7 - n);
    report to_hstring(w(4)) & to_hstring(w(5)) & to_hstring(w(7));
    v := ROM(n - 4 to n - 1);
    report to_hstring(v(0)) & to_hstring(v(3));
    n := 8;
    w(n to 7) := (others => x"EE");
    report to_hstring(w(7));`,
  `variable n : integer; variable v : mem_t(0 to 3); variable w : mem_t(0 to 7) := (others => x"00");`,
  `type mem_t is array (natural range <>) of std_logic_vector(7 downto 0);
   constant ROM : mem_t(0 to 7) := (x"00", x"11", x"22", x"33", x"44", x"55", x"66", x"77");
   function to_bram(oc : mem_t; size : integer) return mem_t is
     variable br : mem_t(0 to size - 1);
     variable obj_size : integer;
   begin
     if oc'length > size then obj_size := size; else obj_size := oc'length; end if;
     for i in 0 to obj_size - 1 loop br(i) := oc(oc'low + i); end loop;
     br(obj_size to size - 1) := (others => x"A5");
     return br;
   end function;
   constant INIT : mem_t(0 to 7) := to_bram(ROM(1 to 3), 8);`));
  assert.deepEqual(r, ['1133A5A5', '000022', '1144', '22']);   // (the null slice w(8 to 7) leaves w(7))
});

// Regression (#68): a subprogram with an unconstrained parameter was bound once per argument width,
// so a later call with another index range of the same width took the first call's 'range / 'left
test('unconstrained parameters take each call\'s index range: vectors and arrays of the same width (#68)', () => {
  const r = outW(vproc(`
    report integer'image(sum(X)) & " " & integer'image(sum(Y)) & " " & integer'image(sum(X));
    report integer'image(lft(hi)) & " " & integer'image(lft(lo)) & " " & integer'image(lft(up)) & " " & integer'image(lft(hi));`, '',
  `type mem_t is array (natural range <>) of std_logic_vector(7 downto 0);
   function sum(m : mem_t) return integer is variable s : integer := 0; begin
     for i in m'range loop s := s + to_integer(unsigned(m(i))); end loop; return s; end function;
   function lft(v : std_logic_vector) return integer is begin return v'left; end function;
   constant X : mem_t(1 to 2) := (x"11", x"22");
   constant Y : mem_t(3 to 5) := (x"01", x"02", x"03");
   signal hi : std_logic_vector(15 downto 8); signal lo : std_logic_vector(7 downto 0); signal up : std_logic_vector(0 to 7);`));
  assert.deepEqual(r, ['51 6 51', '15 7 0 15']);
});

test('null ranges: a generic entity with an optional port of N = 0 bits (#15)', () => {
  const r = outW(vhd(`
  u : entity work.opt generic map (N => 0) port map (x => none, a => "1010", y => y);
  process begin wait for 1 ns; report to_string(y) & " " & integer'image(y'length); wait; end process;`,
  `signal none : std_logic_vector(-1 downto 0); signal y : std_logic_vector(3 downto 0);`,
  { pre: `library ieee; use ieee.std_logic_1164.all;
entity opt is generic (N : natural := 0); port (x : in std_logic_vector(N - 1 downto 0); a : in std_logic_vector(3 downto 0); y : out std_logic_vector(N + 3 downto 0)); end;
architecture rtl of opt is begin y <= x & a; end;` }));
  assert.deepEqual(r, ['1010 4']);
});

// File objects (light8080's and neorv32's testbenches): declared, passed to `file` parameters,
// TEXT / LINE types; the textio calls on them are ignored with their warning (not modelled)
test('VHDL file declarations and file parameters elaborate; textio writes are ignored with a warning', () => {
  const src = `library ieee; use ieee.std_logic_1164.all; use std.textio.all;
entity tb is end tb;
architecture a of tb is
  file log_file : TEXT open write_mode is "log.txt";
  file a_file, b_file : text is out "ab.txt";
  procedure note(file f : TEXT; n : integer) is variable l : line; begin
    write(l, n); writeline(f, l);
  end procedure;
begin
  process begin note(log_file, 3); note(b_file, 4); report "done"; wait; end process;
end a;`;
  assert.deepEqual(out(src, 'tb'), ['done']);
  assert.deepEqual(diags(src, 'tb').map(d => `${d.severity} ${d.line} ${d.message}`),
    ["warning 7 procedure 'write' (textio) is not supported", "warning 7 procedure 'writeline' (textio) is not supported"]);
});
