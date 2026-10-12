// An in-memory FileSystemDirectoryHandle (the File System Access API of Chrome / Edge) for tests:
// the unit tests of web/js/project-store.js (Node) and the UI tests of the browser edition, where
// the real folder picker (showDirectoryPicker) cannot be driven headless.
//   fakeDirectory(name, { storage, key, permission, grant })
// storage + key: the tree is kept in that Storage (e.g. localStorage) and read back from it by the
// next fakeDirectory with the same key: the "same folder" after a page reload. permission: the
// state queryPermission reports ('granted' by default, 'prompt' as after a browser restart);
// requestPermission then gives `grant` ('granted' by default).
// (a tree too large for the Storage stays in memory only: it is not read back after a reload)
// dump(handle): { 'path/to/file': text } of every file under the handle.

const err = (name, msg) => (typeof DOMException === 'function' ? new DOMException(msg, name) : Object.assign(new Error(msg), { name }));
const enc = new TextEncoder();
const toB64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
const fromB64 = (b) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0));

function serialize(node) {
  if (node.kind === 'file') return { f: toB64(node.data), t: node.lastModified };
  return { d: Object.fromEntries([...node.children].map(([k, v]) => [k, serialize(v)])) };
}
function deserialize(o) {
  if (o.f !== undefined) return { kind: 'file', data: fromB64(o.f), lastModified: o.t || 0 };
  return { kind: 'directory', children: new Map(Object.entries(o.d || {}).map(([k, v]) => [k, deserialize(v)])) };
}

async function bytesOf(data) {
  if (data && typeof data === 'object' && data.type === 'write') data = data.data;
  if (typeof data === 'string') return enc.encode(data);
  if (data instanceof Uint8Array) return new Uint8Array(data);
  if (data instanceof ArrayBuffer) return new Uint8Array(data.slice(0));
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
  if (data && typeof data.arrayBuffer === 'function') return new Uint8Array(await data.arrayBuffer());
  throw new TypeError('unsupported data');
}

class FakeHandle {
  constructor(name, node, ctx) { this.name = name; this._node = node; this._ctx = ctx; this.kind = node.kind; }
  async isSameEntry(other) { return !!other && other._node === this._node; }
  async queryPermission() { return this._ctx.permission; }
  async requestPermission() { if (this._ctx.permission !== 'granted') this._ctx.permission = this._ctx.grant; return this._ctx.permission; }
}

class FakeFileHandle extends FakeHandle {
  async getFile() {
    const { data, lastModified } = this._node;
    const name = this.name;
    return { name, size: data.length, lastModified, type: '',
      text: async () => new TextDecoder().decode(data), arrayBuffer: async () => data.slice().buffer };
  }
  async createWritable({ keepExistingData = false } = {}) {
    this._ctx.check();
    let buf = keepExistingData ? this._node.data.slice() : new Uint8Array(0);
    let closed = false;
    return {
      write: async (data) => {
        if (closed) throw err('InvalidStateError', 'the stream is closed');
        const b = await bytesOf(data);
        const n = new Uint8Array(buf.length + b.length); n.set(buf); n.set(b, buf.length); buf = n;
      },
      close: async () => { closed = true; this._node.data = buf; this._node.lastModified = Date.now(); this._ctx.save(); },
      abort: async () => { closed = true; },
    };
  }
}

class FakeDirectoryHandle extends FakeHandle {
  async getDirectoryHandle(name, { create = false } = {}) {
    const c = this._node.children.get(name);
    if (c) { if (c.kind !== 'directory') throw err('TypeMismatchError', `'${name}' is a file`); return new FakeDirectoryHandle(name, c, this._ctx); }
    if (!create) throw err('NotFoundError', `'${name}' not found`);
    this._ctx.check();
    const n = { kind: 'directory', children: new Map() };
    this._node.children.set(name, n);
    this._ctx.save();
    return new FakeDirectoryHandle(name, n, this._ctx);
  }
  async getFileHandle(name, { create = false } = {}) {
    const c = this._node.children.get(name);
    if (c) { if (c.kind !== 'file') throw err('TypeMismatchError', `'${name}' is a folder`); return new FakeFileHandle(name, c, this._ctx); }
    if (!create) throw err('NotFoundError', `'${name}' not found`);
    this._ctx.check();
    const n = { kind: 'file', data: new Uint8Array(0), lastModified: Date.now() };
    this._node.children.set(name, n);
    this._ctx.save();
    return new FakeFileHandle(name, n, this._ctx);
  }
  async removeEntry(name, { recursive = false } = {}) {
    const c = this._node.children.get(name);
    if (!c) throw err('NotFoundError', `'${name}' not found`);
    if (c.kind === 'directory' && c.children.size && !recursive) throw err('InvalidModificationError', `'${name}' is not empty`);
    this._ctx.check();
    this._node.children.delete(name);
    this._ctx.save();
  }
  async *entries() {
    for (const [k, v] of [...this._node.children]) yield [k, v.kind === 'directory' ? new FakeDirectoryHandle(k, v, this._ctx) : new FakeFileHandle(k, v, this._ctx)];
  }
  async *keys() { for await (const [k] of this.entries()) yield k; }
  async *values() { for await (const [, v] of this.entries()) yield v; }
  [Symbol.asyncIterator]() { return this.entries(); }
}

export function fakeDirectory(name = 'Silinx-projects', { storage, key, permission = 'granted', grant = 'granted' } = {}) {
  let root = { kind: 'directory', children: new Map() };
  if (storage && key) { try { const s = storage.getItem(key); if (s) root = deserialize(JSON.parse(s)); } catch { /* a new folder */ } }
  const ctx = {
    permission, grant,
    // writes need the permission (as the browser: NotAllowedError)
    check() { if (ctx.permission !== 'granted') throw err('NotAllowedError', 'permission to the folder was not granted'); },
    // (a tree too large for the Storage, e.g. with a build's bitstreams, is kept in memory only)
    save() {
      if (!storage || !key || ctx.tooLarge) return;
      try { storage.setItem(key, JSON.stringify(serialize(root))); } catch { ctx.tooLarge = true; }
    },
  };
  ctx.save();
  return new FakeDirectoryHandle(name, root, ctx);
}

export async function dump(dir, base = '', out = {}) {
  for await (const [k, h] of dir.entries()) {
    const rel = base ? `${base}/${k}` : k;
    if (h.kind === 'directory') { out[`${rel}/`] = null; await dump(h, rel, out); } else out[rel] = await (await h.getFile()).text();
  }
  return out;
}
