// External toolchain detection + configuration (Xilinx ISE 14.7 and JTAG programmers).
//
// ISE 14.7 does not run natively on macOS (and only poorly on modern Linux), so the ISE flow
// can be executed in three modes, chosen by the user and saved in ~/.silinx/config.json:
//   local  - ISE binaries on this machine (sourced from settings64.sh if not on PATH)
//   docker - inside a user-supplied docker image that contains ISE, with build/ mounted at /work
//   ssh    - build/ is streamed (tar over ssh) to another machine, run there (with ISE installed
//            on it, or in a docker image on it: ssh.image, e.g. an Intel Mac) and the results
//            are streamed back
//   open   - no ISE: the Silinx toolchain runs on this machine (server/open-flow.js:
//            Yosys + Silinx's pack, place, route and bitgen) for the devices with a device
//            description and a bit database. ISE is still used (open.iseMode: local / docker / ssh,
//            with the settings of that mode) to build the description of another device.
// Programmers always run locally (they need the USB device).

import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { capture } from './jobs.js';

export const ISE_TOOLS = ['xst', 'ngdbuild', 'map', 'par', 'trce', 'bitgen'];
export const PROGRAMMERS = ['openFPGALoader', 'xc3sprog', 'djtgcfg', 'impact'];
export const DEFAULT_SETTINGS = '/opt/Xilinx/14.7/ISE_DS/settings64.sh';
// the ways of running ISE, and the Silinx toolchain (no ISE)
export const ISE_MODES = ['local', 'docker', 'ssh'];
export const MODES = [...ISE_MODES, 'silinx'];
/** A saved configuration from before #28 says 'open' for the Silinx toolchain. */
const modeAlias = cfg => (cfg.mode === 'open' ? { ...cfg, mode: 'silinx' } : cfg);

/** The ISE mode used for the tasks that need ISE (in the Silinx toolchain mode: open.iseMode, e.g. building a device description). */
export const iseModeOf = cfg => (ISE_MODES.includes(cfg.mode) ? cfg.mode : cfg.open?.iseMode || 'local');

export function configDir() {
  return process.env.SILINX_CONFIG_DIR || path.join(os.homedir(), '.silinx');
}
export const configPath = () => path.join(configDir(), 'config.json');

export const DEFAULT_CONFIG = Object.freeze({
  mode: 'silinx',                               // the Silinx toolchain: no ISE to install for the supported boards (#27)
  local: { settings: '' },                      // '' = auto-detect
  docker: { command: 'docker', image: '', platform: 'linux/amd64', settings: DEFAULT_SETTINGS, extraArgs: [] },
  ssh: { host: '', user: '', port: 22, identity: '', remoteDir: 'silinx-build', settings: DEFAULT_SETTINGS, image: '', sshArgs: [] },   // image: docker image on the host ('' = ISE installed there)
  open: { iseMode: 'docker' },                  // Silinx toolchain mode: the ISE that builds device descriptions (developers) (local|docker|ssh)
  programmer: { tool: '', cable: '' },          // global defaults (board defaults take precedence when empty)
  paths: {},                                    // explicit binary paths, e.g. { djtgcfg: '/usr/local/bin/djtgcfg' }
});

function merge(base, over) {
  const out = { ...base };
  for (const [k, v] of Object.entries(over || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k]))
      out[k] = merge(base[k], v);
    else if (v !== undefined) out[k] = v;
  }
  return out;
}

export async function loadConfig() {
  try { return modeAlias(merge(DEFAULT_CONFIG, JSON.parse(await fs.readFile(configPath(), 'utf8')))); }
  catch { return merge(DEFAULT_CONFIG, {}); }
}

/** The settings that name a program to run or its arguments: set in config.json (or with the
 *  command line) only, never through the API (Toolchain Settings does not show them). */
export const FILE_ONLY = ['docker.command', 'docker.extraArgs', 'ssh.sshArgs', 'ssh.identity', 'paths'];
/** A settings script ISE's way: …/settings64.sh or …/settings32.sh ('' = auto-detect). */
const SETTINGS = /(^|[\\/])settings(32|64)\.sh$/;

const at = (o, key) => key.split('.').reduce((v, k) => (v && typeof v === 'object' ? v[k] : undefined), o);
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Validate + persist a (partial) config, merged over the current one. fromApi: a change asked
 *  through the HTTP API (the FILE_ONLY settings may only be sent unchanged). */
export async function saveConfig(partial, { fromApi = false } = {}) {
  if (!partial || typeof partial !== 'object') throw Object.assign(new Error('config must be an object'), { status: 400 });
  const current = await loadConfig();
  if (fromApi) {
    for (const key of FILE_ONLY) {
      const v = at(partial, key);
      if (v !== undefined && !same(v, at(current, key)))
        throw Object.assign(new Error(`${key} can only be set in ${configPath()}`), { status: 403 });
    }
    for (const key of ['local.settings', 'docker.settings', 'ssh.settings']) {
      const v = at(partial, key);
      if (v && !SETTINGS.test(String(v))) throw Object.assign(new Error(`${key} must be ISE's settings64.sh (or settings32.sh)`), { status: 400 });
    }
  }
  const cfg = modeAlias(merge(current, partial));
  if (!MODES.includes(cfg.mode)) throw Object.assign(new Error(`invalid mode '${cfg.mode}' (${MODES.join('|')})`), { status: 400 });
  if (!ISE_MODES.includes(cfg.open.iseMode)) throw Object.assign(new Error(`invalid open.iseMode '${cfg.open.iseMode}' (${ISE_MODES.join('|')})`), { status: 400 });
  for (const k of ['extraArgs']) if (!Array.isArray(cfg.docker[k])) throw Object.assign(new Error(`docker.${k} must be an array of strings`), { status: 400 });
  if (!Array.isArray(cfg.ssh.sshArgs)) throw Object.assign(new Error('ssh.sshArgs must be an array of strings'), { status: 400 });
  if (cfg.ssh.host && !/^[A-Za-z0-9._@:\-[\]]+$/.test(cfg.ssh.host)) throw Object.assign(new Error('ssh.host contains invalid characters'), { status: 400 });
  if (cfg.ssh.image && !/^[\w./:@-]+$/.test(cfg.ssh.image)) throw Object.assign(new Error('ssh.image contains invalid characters'), { status: 400 });
  if (cfg.ssh.user && !/^[A-Za-z0-9._-]+$/.test(cfg.ssh.user)) throw Object.assign(new Error('ssh.user contains invalid characters'), { status: 400 });
  // only the user may read it (the ssh host and user, the identity file's path)
  await fs.mkdir(configDir(), { recursive: true, mode: 0o700 });
  await fs.writeFile(configPath(), JSON.stringify(cfg, null, 2) + '\n', { mode: 0o600 });
  await fs.chmod(configPath(), 0o600).catch(() => {});   // a file written before with another mode
  return cfg;
}

// ---------------------------------------------------------------------------------------------
// Detection helpers
// ---------------------------------------------------------------------------------------------

function isExec(p) {
  try { const st = fss.statSync(p); return st.isFile() && (process.platform === 'win32' || (st.mode & 0o111) !== 0); }
  catch { return false; }
}

/** Find an executable on PATH (plus extra directories). */
export function which(name, extraDirs = []) {
  if (name.includes('/')) return isExec(name) ? name : null;
  const exts = process.platform === 'win32' ? ['.exe', '.bat', '.cmd', ''] : [''];
  const dirs = [...extraDirs, ...(process.env.PATH || '').split(path.delimiter)].filter(Boolean);
  for (const d of dirs) for (const e of exts) {
    const p = path.join(d, name + e);
    if (isExec(p)) return p;
  }
  return null;
}

/** Candidate ISE_DS roots (directory containing settings64.sh). */
function iseRoots(cfg) {
  const roots = [];
  if (cfg?.local?.settings) roots.push(path.dirname(cfg.local.settings));
  const X = process.env.XILINX;               // usually .../14.7/ISE_DS/ISE
  if (X) roots.push(path.basename(X) === 'ISE' ? path.dirname(X) : X);
  const home = os.homedir();
  roots.push('/opt/Xilinx/14.7/ISE_DS', path.join(home, 'Xilinx/14.7/ISE_DS'), '/tools/Xilinx/14.7/ISE_DS',
    '/opt/Xilinx/14.7/LabTools', path.join(home, 'Xilinx/14.7/LabTools'), 'C:\\Xilinx\\14.7\\ISE_DS');
  return [...new Set(roots)];
}

function iseBinDirs(root) {
  return ['ISE/bin/lin64', 'ISE/bin/lin', 'LabTools/bin/lin64', 'ISE/bin/nt64', 'bin/lin64']
    .map(d => path.join(root, d));
}

/** Locate a local ISE install. */
export function detectIse(cfg) {
  const out = { found: false, root: null, settings: null, binDir: null, tools: {}, onPath: false };
  for (const t of ISE_TOOLS) out.tools[t] = which(t);
  out.onPath = ISE_TOOLS.every(t => out.tools[t]);
  for (const root of iseRoots(cfg)) {
    const settings = ['settings64.sh', 'settings32.sh'].map(s => path.join(root, s)).find(s => fss.existsSync(s));
    if (!settings) continue;
    out.root = root; out.settings = settings;
    out.binDir = iseBinDirs(root).find(d => fss.existsSync(d)) || null;
    if (out.binDir) for (const t of ISE_TOOLS) out.tools[t] ||= which(t, [out.binDir]);
    break;
  }
  out.found = out.onPath || ISE_TOOLS.every(t => out.tools[t]) || !!out.settings;
  const m = /(\d+\.\d+)/.exec(out.root || '');
  out.version = m ? m[1] : null;
  return out;
}

/** Path of a programmer binary (explicit config path, PATH, ISE bin dir for impact). */
export function resolveTool(name, cfg, ise) {
  const explicit = cfg?.paths?.[name];
  if (explicit) return isExec(explicit) ? explicit : null;
  const extra = [];
  if (name === 'impact' && ise?.binDir) extra.push(ise.binDir);
  if (name === 'djtgcfg') extra.push('/usr/local/bin', '/usr/bin', '/opt/homebrew/bin');
  return which(name, extra);
}

const VERSION_PROBES = {
  openFPGALoader: [['--Version'], /openFPGALoader\s+v?([\w.\-]+)/i],
  xc3sprog: [['-h'], /XC3SPROG.*?(\$Rev[^$]*\$|r\d+|\d+\.\d+)/i],
  djtgcfg: [['--version'], /([\d]+\.[\d.]+)/],
};

async function probeVersion(name, bin) {
  const p = VERSION_PROBES[name];
  if (!p || !bin) return null;
  const r = await capture(bin, p[0], { timeoutMs: 3000 });
  const m = p[1].exec(r.out || '');
  return m ? m[1].trim() : (r.out || '').split('\n').find(l => l.trim())?.trim().slice(0, 80) || null;
}

/** Full detection report for GET /api/toolchain. */
export async function detectToolchain() {
  const cfg = await loadConfig();
  const ise = detectIse(cfg);
  const programmers = {};
  await Promise.all(PROGRAMMERS.map(async name => {
    const bin = resolveTool(name, cfg, ise);
    programmers[name] = { found: !!bin, path: bin, version: name === 'impact' ? (ise.version || null) : await probeVersion(name, bin) };
  }));
  {
    const { adepttoolPaths } = await import('./programmer.js');
    const a = adepttoolPaths(cfg);
    programmers.adepttool = { found: a.ok, path: a.ok ? path.join(a.src, 'basys2_prog.py') : null, version: null, python: a.py };
  }
  // impact found via settings64.sh even when not on PATH
  if (!programmers.impact.found && ise.settings && ise.binDir && isExec(path.join(ise.binDir, 'impact'))) {
    programmers.impact = { found: true, path: path.join(ise.binDir, 'impact'), version: ise.version, viaSettings: true };
  }
  const helpers = {};
  for (const h of ['docker', 'ssh', 'tar', 'bash']) helpers[h] = which(h);
  if (cfg.docker.command && cfg.docker.command !== 'docker') helpers.docker = which(cfg.docker.command);

  let dockerImage = null;
  if (iseModeOf(cfg) === 'docker' && helpers.docker && cfg.docker.image) {
    const r = await capture(helpers.docker, ['image', 'inspect', '--format', '{{.Id}}', cfg.docker.image], { timeoutMs: 5000 });
    dockerImage = { image: cfg.docker.image, present: r.code === 0, detail: r.code === 0 ? r.out.trim() : (r.error || r.out.trim().slice(0, 200)) };
  }
  const status = iseStatus(cfg, { ise, helpers, dockerImage });
  // Silinx toolchain mode: can ISE still build device descriptions (with the settings of open.iseMode)?
  const builder = cfg.mode === 'silinx' ? iseStatus({ ...cfg, mode: iseModeOf(cfg) }, { ise, helpers, dockerImage }) : status;
  return {
    platform: process.platform,
    config: cfg,
    configPath: configPath(),
    ise: { ...ise, ...status },
    deviceBuilder: { mode: iseModeOf(cfg), available: builder.available, reason: builder.reason },
    programmers,
    helpers,
    dockerImage,
  };
}

/**
 * Can the ISE flow run in the configured mode? Returns { mode, available, reason, help }.
 * `det` is { ise, helpers, dockerImage? } from detection.
 */
export function iseStatus(cfg, det) {
  const mode = cfg.mode;
  const help = HELP[mode];
  if (mode === 'local') {
    if (!det.helpers.bash) return { mode, available: false, reason: 'bash not found (the flow script run.sh needs bash)', help };
    if (det.ise.onPath || det.ise.settings) return { mode, available: true, reason: det.ise.onPath ? 'ISE tools found on PATH' : `ISE found via ${det.ise.settings}`, help };
    const mac = process.platform === 'darwin' ? ' Xilinx ISE does not run natively on macOS; use the docker or ssh mode.' : '';
    return { mode, available: false, reason: `Xilinx ISE 14.7 not found (looked for xst/ngdbuild/map/par/trce/bitgen on PATH and settings64.sh under /opt/Xilinx/14.7/ISE_DS, ~/Xilinx/14.7/ISE_DS, $XILINX).${mac}`, help };
  }
  if (mode === 'docker') {
    if (!det.helpers.docker) return { mode, available: false, reason: `'${cfg.docker.command || 'docker'}' command not found`, help };
    if (!cfg.docker.image) return { mode, available: false, reason: 'no docker image configured (docker.image)', help };
    if (det.dockerImage && !det.dockerImage.present) return { mode, available: false, reason: `docker image '${cfg.docker.image}' not present locally (docker image inspect failed). Build or pull it yourself; Silinx never pulls images.`, help };
    return { mode, available: true, reason: `docker image ${cfg.docker.image}`, help };
  }
  if (mode === 'ssh') {
    if (!det.helpers.ssh) return { mode, available: false, reason: 'ssh not found', help };
    if (!det.helpers.tar) return { mode, available: false, reason: 'tar not found (used to copy the build directory over ssh)', help };
    if (!cfg.ssh.host) return { mode, available: false, reason: 'no ssh host configured (ssh.host)', help };
    return { mode, available: true, reason: `remote host ${cfg.ssh.user ? cfg.ssh.user + '@' : ''}${cfg.ssh.host}${cfg.ssh.image ? ` (docker image ${cfg.ssh.image})` : ''}`, help };
  }
  if (mode === 'silinx') {
    return { mode, available: true, reason: 'Silinx toolchain (no ISE): synthesis, place and route and bitstream by Silinx and Yosys, for the devices with a device description and a bit database (the Spartan-3E XC3S100E, XC3S250E, XC3S500E and XC3S1200E: Basys2, Nexys2)', help };
  }
  return { mode, available: false, reason: `unknown mode '${mode}'`, help: HELP.local };
}

export const HELP = {
  local: 'Install Xilinx ISE 14.7 (WebPACK) on a Linux/Windows machine and either put its bin directory on PATH or set "local.settings" to .../14.7/ISE_DS/settings64.sh via PUT /api/toolchain. On macOS use mode "docker" (an x86-64 image containing ISE 14.7 at /opt/Xilinx/14.7/ISE_DS) or mode "ssh" (a Linux host with ISE). You can also choose "generate scripts only" and run build/run.sh on any machine with ISE.',
  docker: 'Set {"mode":"docker","docker":{"image":"<your-ise-image>","settings":"/opt/Xilinx/14.7/ISE_DS/settings64.sh"}} via PUT /api/toolchain. The image must already exist locally (Silinx never pulls/builds images). The build directory is mounted at /work and run.sh is executed there.',
  silinx: 'The Silinx toolchain needs no Xilinx tool: Implement Design and Generate Programming File run Silinx\'s own flow (Yosys synthesis, pack, place, route, bitstream) on this machine. It supports the Spartan-3E XC3S100E and XC3S250E (Basys2-100, Basys2-250), XC3S500E and XC3S1200E (Nexys2-500, Nexys2-1200) for now: their device descriptions and bit databases ship with Silinx. Use an ISE mode for the other devices.',
  ssh: 'Set {"mode":"ssh","ssh":{"host":"build-box","user":"me","remoteDir":"silinx-build","settings":"/opt/Xilinx/14.7/ISE_DS/settings64.sh"}} via PUT /api/toolchain. Password-less (key) authentication is required; the build directory is streamed with tar over ssh into <remoteDir>/<project> and the results are copied back the same way. With "image" (a docker image with ISE 14.7 on the host, e.g. on an Intel Mac) the flow runs in that image instead of an ISE installed on the host.',
};
