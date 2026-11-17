import { inflateRawSync } from "node:zlib";

const signature = (bytes, offset) => bytes.readUInt32LE(offset);
const attribute = (xml, name) => {
  const match = xml.match(new RegExp(`(?:^|\\s)${name.replace(":", "\\:")}="([^"]*)"`));
  return match ? decodeXml(match[1]) : null;
};

function decodeXml(value) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

function zipEntries(bytes) {
  const minimumOffset = Math.max(0, bytes.length - 65_557);
  let endOffset = -1;
  for (let offset = bytes.length - 22; offset >= minimumOffset; offset--) {
    if (signature(bytes, offset) === 0x06054b50) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0) throw new Error("XLSX ZIP directory is missing");
  if (bytes.readUInt16LE(endOffset + 4) !== 0 || bytes.readUInt16LE(endOffset + 6) !== 0) {
    throw new Error("Multi-disk XLSX files are unsupported");
  }
  const entries = bytes.readUInt16LE(endOffset + 10);
  const directoryOffset = bytes.readUInt32LE(endOffset + 16);
  const result = new Map();
  let offset = directoryOffset;
  for (let index = 0; index < entries; index++) {
    if (signature(bytes, offset) !== 0x02014b50) throw new Error("Invalid XLSX ZIP directory entry");
    const method = bytes.readUInt16LE(offset + 10);
    const compressedBytes = bytes.readUInt32LE(offset + 20);
    const uncompressedBytes = bytes.readUInt32LE(offset + 24);
    const nameBytes = bytes.readUInt16LE(offset + 28);
    const extraBytes = bytes.readUInt16LE(offset + 30);
    const commentBytes = bytes.readUInt16LE(offset + 32);
    const localOffset = bytes.readUInt32LE(offset + 42);
    const name = bytes.toString("utf8", offset + 46, offset + 46 + nameBytes);
    if (result.has(name)) throw new Error(`Duplicate XLSX ZIP entry ${name}`);
    result.set(name, { method, compressedBytes, uncompressedBytes, localOffset });
    offset += 46 + nameBytes + extraBytes + commentBytes;
  }
  return result;
}

function readEntry(bytes, entries, name) {
  const entry = entries.get(name);
  if (!entry) return null;
  const offset = entry.localOffset;
  if (signature(bytes, offset) !== 0x04034b50) throw new Error(`Invalid XLSX local header for ${name}`);
  const nameBytes = bytes.readUInt16LE(offset + 26);
  const extraBytes = bytes.readUInt16LE(offset + 28);
  const start = offset + 30 + nameBytes + extraBytes;
  const compressed = bytes.subarray(start, start + entry.compressedBytes);
  let content;
  if (entry.method === 0) content = Buffer.from(compressed);
  else if (entry.method === 8) content = inflateRawSync(compressed);
  else throw new Error(`Unsupported XLSX compression method ${entry.method}`);
  if (content.length !== entry.uncompressedBytes) throw new Error(`Invalid XLSX entry size for ${name}`);
  return content.toString("utf8");
}

function sharedStrings(xml) {
  if (xml === null) return [];
  return [...xml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map(([, item]) =>
    [...item.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
      .map(([, text]) => decodeXml(text)).join(""));
}

function columnIndex(reference) {
  const letters = reference.match(/^[A-Z]+/i)?.[0];
  if (!letters) throw new Error(`Invalid XLSX cell reference ${reference}`);
  let index = 0;
  for (const letter of letters.toUpperCase()) index = index * 26 + letter.charCodeAt(0) - 64;
  return index - 1;
}

function cellValue(xml, strings, reference) {
  const type = attribute(xml, "t");
  if (type === "inlineStr") {
    const inline = xml.match(/<is(?:\s[^>]*)?>([\s\S]*?)<\/is>/);
    return inline
      ? [...inline[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
        .map(([, text]) => decodeXml(text)).join("")
      : "";
  }
  const value = xml.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/)?.[1];
  if (value === undefined || value === "") return null;
  if (type === "s") {
    const index = Number(value);
    if (!Number.isInteger(index) || index < 0 || index >= strings.length) {
      throw new Error(`Invalid shared string index in ${reference}`);
    }
    return strings[index];
  }
  if (type === "str") return decodeXml(value);
  if (type === "b") return value === "1";
  if (type === "e") throw new Error(`XLSX error cell at ${reference}`);
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`Invalid numeric XLSX cell at ${reference}`);
  return number;
}

export function readXlsxSheets(bytes, requestedNames) {
  if (!Buffer.isBuffer(bytes)) throw new TypeError("XLSX input must be a Buffer");
  const entries = zipEntries(bytes);
  const workbookXml = readEntry(bytes, entries, "xl/workbook.xml");
  const relationshipsXml = readEntry(bytes, entries, "xl/_rels/workbook.xml.rels");
  if (workbookXml === null || relationshipsXml === null) throw new Error("XLSX workbook metadata is missing");
  const relationships = new Map();
  for (const [relation] of relationshipsXml.matchAll(/<Relationship\b[^>]*\/?>/g)) {
    const id = attribute(relation, "Id");
    const target = attribute(relation, "Target");
    if (!id || !target) continue;
    relationships.set(id, target.startsWith("/") ? target.slice(1)
      : target.startsWith("xl/") ? target : `xl/${target}`);
  }
  const sheetPaths = new Map();
  for (const [sheet] of workbookXml.matchAll(/<sheet\b[^>]*\/?>/g)) {
    const name = attribute(sheet, "name");
    const id = attribute(sheet, "r:id");
    const path = id ? relationships.get(id) : null;
    if (name && path) sheetPaths.set(name, path);
  }
  const strings = sharedStrings(readEntry(bytes, entries, "xl/sharedStrings.xml"));
  const tables = {};
  for (const name of requestedNames) {
    const path = sheetPaths.get(name);
    if (!path) throw new Error(`Required XLSX sheet is missing: ${name}`);
    const xml = readEntry(bytes, entries, path);
    if (xml === null) throw new Error(`Required XLSX sheet data is missing: ${name}`);
    const rows = [];
    for (const [, rowAttributes, rowXml] of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
      const rowNumber = Number(attribute(rowAttributes, "r"));
      if (!Number.isInteger(rowNumber) || rowNumber < 1) throw new Error(`Invalid XLSX row in ${name}`);
      const row = rows[rowNumber - 1] ?? [];
      for (const [, attributes, contents] of rowXml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const reference = attribute(attributes, "r");
        if (!reference) throw new Error(`XLSX cell reference is missing in ${name}`);
        const column = columnIndex(reference);
        row[column] = cellValue(`<c ${attributes}>${contents ?? ""}</c>`, strings, reference);
      }
      rows[rowNumber - 1] = row;
    }
    tables[name] = rows;
  }
  return tables;
}
