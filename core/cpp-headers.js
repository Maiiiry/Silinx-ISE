// Silinx HLS C++ (#1662): the headers of Vitis HLS's that Silinx HLS writes itself, in the C++ it reads (read as a
// project's header would be, after the project's own of the same name). Isomorphic ES module.
//
// ap_axi_sdata.h: ap_axis<D, U, TI, TD> (signed data) and ap_axiu<…> (unsigned), an AXI4-Stream's beat and its side
// channels: keep and strb a bit per byte of data, user U bits, last, id TI bits, dest TD bits; a side channel of width
// 0 left out (core/c-struct.js), as AMD's header has none. hls::axis_user<WUser, EnableSignals, WId, WDest> (#1819): AMD's
// hls::axis with no data (nor keep, strb): its user, last when AXIS_ENABLE_LAST, id and dest; get_user, set_user.
export const CPP_OWN_HEADERS = {
  'ap_axi_sdata.h': `#pragma once
#include "ap_int.h"
template <int D, int U, int TI, int TD> struct ap_axis {
  ap_int<D> data;
  ap_uint<(D + 7) / 8> keep;
  ap_uint<(D + 7) / 8> strb;
  ap_uint<U> user;
  ap_uint<1> last;
  ap_uint<TI> id;
  ap_uint<TD> dest;
};
template <int D, int U, int TI, int TD> struct ap_axiu {
  ap_uint<D> data;
  ap_uint<(D + 7) / 8> keep;
  ap_uint<(D + 7) / 8> strb;
  ap_uint<U> user;
  ap_uint<1> last;
  ap_uint<TI> id;
  ap_uint<TD> dest;
};
#define AXIS_ENABLE_DATA 0x01
#define AXIS_ENABLE_DEST 0x02
#define AXIS_ENABLE_ID 0x04
#define AXIS_ENABLE_KEEP 0x08
#define AXIS_ENABLE_LAST 0x10
#define AXIS_ENABLE_STRB 0x20
#define AXIS_ENABLE_USER 0x40
#define AXIS_ENABLE_SIDE_BAND 0x7e
#define AXIS_ENABLE_ALL 0x7f
/* (hls::axis_user: its namespace dropped, as the C++ Silinx reads takes a qualified name by its last part) */
template <int WU, int EN = AXIS_ENABLE_USER, int WI = 0, int WD = 0> struct axis_user {
  ap_uint<WU> user;
  ap_uint<(EN >> 4) & 1> last;
  ap_uint<WI> id;
  ap_uint<WD> dest;
  ap_uint<WU> get_user() const { return user; }
  void set_user(ap_uint<WU> v) { user = v; }
};
`,
};
