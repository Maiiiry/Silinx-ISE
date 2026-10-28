In detail:

- **hls::axis_user (#1819):** Silinx's own ap_axi_sdata.h has AMD's `AXIS_ENABLE_*` flags and `hls::axis_user<WUser,
  EnableSignals, WId, WDest>`, an AXI4-Stream beat with no data: its user, last when `AXIS_ENABLE_LAST`, id and dest
  (a signal not enabled, of width 0, not a member), `get_user` / `set_user`. AMD's axi_stream_custom_side_channel_data_2
  passes (46 of 73).
