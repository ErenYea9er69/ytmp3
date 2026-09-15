const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// CRC32 implementation
function makeCRCTable() {
    let c;
    const crcTable = [];
    for (let n = 0; n < 256; n++) {
        c = n;
        for (let k = 0; k < 8; k++) {
            c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
        }
        crcTable[n] = c;
    }
    return crcTable;
}

const crcTable = makeCRCTable();

function crc32(buf) {
    let crc = 0 ^ (-1);
    for (let i = 0; i < buf.length; i++) {
        crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xFF];
    }
    return (crc ^ (-1)) >>> 0;
}

function createChunk(type, data) {
    const len = data.length;
    const buf = Buffer.alloc(len + 12);
    buf.writeUInt32BE(len, 0);
    buf.write(type, 4, 4, 'ascii');
    data.copy(buf, 8);
    const crcVal = crc32(buf.subarray(4, len + 8));
    buf.writeUInt32BE(crcVal, len + 8);
    return buf;
}

function generatePng(size) {
    // 8 bytes PNG signature
    const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

    // IHDR
    const ihdrData = Buffer.alloc(13);
    ihdrData.writeUInt32BE(size, 0);
    ihdrData.writeUInt32BE(size, 4);
    ihdrData.writeUInt8(8, 8); // 8 bit depth
    ihdrData.writeUInt8(6, 9); // RGBA
    ihdrData.writeUInt8(0, 10);
    ihdrData.writeUInt8(0, 11);
    ihdrData.writeUInt8(0, 12);
    const ihdr = createChunk('IHDR', ihdrData);

    // Image data (filter byte 0 + RGBA per pixel)
    const rawData = Buffer.alloc(size * (size * 4 + 1));
    let offset = 0;

    const center = size / 2;
    const radius = size * 0.44;

    for (let y = 0; y < size; y++) {
        rawData.writeUInt8(0, offset++); // filter type 0: None
        for (let x = 0; x < size; x++) {
            const dx = x - center;
            const dy = y - center;
            const dist = Math.sqrt(dx * dx + dy * dy);

            // Rounded background rectangle / circle
            let r = 255, g = 0, b = 51, a = 0; // YouTube Red #FF0033

            // Rounded squircle / pill
            const cornerR = size * 0.22;
            const inBoxX = Math.abs(dx) <= (size * 0.42 - cornerR);
            const inBoxY = Math.abs(dy) <= (size * 0.42 - cornerR);
            const cornerDx = Math.max(0, Math.abs(dx) - (size * 0.42 - cornerR));
            const cornerDy = Math.max(0, Math.abs(dy) - (size * 0.42 - cornerR));
            const cornerDist = Math.sqrt(cornerDx * cornerDx + cornerDy * cornerDy);

            if (inBoxX || inBoxY || cornerDist <= cornerR) {
                // Background gradient: from #FF0033 to #CC0000
                const gradFactor = (y / size);
                r = Math.floor(255 - gradFactor * 40);
                g = 0;
                b = Math.floor(51 - gradFactor * 20);
                a = 255;

                // Anti-aliasing edges
                if (!inBoxX && !inBoxY && cornerDist > cornerR - 1) {
                    a = Math.floor(255 * (cornerR - cornerDist));
                    if (a < 0) a = 0;
                }

                // Draw Music Note / Sound Wave / Play Icon inside
                // Musical note: note head at bottom-left, stem up, flag right
                const nx = (x - size * 0.25) / (size * 0.5); // 0 to 1
                const ny = (y - size * 0.25) / (size * 0.5); // 0 to 1

                // Musical note head (circle at bottom left)
                const head1Dx = nx - 0.32;
                const head1Dy = ny - 0.68;
                const inHead1 = (head1Dx * head1Dx * 1.5 + head1Dy * head1Dy * 2.2) <= 0.025;

                // Second note head (bottom right)
                const head2Dx = nx - 0.72;
                const head2Dy = ny - 0.58;
                const inHead2 = (head2Dx * head2Dx * 1.5 + head2Dy * head2Dy * 2.2) <= 0.025;

                // Left stem
                const inStem1 = (nx >= 0.38 && nx <= 0.47 && ny >= 0.22 && ny <= 0.68);
                // Right stem
                const inStem2 = (nx >= 0.78 && nx <= 0.87 && ny >= 0.12 && ny <= 0.58);
                // Beam connecting top of stems
                const inBeam = (nx >= 0.38 && nx <= 0.87 && ny >= (0.22 - (nx - 0.38) * 0.2) && ny <= (0.34 - (nx - 0.38) * 0.2));

                // Download arrow at bottom right if space permits
                if (inHead1 || inHead2 || inStem1 || inStem2 || inBeam) {
                    r = 255;
                    g = 255;
                    b = 255;
                    a = 255;
                }
            }

            rawData.writeUInt8(r, offset++);
            rawData.writeUInt8(g, offset++);
            rawData.writeUInt8(b, offset++);
            rawData.writeUInt8(a, offset++);
        }
    }

    const compressed = zlib.deflateSync(rawData);
    const idat = createChunk('IDAT', compressed);
    const iend = createChunk('IEND', Buffer.alloc(0));

    return Buffer.concat([sig, ihdr, idat, iend]);
}

const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
}

[16, 48, 128].forEach(size => {
    const pngBuf = generatePng(size);
    fs.writeFileSync(path.join(iconsDir, `icon${size}.png`), pngBuf);
    console.log(`Generated icon${size}.png (${pngBuf.length} bytes)`);
});
