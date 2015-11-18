/// <reference path="../vendor/node.d.ts" />

import {Http2ErrorType, Http2Error} from "./error";
import {HeaderField} from "./frame";

/**
 * Represents a decoded integer.
 */
interface DecodedInteger {
    /**
     * The decoded integer.
     */
    num: number;
    /**
     * The new index within the buffer (located immediately after the encoded
     * integer).
     */
    index: number;
}

/**
 * Represents a decoded string.
 */
interface DecodedString {
    /**
     * The decoded string.
     */
    str: string;
    /**
     * The new index within the buffer (located immediately after the encoded
     * string).
     */
    index: number;
}

/**
 * Represents a decoded header field.
 */
interface DecodedHeaderField {
    /**
     * The decoded header field.
     */
    field: HeaderField;
    /**
     * The new index within the buffer (located immediately after the encoded
     * header field).
     */
    index: number;
}

/**
 * Return type for encode methods.
 */
interface EncodedValue {
    /**
     * The new index within the buffer (located immediately after the encoded
     * value).
     */
    index: number;
    /**
     * The specified buffer (or a newly allocated one if there wasn't enough
     * room).
     */
    buffer: Buffer;
}

/**
 * Decompresses header blocks encoded using the HPACK compression algorithm and
 * stores the current compression state for a connection.
 */
export class Compression {
    /**
     * The HPACK static table.
     */
    private static StaticTable: HeaderField[] = [
        {
            name: ":authority",
            value: ""
        },
        {
            name: ":method",
            value: "GET"
        },
        {
            name: ":method",
            value: "POST"
        },
        {
            name: ":path",
            value: "/"
        },
        {
            name: ":path",
            value: "/index.html"
        },
        {
            name: ":scheme",
            value: "http"
        },
        {
            name: ":scheme",
            value: "https"
        },
        {
            name: ":status",
            value: "200"
        },
        {
            name: ":status",
            value: "204"
        },
        {
            name: ":status",
            value: "206"
        },
        {
            name: ":status",
            value: "304"
        },
        {
            name: ":status",
            value: "400"
        },
        {
            name: ":status",
            value: "404"
        },
        {
            name: ":status",
            value: "500"
        },
        {
            name: "accept-charset",
            value: ""
        },
        {
            name: "accept-encoding",
            value: "gzip, deflate"
        },
        {
            name: "accept-language",
            value: ""
        },
        {
            name: "accept-ranges",
            value: ""
        },
        {
            name: "accept",
            value: ""
        },
        {
            name: "access-control-allow-origin",
            value: ""
        },
        {
            name: "age",
            value: ""
        },
        {
            name: "allow",
            value: ""
        },
        {
            name: "authorization",
            value: ""
        },
        {
            name: "cache-control",
            value: ""
        },
        {
            name: "content-disposition",
            value: ""
        },
        {
            name: "content-encoding",
            value: ""
        },
        {
            name: "content-language",
            value: ""
        },
        {
            name: "content-length",
            value: ""
        },
        {
            name: "content-location",
            value: ""
        },
        {
            name: "content-range",
            value: ""
        },
        {
            name: "content-type",
            value: ""
        },
        {
            name: "cookie",
            value: ""
        },
        {
            name: "date",
            value: ""
        },
        {
            name: "etag",
            value: ""
        },
        {
            name: "expect",
            value: ""
        },
        {
            name: "expires",
            value: ""
        },
        {
            name: "from",
            value: ""
        },
        {
            name: "host",
            value: ""
        },
        {
            name: "if-match",
            value: ""
        },
        {
            name: "if-modified-since",
            value: ""
        },
        {
            name: "if-none-match",
            value: ""
        },
        {
            name: "if-range",
            value: ""
        },
        {
            name: "if-unmodified-since",
            value: ""
        },
        {
            name: "last-modified",
            value: ""
        },
        {
            name: "link",
            value: ""
        },
        {
            name: "location",
            value: ""
        },
        {
            name: "max-forwards",
            value: ""
        },
        {
            name: "proxy-authenticate",
            value: ""
        },
        {
            name: "proxy-authorization",
            value: ""
        },
        {
            name: "range",
            value: ""
        },
        {
            name: "referer",
            value: ""
        },
        {
            name: "refresh",
            value: ""
        },
        {
            name: "retry-after",
            value: ""
        },
        {
            name: "server",
            value: ""
        },
        {
            name: "set-cookie",
            value: ""
        },
        {
            name: "strict-transport-security",
            value: ""
        },
        {
            name: "transfer-encoding",
            value: ""
        },
        {
            name: "user-agent",
            value: ""
        },
        {
            name: "vary",
            value: ""
        },
        {
            name: "via",
            value: ""
        },
        {
            name: "www-authenticate",
            value: ""
        }
    ];

    /**
     * The HPACK Huffman decoding table.
     **/
    private static HuffmanDecodingTable: Object = {
        "1111111111000": "\u0000",
        "11111111111111111011000": "\u0001",
        "1111111111111111111111100010": "\u0002",
        "1111111111111111111111100011": "\u0003",
        "1111111111111111111111100100": "\u0004",
        "1111111111111111111111100101": "\u0005",
        "1111111111111111111111100110": "\u0006",
        "1111111111111111111111100111": "\u0007",
        "1111111111111111111111101000": "\u0008",
        "111111111111111111101010": "\u0009",
        "111111111111111111111111111100": "\u000a",
        "1111111111111111111111101001": "\u000b",
        "1111111111111111111111101010": "\u000c",
        "111111111111111111111111111101": "\u000d",
        "1111111111111111111111101011": "\u000e",
        "1111111111111111111111101100": "\u000f",
        "1111111111111111111111101101": "\u0010",
        "1111111111111111111111101110": "\u0011",
        "1111111111111111111111101111": "\u0012",
        "1111111111111111111111110000": "\u0013",
        "1111111111111111111111110001": "\u0014",
        "1111111111111111111111110010": "\u0015",
        "111111111111111111111111111110": "\u0016",
        "1111111111111111111111110011": "\u0017",
        "1111111111111111111111110100": "\u0018",
        "1111111111111111111111110101": "\u0019",
        "1111111111111111111111110110": "\u001a",
        "1111111111111111111111110111": "\u001b",
        "1111111111111111111111111000": "\u001c",
        "1111111111111111111111111001": "\u001d",
        "1111111111111111111111111010": "\u001e",
        "1111111111111111111111111011": "\u001f",
        "010100": " ",
        "1111111000": "!",
        "1111111001": "\"",
        "111111111010": "#",
        "1111111111001": "$",
        "010101": "%",
        "11111000": "&",
        "11111111010": "'",
        "1111111010": "(",
        "1111111011": ")",
        "11111001": "*",
        "11111111011": "+",
        "11111010": ",",
        "010110": "-",
        "010111": ".",
        "011000": "/",
        "00000": "0",
        "00001": "1",
        "00010": "2",
        "011001": "3",
        "011010": "4",
        "011011": "5",
        "011100": "6",
        "011101": "7",
        "011110": "8",
        "011111": "9",
        "1011100": ":",
        "11111011": ";",
        "111111111111100": "<",
        "100000": "=",
        "111111111011": ">",
        "1111111100": "?",
        "1111111111010": "@",
        "100001": "A",
        "1011101": "B",
        "1011110": "C",
        "1011111": "D",
        "1100000": "E",
        "1100001": "F",
        "1100010": "G",
        "1100011": "H",
        "1100100": "I",
        "1100101": "J",
        "1100110": "K",
        "1100111": "L",
        "1101000": "M",
        "1101001": "N",
        "1101010": "O",
        "1101011": "P",
        "1101100": "Q",
        "1101101": "R",
        "1101110": "S",
        "1101111": "T",
        "1110000": "U",
        "1110001": "V",
        "1110010": "W",
        "11111100": "X",
        "1110011": "Y",
        "11111101": "Z",
        "1111111111011": "[",
        "1111111111111110000": "\\",
        "1111111111100": "]",
        "11111111111100": "^",
        "100010": "_",
        "11111111|1111101": "`",
        "00011": "a",
        "100011": "b",
        "00100": "c",
        "100100": "d",
        "00101": "e",
        "100101": "f",
        "100110": "g",
        "100111": "h",
        "00110": "i",
        "1110100": "j",
        "1110101": "k",
        "101000": "l",
        "101001": "m",
        "101010": "n",
        "00111": "o",
        "101011": "p",
        "1110110": "q",
        "101100": "r",
        "01000": "s",
        "01001": "t",
        "101101": "u",
        "1110111": "v",
        "1111000": "w",
        "1111001": "x",
        "1111010": "y",
        "1111011": "z",
        "111111111111110": "{",
        "11111111100": "|",
        "11111111111101": "}",
        "1111111111101": "~",
        "1111111111111111111111111100": "\u007f",
        "11111111111111100110": "\u0080",
        "1111111111111111010010": "\u0081",
        "11111111111111100111": "\u0082",
        "11111111111111101000": "\u0083",
        "1111111111111111010011": "\u0084",
        "1111111111111111010100": "\u0085",
        "1111111111111111010101": "\u0086",
        "11111111111111111011001": "\u0087",
        "1111111111111111010110": "\u0088",
        "11111111111111111011010": "\u0089",
        "11111111111111111011011": "\u008a",
        "11111111111111111011100": "\u008b",
        "11111111111111111011101": "\u008c",
        "11111111111111111011110": "\u008d",
        "111111111111111111101011": "\u008e",
        "11111111111111111011111": "\u008f",
        "111111111111111111101100": "\u0090",
        "111111111111111111101101": "\u0091",
        "1111111111111111010111": "\u0092",
        "11111111111111111100000": "\u0093",
        "111111111111111111101110": "\u0094",
        "11111111111111111100001": "\u0095",
        "11111111111111111100010": "\u0096",
        "11111111111111111100011": "\u0097",
        "11111111111111111100100": "\u0098",
        "111111111111111011100": "\u0099",
        "1111111111111111011000": "\u009a",
        "11111111111111111100101": "\u009b",
        "1111111111111111011001": "\u009c",
        "11111111111111111100110": "\u009d",
        "11111111111111111100111": "\u009e",
        "111111111111111111101111": "\u009f",
        "1111111111111111011010": "\u00a0",
        "111111111111111011101": "\u00a1",
        "11111111111111101001": "\u00a2",
        "1111111111111111011011": "\u00a3",
        "1111111111111111011100": "\u00a4",
        "11111111111111111101000": "\u00a5",
        "11111111111111111101001": "\u00a6",
        "111111111111111011110": "\u00a7",
        "11111111111111111101010": "\u00a8",
        "1111111111111111011101": "\u00a9",
        "1111111111111111011110": "\u00aa",
        "111111111111111111110000": "\u00ab",
        "111111111111111011111": "\u00ac",
        "1111111111111111011111": "\u00ad",
        "11111111111111111101011": "\u00ae",
        "11111111111111111101100": "\u00af",
        "111111111111111100000": "\u00b0",
        "111111111111111100001": "\u00b1",
        "1111111111111111100000": "\u00b2",
        "111111111111111100010": "\u00b3",
        "11111111111111111101101": "\u00b4",
        "1111111111111111100001": "\u00b5",
        "11111111111111111101110": "\u00b6",
        "11111111111111111101111": "\u00b7",
        "11111111111111101010": "\u00b8",
        "1111111111111111100010": "\u00b9",
        "1111111111111111100011": "\u00ba",
        "1111111111111111100100": "\u00bb",
        "11111111111111111110000": "\u00bc",
        "1111111111111111100101": "\u00bd",
        "1111111111111111100110": "\u00be",
        "11111111111111111110001": "\u00bf",
        "11111111111111111111100000": "\u00c0",
        "11111111111111111111100001": "\u00c1",
        "11111111111111101011": "\u00c2",
        "1111111111111110001": "\u00c3",
        "1111111111111111100111": "\u00c4",
        "11111111111111111110010": "\u00c5",
        "1111111111111111101000 ": "\u00c6",
        "1111111111111111111101100": "\u00c7",
        "11111111111111111111100010": "\u00c8",
        "11111111111111111111100011": "\u00c9",
        "11111111111111111111100100": "\u00ca",
        "111111111111111111111011110": "\u00cb",
        "111111111111111111111011111": "\u00cc",
        "11111111111111111111100101": "\u00cd",
        "111111111111111111110001": "\u00ce",
        "1111111111111111111101101": "\u00cf",
        "1111111111111110010": "\u00d0",
        "111111111111111100011": "\u00d1",
        "11111111111111111111100110": "\u00d2",
        "111111111111111111111100000": "\u00d3",
        "111111111111111111111100001": "\u00d4",
        "11111111111111111111100111": "\u00d5",
        "111111111111111111111100010": "\u00d6",
        "111111111111111111110010": "\u00d7",
        "111111111111111100100": "\u00d8",
        "111111111111111100101": "\u00d9",
        "11111111111111111111101000": "\u00da",
        "11111111111111111111101001": "\u00db",
        "1111111111111111111111111101": "\u00dc",
        "111111111111111111111100011": "\u00dd",
        "111111111111111111111100100": "\u00de",
        "111111111111111111111100101": "\u00df",
        "11111111111111101100": "\u00e0",
        "111111111111111111110011": "\u00e1",
        "11111111111111101101": "\u00e2",
        "111111111111111100110": "\u00e3",
        "1111111111111111101001": "\u00e4",
        "111111111111111100111": "\u00e5",
        "111111111111111101000": "\u00e6",
        "11111111111111111110011": "\u00e7",
        "1111111111111111101010": "\u00e8",
        "1111111111111111101011": "\u00e9",
        "1111111111111111111101110": "\u00ea",
        "1111111111111111111101111 ": "\u00eb",
        "111111111111111111110100": "\u00ec",
        "111111111111111111110101": "\u00ed",
        "11111111111111111111101010": "\u00ee",
        "11111111111111111110100": "\u00ef",
        "11111111111111111111101011": "\u00f0",
        "111111111111111111111100110": "\u00f1",
        "11111111111111111111101100": "\u00f2",
        "11111111111111111111101101": "\u00f3",
        "111111111111111111111100111": "\u00f4",
        "111111111111111111111101000": "\u00f5",
        "111111111111111111111101001": "\u00f6",
        "111111111111111111111101010": "\u00f7",
        "111111111111111111111101011": "\u00f8",
        "1111111111111111111111111110": "\u00f9",
        "111111111111111111111101100": "\u00fa",
        "111111111111111111111101101": "\u00fb",
        "111111111111111111111101110": "\u00fc",
        "111111111111111111111101111": "\u00fd",
        "111111111111111111111110000": "\u00fe",
        "11111111111111111111101110": "\u00ff",
    };

    /**
     * The HPACK Huffman decoding table. Calculated from the encoding table at
     * runtime.
     */
    private static HuffmanEncodingTable: Object = {};

    /**
     * The default size, in bytes, of the buffer containing the encoded header.
     * This is not a maximum; a new buffer with a larger size will be
     * allocated if necessary during the encoding process.
     */
    private static DefaultHeaderSize: number = 1024;

    /**
     * The HPACK dynamic table.
     */
    private _dynamicTable: HeaderField[];

    /**
     * The limit on the maximum dynamic table size (as determined by HTTP/2
     * SETTINGS frames).
     */
    private _maxDynamicTableSizeLimit: number;

    /**
     * The maximum dynamic table size (as determined by dynamic table size
     * updates in the compressed header blocks).
     */
    private _maxDynamicTableSize: number;

    /**
     * The table of headers that should never be indexed.
     */
    private _neverIndexTable: HeaderField[];

    /**
     * Initializes a new instance of the Compression class.
     *
     * @param maxDynamicTableSizeLimit The limit of the maximum size, in bytes,
     *                                 of the dynamic table.
     */
    constructor(maxDynamicTableSizeLimit: number) {
        this._dynamicTable = [];
        this._maxDynamicTableSize = maxDynamicTableSizeLimit;
        this._maxDynamicTableSizeLimit = maxDynamicTableSizeLimit;
        this._neverIndexTable = [];

        // Generate Huffman encoding table from decoding table
        for (let bitString in Compression.HuffmanDecodingTable) {
            if (Compression.HuffmanDecodingTable.hasOwnProperty(bitString)) {
                let char: string = Compression.HuffmanDecodingTable[bitString];
                Compression.HuffmanEncodingTable[char] = bitString;
            }
        }
    }

    /**
     * Writes the specified number as an unsigned integer to the specified
     * buffer in big-endian format at the specified offset using the specified
     * number of bytes (precision).
     *
     * If the buffer is not large enough to fit the number, a new buffer is
     * allocated and returned.
     *
     * @param buffer The specified buffer.
     * @param num    The specified number to write.
     * @param start  The specified offset at which to start writing.
     * @param length The number of bytes to write.
     *
     * @returns {Buffer} The buffer passed in (or a newly allocated one if that
     *                   buffer was not large enough.
     */
    private static bufferWriteUIntBE(buffer: Buffer, num: number,
                                     start: number, length: number): Buffer {
        if (buffer.length < start + length) {
            // Allocate new buffer, then write data
            let newBuffer: Buffer = new Buffer(buffer.length +
                Compression.DefaultHeaderSize);
            buffer.copy(newBuffer, 0, 0, buffer.length);
            newBuffer.writeUIntBE(num, start, length);
            return newBuffer;
        } else {
            // Just write data
            buffer.writeUIntBE(num, start, length);
            return buffer;
        }
    }

    /**
     * Copies the specified number bytes from the specified source offset from a
     * source buffer to a target buffer at the specified target offset.
     *
     * If the target buffer is not large enough to fit the data, a new buffer is
     * allocated and returned.
     *
     * @param sourceBuffer The specified source buffer.
     * @param targetBuffer The specified target buffer.
     * @param targetOffset The specified target buffer index.
     * @param sourceIndex  The specified source buffer index.
     * @param sourceLength The specified source length in bytes.
     * @returns {Buffer} The target buffer passed in (or a newly allocated one
     *                   if that buffer was not large enough.
     */
    private static bufferCopy(sourceBuffer: Buffer, targetBuffer: Buffer,
                              targetOffset: number, sourceIndex: number,
                              sourceLength: number): Buffer {
        if (targetBuffer.length < targetOffset + sourceLength) {
            // Allocate new buffer, then write data
            let newBuffer: Buffer = new Buffer(targetBuffer.length +
                Compression.DefaultHeaderSize);
            targetBuffer.copy(newBuffer, 0, 0, targetBuffer.length);
            sourceBuffer.copy(newBuffer, targetOffset, sourceIndex,
                sourceLength);
            return newBuffer;
        } else {
            // Just write data
            sourceBuffer.copy(targetBuffer, targetOffset, sourceIndex,
                sourceLength);
            return targetBuffer;
        }
    }

    /**
     * Gets the size of the dynamic table in bytes.
     *
     * @returns {number} The size of the dynamic table in bytes.
     */
    private getSizeOfDynamicTable(): number {
        let length: number = 0;
        for (let item of this._dynamicTable) {
            length += Buffer.byteLength(item.name);
            length += Buffer.byteLength(item.value);
            // Required by the HTTP/2 specification (estimate for overhead)
            length += 32;
        }
        return length;
    }

    /**
     * Re-sizes the dynamic table to conform to the maximum table size by
     * removing older entries.
     */
    private resizeDynamicTable(): void {
        // Ensure that maximum size does not exceed limit
        if (this._maxDynamicTableSize > this._maxDynamicTableSizeLimit) {
            this._maxDynamicTableSize = this._maxDynamicTableSizeLimit;
        }

        // Ensure that table size does not exceed maximum size
        let size = this.getSizeOfDynamicTable();
        while (size > this._maxDynamicTableSize) {
            this._dynamicTable.pop();
            size -= 1;
        }
    }

    /**
     * Adds the specified header field to the dynamic table.
     *
     * @param field The header field.
     */
    private addHeaderFieldToDynamicTable(field: HeaderField): void {
        // Header fields are added to the beginning of the table
        this._dynamicTable.splice(0, 0, field);
        this.resizeDynamicTable();
    }

    /**
     * Gets the header field at the specified table index. Throws an exception
     * if no field is located at that index.
     *
     * @param index The specified table index.
     *
     * @returns {HeaderField} The field at the specified index.
     */
    private getHeaderFieldForIndex(index: number): HeaderField {
        // Static table and dynamic table are technically the same table
        if (index >= 1 && index <= Compression.StaticTable.length) {
            index = index - 1;
            return Compression.StaticTable[index];
        } else if (index >= Compression.StaticTable.length + 1 &&
            index <= Compression.StaticTable.length +
            this._dynamicTable.length) {
            index = index - Compression.StaticTable.length - 1;
            return this._dynamicTable[index];
        } else {
            throw new Http2Error("Invalid compression index",
                Http2ErrorType.CompressionError)
        }
    }

    /**
     * Gets the index at which the specified header field is located.
     *
     * @param field The specified header field.
     *
     * @returns {number} The index at which the specified header field is
     *                   located, or null if no matching header field is found.
     */
    private getIndexForHeaderField(field: HeaderField): number {
        for (let i: number = 0; i < Compression.StaticTable.length; i++) {
            // Check static table; skip value if necessary (it will have to
            // be represented as a literal later on)
            if (field.name === Compression.StaticTable[i].name &&
                (field.value === Compression.StaticTable[i].value ||
                Compression.StaticTable[i].value === "")) {
                return i + 1;
            }
        }
        for (let i: number = 0; i < this._dynamicTable.length; i++) {
            // Check dynamic table
            if (field.name === this._dynamicTable[i].name &&
                field.value === this._dynamicTable[i].value) {
                return i + 1 + Compression.StaticTable.length;
            }
        }
        return null;
    }

    /**
     * Decodes the bytes at the specified offset of the specified buffer as an
     * HPACK-encoded integer.
     *
     * @param block        The specified buffer
     * @param blockIndex   The specified offset.
     * @param prefixLength The size of the HPACK integer encoding prefix.
     *
     * @returns {DecodedInteger} The decoded integer.
     */
    private static decodeInteger(block: Buffer, blockIndex: number,
                                 prefixLength: number): DecodedInteger {
        let prefixByte: number = block.readUIntBE(blockIndex, 1);
        let prefixMask: number = 0;
        for (let i: number = 0; i < prefixLength; i++) {
            prefixMask += 1 << i;
        }

        let num: number = prefixByte & prefixMask;
        blockIndex += 1;

        // Based on pseudo-code from HPACK specification
        if (num < Math.pow(2, prefixLength) - 1) {
            return <DecodedInteger>{
                num: num,
                index: blockIndex
            };
        } else {
            let byte: number;
            let byteIndex: number = 0;
            do {
                byte = block.readUIntBE(blockIndex, 1) & 0x7f;
                num += byte << byteIndex;

                byteIndex += 7;
                blockIndex += 1;
            } while (byte & 0x80);

            return <DecodedInteger>{
                num: num,
                index: blockIndex
            }
        }
    }

    /**
     * Encodes the specified integer as an HPACK integer at the specified offset
     * within the specified buffer and with the specified prefix.
     *
     * @param block        The specified buffer.
     * @param blockIndex   The specified buffer offset.
     * @param integerValue The specified integer.
     * @param prefixLength The length of the prefix.
     * @param prefixValue  The value of the prefix. This value should be
     *                     relative to the end of the byte, not the prefix
     *                     length.
     *
     * @returns {EncodedValue} Data related to the encoded integer.
     */
    private static encodeInteger(block: Buffer, blockIndex: number,
                                 integerValue: number, prefixLength: number,
                                 prefixValue: number): EncodedValue {
        if (integerValue < Math.pow(2, prefixLength) - 1) {
            let prefixByte: number = prefixValue;
            prefixByte += integerValue;
            block = Compression.bufferWriteUIntBE(block, prefixByte,
                blockIndex, 1);
        } else {
            let prefixByte: number = prefixValue;
            prefixByte += Math.pow(2, prefixLength) - 1;
            block = Compression.bufferWriteUIntBE(block, prefixByte,
                blockIndex, 1);
            blockIndex += 1;

            integerValue -= Math.pow(2, prefixLength) - 1;
            while (integerValue >= 128) {
                block = Compression.bufferWriteUIntBE(block,
                    integerValue % 128 + 128, blockIndex, 1);
                blockIndex += 1;
                integerValue = integerValue / 128;
            }
            block = Compression.bufferWriteUIntBE(block, integerValue,
                blockIndex, 1);
        }
        return <EncodedValue>{
            index: blockIndex + 1,
            buffer: block
        };
    }

    /**
     * Decodes the bytes at the specified offset of the specified buffer as an
     * HPACK-encoded string.
     *
     * @param block      The specified buffer
     * @param blockIndex The specified offset.
     *
     * @returns {DecodedString} The decoded string.
     */
    private static decodeString(block: Buffer,
                                blockIndex: number): DecodedString {
        let initialByte: number = block.readUIntBE(blockIndex, 1);

        let huffman: boolean = Boolean(initialByte & 0x80);

        let decodedInteger = Compression.decodeInteger(block, blockIndex, 7);
        let strLength: number = decodedInteger.num;
        blockIndex = decodedInteger.index;

        let str: string = "";
        if (huffman) {
            let huffByteStream: string = "";
            for (let i: number = 0; i < strLength; i++) {
                let huffByte = block.readUIntBE(blockIndex + i, 1).toString(2);
                while (huffByte.length < 8) {
                    huffByte = "0" + huffByte;
                }
                huffByteStream += huffByte;
            }

            let huffStrBytes: number[] = [];
            let huffByteStreamIndex: number = 0;
            while (huffByteStreamIndex < strLength * 8) {
                let huffChar: string = huffByteStream.substr(
                    huffByteStreamIndex, 5);
                huffByteStreamIndex += 5;

                while (Compression.HuffmanDecodingTable[huffChar] ===
                undefined && huffByteStreamIndex < strLength * 8) {
                    huffChar += huffByteStream[huffByteStreamIndex];
                    huffByteStreamIndex++;
                }

                let decodedHuffChar: string =
                    Compression.HuffmanDecodingTable[huffChar];
                if (decodedHuffChar === undefined) {
                    if (huffChar.length > 7) {
                        throw new Http2Error("Padding too long",
                            Http2ErrorType.CompressionError);
                    } else if (huffChar.replace(/1/g, "") !== "") {
                        throw new Http2Error("Padding incorrect",
                            Http2ErrorType.CompressionError);
                    }
                } else {
                    huffStrBytes.push(decodedHuffChar.charCodeAt(0));
                }
            }

            str = new Buffer(huffStrBytes).toString();
        } else {
            let strBuffer = new Buffer(strLength);
            block.copy(strBuffer, 0, blockIndex, blockIndex + strLength);
            // It's not clear what HTTP/2 header fields should be encoded as;
            // research suggests that only 7-bit ASCII is universally safe
            str = strBuffer.toString("ascii");
        }
        blockIndex += strLength;

        return <DecodedString>{
            str: str,
            index: blockIndex
        }
    }

    /**
     * Encodes the specified string as an HPACK string at the specified offset
     * within the specified buffer.
     *
     * @param block      The specified buffer.
     * @param blockIndex The specified buffer offset.
     * @param str        The specified string.
     * @param huffman    Whether the string should be encoded using Huffman
     *                   encoding. Default is true.
     *
     * @returns {EncodedValue} Data related to the encoded string.
     */
    private static encodeString(block: Buffer, blockIndex: number, str: string,
                                huffman: boolean = true): EncodedValue {
        let buffer: Buffer;
        if (huffman) {
            let huffByteStream: string = "";
            for (let i: number = 0; i < str.length; i++) {
                if (str.charCodeAt(i) < 0x20 || str.charCodeAt(i) > 0x7e) {
                    // This implementation only allows printable ASCII
                    // characters in header fields
                    throw new Http2Error("Header field contains non-ASCII or" +
                        " non-printable character",
                        Http2ErrorType.CompressionError);
                }
                huffByteStream +=
                    Compression.HuffmanEncodingTable[str.charAt(i)];
            }

            while (huffByteStream.length % 8 !== 0) {
                huffByteStream += "1";
            }

            let encodedInteger: EncodedValue = Compression.encodeInteger(block,
                blockIndex, huffByteStream.length / 8, 7, 0x80);
            blockIndex = encodedInteger.index;
            block = encodedInteger.buffer;

            for (let i = 0; i < huffByteStream.length; i += 8) {
                let charCode: number = parseInt(huffByteStream.substr(i, 8), 2);
                block = Compression.bufferWriteUIntBE(block, charCode,
                    blockIndex, 1);
                blockIndex += 1;
            }

            return <EncodedValue>{
                index: blockIndex,
                buffer: block
            };
        } else {
            buffer = new Buffer(str);

            let encodedInteger: EncodedValue = Compression.encodeInteger(block,
                blockIndex, buffer.length, 7, 0x00);
            blockIndex = encodedInteger.index;
            block = encodedInteger.buffer;

            block = Compression.bufferCopy(buffer, block, blockIndex, 0,
                buffer.length);

            return <EncodedValue>{
                index: blockIndex + buffer.length,
                buffer: block
            };
        }
    }

    /**
     * Decodes the bytes at the specified offset of the specified buffer as an
     * HPACK-encoded header field.
     *
     * @param block      The specified buffer.
     * @param blockIndex The specified buffer offset.
     * @param isIndex    Whether the name bytes are encoded as an literal or a
     *                   index.
     *
     * @returns {DecodedHeaderField} The decoded header field.
     */
    private decodeHeaderField(block: Buffer, blockIndex: number,
                              isIndex: boolean): DecodedHeaderField {
        let name: string;
        if (isIndex) {
            // New name
            blockIndex += 1;
            let decodedString: DecodedString =
                Compression.decodeString(block, blockIndex);
            name = decodedString.str;
            blockIndex = decodedString.index;
        } else {
            // Indexed name
            let decodedInteger: DecodedInteger =
                Compression.decodeInteger(block, blockIndex, 6);
            name = this.getHeaderFieldForIndex(decodedInteger.num).name;
            blockIndex = decodedInteger.index;
        }

        let decodedString: DecodedString =
            Compression.decodeString(block, blockIndex);
        let value: string = decodedString.str;
        blockIndex = decodedString.index;

        let headerField = <HeaderField>{
            name: name,
            value: value
        };

        return <DecodedHeaderField>{
            field: headerField,
            index: blockIndex
        }
    }

    /**
     * Decodes the specified header block into a series of header fields.
     *
     * @param block The header block to decode.
     *
     * @returns {HeaderField[]} The header fields contained by the header block.
     */
    decodeHeaderBlock(block: Buffer): HeaderField[] {
        let blockIndex = 0;
        let fields: HeaderField[] = [];
        while (blockIndex < block.length) {
            let firstByte = block.readUIntBE(blockIndex, 1);
            if (firstByte & 0x80) {
                // Indexed header field
                let decodedInteger: DecodedInteger =
                    Compression.decodeInteger(block, blockIndex, 7);
                fields.push(this.getHeaderFieldForIndex(decodedInteger.num));
                blockIndex = decodedInteger.index;
            } else if (firstByte & 0x40) {
                // Literal header field with incremental indexing
                let newName: boolean = (firstByte & 0x3f) === 0;
                let decodedField: DecodedHeaderField =
                    this.decodeHeaderField(block, blockIndex, newName);
                fields.push(decodedField.field);
                blockIndex = decodedField.index;
                this.addHeaderFieldToDynamicTable(decodedField.field);
            } else if (firstByte & 0x20) {
                // Dynamic header table update
                let decodedInteger: DecodedInteger =
                    Compression.decodeInteger(block, blockIndex, 5);
                if (decodedInteger.num > this._maxDynamicTableSizeLimit) {
                    throw new Http2Error("Dynamic table size update value" +
                        " exceeds SETTINGS frame limit",
                        Http2ErrorType.CompressionError)
                }
                this._maxDynamicTableSize = decodedInteger.num;
                this.resizeDynamicTable();
                blockIndex = decodedInteger.index;
            } else {
                // Literal header field with no indexing or never index
                let newName: boolean = (firstByte & 0x0f) === 0;
                let decodedField: DecodedHeaderField =
                    this.decodeHeaderField(block, blockIndex, newName);
                fields.push(decodedField.field);
                blockIndex = decodedField.index;
                if (firstByte & 0x10) {
                    // Never index
                    this._neverIndexTable.push(decodedField.field);
                }
            }
        }
        return fields;
    }

    /**
     * Encodes the specified header fields into a header block.
     *
     * @param fields The header fields to encode.
     *
     * @returns {Buffer} The header block containing the header fields.
     */
    encodeHeaderBlock(fields: HeaderField[]): Buffer {
        let block: Buffer = new Buffer(Compression.DefaultHeaderSize);
        let blockIndex: number = 0;
        for (let field of fields) {
            let tableIndex: number = this.getIndexForHeaderField(field);
            let tableIndexHeader: HeaderField;

            if (tableIndex !== null) {
                tableIndexHeader = this.getHeaderFieldForIndex(tableIndex);
                for (let neverIndexField of this._neverIndexTable) {
                    if (neverIndexField.name === tableIndexHeader.name &&
                        neverIndexField.value === tableIndexHeader.value) {
                        tableIndexHeader = null;
                        break;
                    }
                }
            }

            if (tableIndex !== null && tableIndexHeader !== null) {
                if (tableIndexHeader.value !== "") {
                    // Indexed header field
                    let encodedInteger: EncodedValue =
                        Compression.encodeInteger(block, blockIndex,
                            tableIndex, 7, 0x80);
                    blockIndex = encodedInteger.index;
                    block = encodedInteger.buffer;
                } else {
                    // Literal header field with indexed name
                    let encodedInteger: EncodedValue =
                        Compression.encodeInteger(block, blockIndex,
                            tableIndex, 6, 0x40);
                    blockIndex = encodedInteger.index;
                    block = encodedInteger.buffer;
                    let encodedString: EncodedValue =
                        Compression.encodeString(block, blockIndex,
                            field.value);
                    blockIndex = encodedString.index;
                    block = encodedString.buffer;
                }
            } else {
                // Literal header field with new name
                let encodedInteger: EncodedValue =
                    Compression.encodeInteger(block, blockIndex, 0, 6, 0x40);
                blockIndex = encodedInteger.index;
                block = encodedInteger.buffer;
                let encodedString: EncodedValue =
                    Compression.encodeString(block, blockIndex,
                        field.name);
                blockIndex = encodedString.index;
                block = encodedString.buffer;
                encodedString = Compression.encodeString(block, blockIndex,
                    field.value);
                blockIndex = encodedString.index;
                block = encodedString.buffer;
            }
        }

        let returnBlock: Buffer = new Buffer(blockIndex);
        block.copy(returnBlock, 0, 0, blockIndex);
        return returnBlock;
    }

    set maxDynamicTableSizeLimit(value: number) {
        this._maxDynamicTableSizeLimit = value;
        this.resizeDynamicTable();
    }
}