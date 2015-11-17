/// <reference path="../vendor/node.d.ts" />

import {Http2Error, Http2ErrorType} from "./error";
import {Compression} from "./compression";

export const enum FrameType {
    Data = 0x0,
    Headers = 0x1,
    Priority = 0x2,
    RstStream = 0x3,
    Settings = 0x4,
    PushPromise = 0x5,
    Ping = 0x6,
    GoAway = 0x7,
    WindowUpdate = 0x8,
    Continuation = 0x9
}

export abstract class Frame {
    /**
     * The size of the frame header in octets.
     */
    static HeaderSize = 9;

    protected _length: number;
    protected _type: FrameType;
    protected _flags: number;
    protected _streamId: number;

    constructor(frameData?: Buffer, length?: number, type?: FrameType,
                flags?: number, streamId?: number) {
        if (frameData !== undefined) {
            this._length = frameData.readUIntBE(0, 3);
            this._type = frameData.readUIntBE(3, 1);
            this._flags = frameData.readUIntBE(4, 1);
            this._streamId = frameData.readUIntBE(5, 4);
        } else {
            this._length = length;
            this._type = type;
            this._flags = flags;
            this._streamId = streamId;
        }
    }

    static parse(compression: Compression, frameData: Buffer): Frame {
        let type = frameData.readUIntBE(3, 1);
        if (type === FrameType.Data) {
            return new DataFrame(frameData);
        } else if (type === FrameType.Headers) {
            return new HeadersFrame(compression, frameData);
        } else if (type === FrameType.Settings) {
            return new SettingsFrame(frameData);
        } else if (type === FrameType.GoAway) {
            return new GoAwayFrame(frameData);
        } else {
            return null;
        }

    }

    get type(): FrameType {
        return this._type;
    }

    get flags(): number {
        return this._flags;
    }

    get streamId(): number {
        return this._streamId;
    }

    getBytes(): Buffer {
        let buffer = new Buffer(this._length + Frame.HeaderSize);
        buffer.writeUIntBE(this._length, 0, 3);
        buffer.writeUIntBE(this._type, 3, 1);
        buffer.writeUIntBE(this._flags, 4, 1);
        buffer.writeUIntBE(this._streamId & 0x7ffffff, 5, 4);
        return buffer;
    }
}

export const enum DataFlags {
    EndStream = 0x1,
    Padded = 0x8
}

export class DataFrame extends Frame {
    static FrameType = FrameType.Data;

    private _data: Buffer;

    constructor(frameData?: Buffer, data?: Buffer, streamId?: number,
                endStream?: boolean) {
        if (frameData !== undefined) {
            super(frameData);

            if (this._streamId === 0) {
                throw new Http2Error("Invalid DATA frame stream type",
                    Http2ErrorType.ProtocolError);
            }

            if (this._flags & DataFlags.Padded) {
                let paddingLength: number = frameData.readUIntBE(
                    Frame.HeaderSize, 1);
                if (paddingLength === 0) {
                    // A padding length of 0 corresponds to one octet for some
                    // reason, according to the spec (section 6.1)
                    paddingLength = 1;
                }
                if (paddingLength >= this._length) {
                    throw new Http2Error("Invalid DATA frame padding size",
                        Http2ErrorType.ProtocolError);
                }

                this._data = new Buffer(this._length - paddingLength);
                frameData.copy(this._data, 0, Frame.HeaderSize + 1,
                    this._length + Frame.HeaderSize - paddingLength);
            } else {
                this._data = new Buffer(this._length);
                frameData.copy(this._data, 0, Frame.HeaderSize, this._length +
                    Frame.HeaderSize);
            }
        } else {
            super(undefined, data.length, DataFrame.FrameType,
                endStream ? DataFlags.EndStream : 0, streamId);

            this._data = data;
        }
    }

    get data(): Buffer {
        return this._data;
    }

    getBytes(): Buffer {
        let buffer = super.getBytes();
        this._data.copy(buffer, Frame.HeaderSize, 0, this._data.length);
        return buffer;
    }
}

export const enum HeadersFlags {
    EndStream = 0x1,
    EndHeaders = 0x4,
    Padded = 0x8,
    Priority = 0x20
}

export interface HeaderField {
    name: string;
    value: string;
}

export class HeadersFrame extends Frame {
    static FrameType = FrameType.Headers;

    private _compression: Compression;

    private _dependencyExclusive: boolean;
    private _dependencyStreamId: number;
    private _weight: number;
    private _headerFields: HeaderField[];

    constructor(compression: Compression, frameData?: Buffer,
                headerFields?: HeaderField[], streamId?: number,
                endStream?: boolean, endHeaders?: boolean, priority?: boolean,
                dependencyExclusive?: boolean, dependencyStreamId?: number,
                weight?: number) {
        if (frameData !== undefined) {
            super(frameData);

            this._compression = compression;

            if (this._streamId === 0) {
                throw new Http2Error("Invalid HEADERS frame stream type",
                    Http2ErrorType.ProtocolError);
            }

            let index = Frame.HeaderSize;

            let paddingLength: number = 0;
            if (this._flags & DataFlags.Padded) {
                let paddingLength: number = frameData.readUIntBE(
                    index, 1);
                if (paddingLength >= this._length) {
                    throw new Http2Error("Invalid HEADERS frame padding size",
                        Http2ErrorType.ProtocolError);
                }
                index += 1;
            }

            if (this._flags & HeadersFlags.Priority) {
                this._dependencyStreamId = frameData.readUIntBE(index, 4);
                this._dependencyExclusive =
                    Boolean(this._dependencyStreamId & 0x80000000);
                this._dependencyStreamId =
                    this._dependencyStreamId & 0x7ffffff;
                this._weight = frameData.readUIntBE(index + 4, 1);
                index += 5;
            }

            let block: Buffer;
            if (this._flags & DataFlags.Padded) {
                block = new Buffer(this._length - paddingLength);
                frameData.copy(block, 0, index, index + block.length);
            } else {
                block = new Buffer(this._length);
                frameData.copy(block, 0, index, index + block.length);
                this._headerFields = compression.decodeHeaderBlock(block);
            }
            this._headerFields = compression.decodeHeaderBlock(block);
        } else {
            super(undefined, 0, HeadersFrame.FrameType,
                (endStream ? HeadersFlags.EndStream : 0) |
                (endHeaders ? HeadersFlags.EndHeaders : 0) |
                (priority ? HeadersFlags.Priority : 0), streamId);

            this._compression = compression;

            this._dependencyExclusive = dependencyExclusive;
            this._dependencyStreamId = dependencyStreamId;
            this._weight = weight;
            this._headerFields = headerFields;
        }
    }

    getBytes(): Buffer {
        let block: Buffer = this._compression.encodeHeaderBlock(
            this._headerFields);
        this._length = block.length;

        let buffer: Buffer = super.getBytes();

        let index: number = Frame.HeaderSize;
        if (this._flags & HeadersFlags.Priority) {
            buffer.writeUIntBE(Number(this._dependencyExclusive) << 31 |
                this._dependencyStreamId, index, 4);
            buffer.writeUIntBE(this._weight, index + 4, 1);
            index += 5;
        }

        block.copy(buffer, index, 0, block.length);

        return buffer;
    }

    get headerFields(): HeaderField[] {
        return this._headerFields;
    }
}

export const enum SettingsFlags {
    Ack = 0x1
}

export const enum SettingsParam {
    /**
     * The maximum size of the header compression table used to decode header
     * blocks. The default value is 4096 octets.
     */
    HeaderTableSize = 0x1,
    /**
     * If true, server push is enabled. The default value is true.
     */
    EnablePush = 0x2,
    /**
     * The maximum number of concurrent streams that the client will allow.
     * A value of null indicates that there is no limit. The default value is
     * null.
     */
    MaxConcurrentStreams = 0x3,
    /**
     * The initial window size for stream-level flow-control. The default value
     * is 65,535 octets.
     */
    InitialWindowSize = 0x4,
    /**
     * The maximum frame size that the client will receive. The maximum value
     * is 16,777,215 octets. The default value is 16,384 octets.
     */
    MaxFrameSize = 0x5,
    MaxHeaderListSize = 0x6
}

export interface SettingsEntry {
    param: SettingsParam;
    value: number;
}

export class SettingsFrame extends Frame {
    static FrameType = FrameType.Settings;

    static DefaultParametersLength = 36;
    static DefaultParameters = [{
        param: SettingsParam.HeaderTableSize,
        value: 4096
    }, {
        param: SettingsParam.EnablePush,
        value: 1
    }, {
        param: SettingsParam.MaxConcurrentStreams,
        value: null
    }, {
        param: SettingsParam.InitialWindowSize,
        value: 65535
    }, {
        param: SettingsParam.MaxFrameSize,
        value: 16384
    }, {
        param: SettingsParam.MaxHeaderListSize,
        value: 1024
    }];

    private _parameters: SettingsEntry[];

    constructor(frameData?: Buffer, ack?: boolean) {
        if (frameData !== undefined) {
            super(frameData);

            this._parameters = [];

            if (this._streamId !== 0) {
                throw new Http2Error("Invalid SETTINGS frame stream type",
                    Http2ErrorType.ProtocolError);
            }

            if (this._length % 6 !== 0) {
                throw new Http2Error("Invalid SETTINGS frame size",
                    Http2ErrorType.FrameSizeError);
            }

            if (this._flags & SettingsFlags.Ack && this._length !== 0) {
                throw new Http2Error("Invalid SETTINGS frame size",
                    Http2ErrorType.FrameSizeError);
            }

            let index: number = 9;
            while (index < this._length) {
                let parameter: number = frameData.readUIntBE(index, 2);
                let value: number = frameData.readUIntBE(index + 2, 4);
                if (parameter === SettingsParam.EnablePush) {
                    if (value !== 0 && value !== 1) {
                        throw new Http2Error("Invalid SETTINGS frame" +
                            " parameter value", Http2ErrorType.ProtocolError);
                    }
                } else if (parameter === SettingsParam.InitialWindowSize) {
                    if (value > Math.pow(2, 31) - 1) {
                        throw new Http2Error("Invalid SETTINGS frame" +
                            " parameter value", Http2ErrorType.ProtocolError);
                    }
                } else if (parameter === SettingsParam.MaxFrameSize) {
                    if (value > Math.pow(2, 24) - 1) {
                        throw new Http2Error("Invalid SETTINGS frame" +
                            " parameter value", Http2ErrorType.ProtocolError);
                    }
                }
                this._parameters.push({
                    param: parameter,
                    value: value
                });
                index += 6;
            }
        } else {
            super(undefined, 0, SettingsFrame.FrameType,
                ack ? SettingsFlags.Ack : 0, 0);
        }
    }

    setDefaults(): void {
        this._parameters = SettingsFrame.DefaultParameters;
        this._length = SettingsFrame.DefaultParametersLength;
    }

    getValue(parameter: SettingsParam): number {
        for (let item of this._parameters) {
            if (item.param === parameter) {
                return item.value;
            }
        }

        for (let item of SettingsFrame.DefaultParameters) {
            if (item.param === parameter) {
                return item.value;
            }
        }

        return null;
    }

    getBytes(): Buffer {
        let buffer = super.getBytes();
        if (!(this._flags & SettingsFlags.Ack)) {
            let index: number = Frame.HeaderSize;
            for (let item of this._parameters) {
                buffer.writeUIntBE(item.param, index, 2);
                buffer.writeUIntBE(item.value, index + 2, 4);
                index += 6;
            }
        }
        return buffer;
    }
}

export class GoAwayFrame extends Frame {
    static FrameType = FrameType.GoAway;

    private _lastStreamId: number;
    private _errorCode: Http2ErrorType;

    constructor(frameData?: Buffer, lastStreamId?: number,
                errorCode?: Http2ErrorType) {
        if (frameData !== undefined) {
            super(frameData);

            if (this._streamId !== 0) {
                throw new Http2Error("Invalid GOAWAY frame stream type",
                    Http2ErrorType.ProtocolError);
            }

            this._lastStreamId = frameData.readUIntBE(Frame.HeaderSize, 4);
            this._errorCode = frameData.readUIntBE(Frame.HeaderSize + 4, 4);
        } else {
            super(undefined, 8, GoAwayFrame.FrameType, 0, 0);

            this._lastStreamId = lastStreamId;
            this._errorCode = errorCode;
        }
    }

    getBytes(): Buffer {
        let buffer = super.getBytes();
        buffer.writeUIntBE(this._lastStreamId & 0x7ffffff, Frame.HeaderSize, 4);
        buffer.writeUIntBE(this._errorCode, Frame.HeaderSize + 4, 4);
        return buffer;
    }
}