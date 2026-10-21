In detail:

- **Pack: a never-written block-RAM port's constant inputs left out (#836):** a port whose WE is tied to 0 and whose data
  and parity inputs are all constants (a ROM, the read-only port of a RAM, the Block Memory wizard's) leaves them
  unconnected, as ISE's map trims them; ISE's DRC called that block's unread outputs dangling pins
  (PhysDesignRules:812) before. A never-written port with a signal on a data input keeps them all, as ISE does.
