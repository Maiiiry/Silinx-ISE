In detail:
- Silinx HLS: the Vitis oracle's `--collect` with no `--update` keeps the run's results on the host. It had deleted them right after fetching them, and with nothing saved the run was lost. The folder is deleted only once `--update` has written `vitis.json` and the README's table (#1826).
