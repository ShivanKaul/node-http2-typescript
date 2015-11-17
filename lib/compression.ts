import {Http2ErrorType, Http2Error} from "./error";
import {HeaderField} from "./frame";

interface DecodedInteger {
    num: number;
    index: number;
}

interface DecodedString {
    str: string;
    index: number;
}

interface DecodedHeaderField {
    field: HeaderField;
    index: number;
}

/**
 * Decompresses header blocks encoded using the HPACK compression algorithm and
 * stores the current compression state for a connection.
 */
export class Compression {
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
    private static HuffmanTable: Object = {
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
        "111111111111111111111111111111": "EOS"
    };
    private static MaxHeaderSize: number = 1024;

    private _dynamicTable: HeaderField[];
    private _maxDynamicTableSize: number;
    private _maxDynamicTableSizeLimit: number;

    constructor(maxDynamicTableSizeLimit: number) {
        this._dynamicTable = [];
        this._maxDynamicTableSize = maxDynamicTableSizeLimit;
        this._maxDynamicTableSizeLimit = maxDynamicTableSizeLimit;
    }

    private static decodeInteger(block: Buffer, blockIndex: number,
                                 prefix: number): DecodedInteger {
        let prefixByte: number = block.readUIntBE(blockIndex, 1);
        let prefixMask: number = 0;
        for (let i: number = 0; i < prefix; i++) {
            prefixMask += 1 << i;
        }

        let num: number = prefixByte & prefixMask;
        blockIndex += 1;

        if (num < Math.pow(2, prefix) - 1) {
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

    private static encodeInteger(block: Buffer, blockIndex: number,
                                 integerValue: number, prefix: number,
                                 prefixValue: number): number {
        if (integerValue < Math.pow(2, prefix) - 1) {
            let prefixByte: number = prefixValue;
            prefixByte += integerValue;
            block.writeUIntBE(prefixByte, blockIndex, 1);
            return blockIndex + 1;
        } else {
            let prefixByte: number = prefixValue;
            prefixByte += Math.pow(2, prefix) - 1;
            block.writeUIntBE(prefixByte, blockIndex, 1);
            blockIndex += 1;

            integerValue -= Math.pow(2, prefix) - 1;
            while (integerValue >= 128) {
                block.writeUIntBE(integerValue % 128 + 128, blockIndex, 1);
                blockIndex += 1;
                integerValue = integerValue / 128;
            }
            block.writeUIntBE(integerValue, blockIndex, 1);
            return blockIndex + 1;
        }
    }

    private static decodeString(block: Buffer,
                                blockIndex: number): DecodedString {
        let initialByte: number = block.readUIntBE(blockIndex, 1);

        let huffman: boolean = Boolean(initialByte & 0x80);

        let lengthObj = Compression.decodeInteger(block, blockIndex, 7);
        let strLength: number = lengthObj.num;
        blockIndex = lengthObj.index;

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

            let huffByteStreamIndex: number = 0;
            while (huffByteStreamIndex < strLength * 8) {
                let huffChar: string = huffByteStream.substr(
                    huffByteStreamIndex, 5);
                huffByteStreamIndex += 5;

                while (Compression.HuffmanTable[huffChar] === undefined &&
                huffByteStreamIndex < strLength * 8) {
                    huffChar += huffByteStream[huffByteStreamIndex];
                    huffByteStreamIndex++;
                }

                let decodedHuffChar: string =
                    Compression.HuffmanTable[huffChar];
                if (decodedHuffChar === undefined) {
                    if (huffChar.length > 7) {
                        throw new Http2Error("Padding too long",
                            Http2ErrorType.CompressionError);
                    } else if (huffChar.replace(/1/g, "") !== "") {
                        throw new Http2Error("Padding incorrect",
                            Http2ErrorType.CompressionError);
                    }
                } else {
                    str += decodedHuffChar;
                }
            }
        } else {
            let strBuffer = new Buffer(strLength);
            block.copy(strBuffer, 0, blockIndex, blockIndex + strLength);
            str = strBuffer.toString();
        }
        blockIndex += strLength;

        return <DecodedString>{
            str: str,
            index: blockIndex
        }
    }

    private static encodeString(block: Buffer, blockIndex: number,
                                str: string): number {
        blockIndex = this.encodeInteger(block, blockIndex,
            Buffer.byteLength(str), 7, 0);

        let buffer: Buffer = new Buffer(str);
        buffer.copy(block, blockIndex, 0, buffer.length);

        return blockIndex + buffer.length;
    }

    private getSizeOfDynamicTable(): number {
        let length: number = 0;
        for (let item of this._dynamicTable) {
            length += Buffer.byteLength(item.name);
            length += Buffer.byteLength(item.value);
            length += 32;
        }
        return length;
    }

    /**
     * Re-sizes the dynamic table to conform to the maximum table size by
     * removing older entries.
     */
    private resizeDynamicTable(): void {
        let size = this.getSizeOfDynamicTable();
        while (size > this._maxDynamicTableSize) {
            this._dynamicTable.pop();
            size -= 1;
        }
    }

    private addHeaderFieldToDynamicTable(field: HeaderField): void {
        this._dynamicTable.splice(0, 0, field);
        this.resizeDynamicTable();
    }

    private getHeaderFieldForIndex(index: number): HeaderField {
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

    private getIndexForHeaderField(field: HeaderField) {
        for (let i: number = 0; i < Compression.StaticTable.length; i++) {
            if (field.name === Compression.StaticTable[i].name &&
                (field.value === Compression.StaticTable[i].value ||
                Compression.StaticTable[i].value === "")) {
                return i + 1;
            }
        }
        for (let i: number = 0; i < this._dynamicTable.length; i++) {
            if (field.name === this._dynamicTable[i].name &&
                field.value === this._dynamicTable[i].value) {
                return i + 1 + Compression.StaticTable.length;
            }
        }
        return null;
    }

    private decodeHeaderField(block: Buffer, blockIndex: number,
                              newName: boolean): DecodedHeaderField {
        let name: string;
        if (newName) {
            // New name
            blockIndex += 1;
            let nameObj: DecodedString =
                Compression.decodeString(block, blockIndex);
            name = nameObj.str;
            blockIndex = nameObj.index;
        } else {
            // Indexed name
            let indexObj: DecodedInteger =
                Compression.decodeInteger(block, blockIndex, 6);
            name = this.getHeaderFieldForIndex(indexObj.num).name;
            blockIndex = indexObj.index;
        }

        let valueObj: DecodedString =
            Compression.decodeString(block, blockIndex);
        let value: string = valueObj.str;
        blockIndex = valueObj.index;

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
                let indexObj: DecodedInteger =
                    Compression.decodeInteger(block, blockIndex, 7);
                fields.push(this.getHeaderFieldForIndex(indexObj.num));
                blockIndex = indexObj.index;
            } else {
                // Literal header field
                if (firstByte & 0x40) {
                    // Incremental indexing
                    let newName: boolean = (firstByte & 0x3f) === 0;
                    let fieldObj: DecodedHeaderField =
                        this.decodeHeaderField(block, blockIndex, newName);
                    fields.push(fieldObj.field);
                    blockIndex = fieldObj.index;
                    this.addHeaderFieldToDynamicTable(fieldObj.field);
                } else {
                    // No indexing or never indexed (irrelevant, as this
                    // implementation does not use outgoing header compression)
                    let newName: boolean = (firstByte & 0x0f) === 0;
                    let fieldObj: DecodedHeaderField =
                        this.decodeHeaderField(block, blockIndex, newName);
                    fields.push(fieldObj.field);
                    blockIndex = fieldObj.index;
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
        let block: Buffer = new Buffer(Compression.MaxHeaderSize);
        let blockIndex: number = 0;
        for (let field of fields) {
            let tableIndex: number = this.getIndexForHeaderField(field);
            if (tableIndex === null) {
                let tableIndexHeader: HeaderField =
                    this.getHeaderFieldForIndex(blockIndex);
                if (tableIndexHeader.value !== "") {
                    // Indexed header field
                    blockIndex = Compression.encodeInteger(block, blockIndex,
                        tableIndex, 7, 0x80);
                } else {
                    // Literal header field with indexed name
                    blockIndex = Compression.encodeInteger(block, blockIndex,
                        tableIndex, 6, 0x40);
                    blockIndex = Compression.encodeString(block, blockIndex,
                        field.value);
                }
            } else {
                // Literal header field with new name
                block.writeUIntBE(0, blockIndex, 1);
                blockIndex += 1;
                blockIndex = Compression.encodeString(block, blockIndex,
                    field.name);
                blockIndex = Compression.encodeString(block, blockIndex,
                    field.value);
            }
        }

        let returnBlock: Buffer = new Buffer(blockIndex);
        block.copy(returnBlock, 0, 0, blockIndex);
        return returnBlock;
    }
}