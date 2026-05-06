export type ZipEntry = {
  path: string;
  data: Uint8Array;
  modifiedAt?: Date;
};

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date: Date) {
  const year = Math.max(1980, date.getFullYear());
  const month = Math.max(1, date.getMonth() + 1);
  const day = Math.max(1, date.getDate());
  const hours = Math.min(23, date.getHours());
  const minutes = Math.min(59, date.getMinutes());
  const seconds = Math.min(59, date.getSeconds());

  const dosTime = ((hours & 0x1f) << 11) | ((minutes & 0x3f) << 5) | ((Math.floor(seconds / 2)) & 0x1f);
  const dosDate = (((year - 1980) & 0x7f) << 9) | ((month & 0x0f) << 5) | (day & 0x1f);
  return { dosDate, dosTime };
}

function le16(value: number) {
  const out = new Uint8Array(2);
  out[0] = value & 0xff;
  out[1] = (value >>> 8) & 0xff;
  return out;
}

function le32(value: number) {
  const out = new Uint8Array(4);
  out[0] = value & 0xff;
  out[1] = (value >>> 8) & 0xff;
  out[2] = (value >>> 16) & 0xff;
  out[3] = (value >>> 24) & 0xff;
  return out;
}

export function createZipBlob(entries: ZipEntry[]) {
  const encoder = new TextEncoder();
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const filename = entry.path.replace(/^\/+/, "").replace(/\\/g, "/");
    const filenameBytes = encoder.encode(filename);
    const data = entry.data;
    const { dosDate, dosTime } = dosDateTime(entry.modifiedAt || new Date());
    const checksum = crc32(data);

    const localHeader = new Uint8Array(30 + filenameBytes.length);
    localHeader.set(le32(0x04034b50), 0);
    localHeader.set(le16(20), 4);
    localHeader.set(le16(0), 6);
    localHeader.set(le16(0), 8);
    localHeader.set(le16(dosTime), 10);
    localHeader.set(le16(dosDate), 12);
    localHeader.set(le32(checksum), 14);
    localHeader.set(le32(data.length), 18);
    localHeader.set(le32(data.length), 22);
    localHeader.set(le16(filenameBytes.length), 26);
    localHeader.set(le16(0), 28);
    localHeader.set(filenameBytes, 30);

    localChunks.push(localHeader, data);

    const centralHeader = new Uint8Array(46 + filenameBytes.length);
    centralHeader.set(le32(0x02014b50), 0);
    centralHeader.set(le16(20), 4);
    centralHeader.set(le16(20), 6);
    centralHeader.set(le16(0), 8);
    centralHeader.set(le16(0), 10);
    centralHeader.set(le16(dosTime), 12);
    centralHeader.set(le16(dosDate), 14);
    centralHeader.set(le32(checksum), 16);
    centralHeader.set(le32(data.length), 20);
    centralHeader.set(le32(data.length), 24);
    centralHeader.set(le16(filenameBytes.length), 28);
    centralHeader.set(le16(0), 30);
    centralHeader.set(le16(0), 32);
    centralHeader.set(le16(0), 34);
    centralHeader.set(le16(0), 36);
    centralHeader.set(le32(0), 38);
    centralHeader.set(le32(offset), 42);
    centralHeader.set(filenameBytes, 46);

    centralChunks.push(centralHeader);
    offset += localHeader.length + data.length;
  }

  const centralSize = centralChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const endRecord = new Uint8Array(22);
  endRecord.set(le32(0x06054b50), 0);
  endRecord.set(le16(0), 4);
  endRecord.set(le16(0), 6);
  endRecord.set(le16(entries.length), 8);
  endRecord.set(le16(entries.length), 10);
  endRecord.set(le32(centralSize), 12);
  endRecord.set(le32(offset), 16);
  endRecord.set(le16(0), 20);

  const parts = [...localChunks, ...centralChunks, endRecord].map((chunk) => Uint8Array.from(chunk).buffer);
  return new Blob(parts, { type: "application/zip" });
}
