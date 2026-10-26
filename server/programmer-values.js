// The programming tools' names and the shape of their option values (#1433): shared by server/programmer.js (a
// request's options) and server/toolchain.js (the defaults Toolchain Settings saves), which import each other
// otherwise. A cable or device name is a value of a tool's option, never an option of its own (#1236).
export const TOOLS = ['openFPGALoader', 'xc3sprog', 'djtgcfg', 'impact', 'adepttool'];

/** A cable or device name (openFPGALoader's digilent_hs2, xc3sprog's nexys2, iMPACT's usb21, djtgcfg's Nexys2, 0). */
export const VALUE = /^[\w.:@/][\w .:@/-]*$/;
