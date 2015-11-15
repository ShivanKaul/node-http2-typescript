/// <reference path="../vendor/node.d.ts" />

import {Http2Error, Http2ErrorType} from "./error";

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

    static parse(frameData: Buffer): Frame {
        var type = frameData.readUIntBE(3, 1);
        if (type == FrameType.Settings) {
            return new SettingsFrame(frameData);
        } else if (type == FrameType.GoAway) {
            return new GoAwayFrame(frameData);
        } else {
            return null;
        }

    }

    get type(): FrameType {
        return this._type;
    }

    getBytes(): Buffer {
        var buffer = new Buffer(this._length + Frame.HeaderSize);
        buffer.writeUIntBE(this._length, 0, 3);
        buffer.writeUIntBE(this._type, 3, 1);
        buffer.writeUIntBE(this._flags, 4, 1);
        buffer.writeUIntBE(this._streamId & 0x7ffffff, 5, 4);
        return buffer;
    }
}

export const enum SettingsFlags {
    Ack = 0x1
}

export const enum SettingsParams {
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

export interface SettingsPair {
    param: SettingsParams;
    value: number;
}

export class SettingsFrame extends Frame {
    static FrameType = FrameType.Settings;
    static DefaultParametersLength = 36;
    static DefaultParameters = [{
        param: SettingsParams.HeaderTableSize,
        value: 4096
    }, {
        param: SettingsParams.EnablePush,
        value: 1
    }, {
        param: SettingsParams.MaxConcurrentStreams,
        value: null
    }, {
        param: SettingsParams.InitialWindowSize,
        value: 65535
    }, {
        param: SettingsParams.MaxFrameSize,
        value: 16384
    }, {
        param: SettingsParams.MaxHeaderListSize,
        value: 1024
    }];

    private _parameters: SettingsPair[];

    constructor(frameData?: Buffer, ack?: boolean) {
        if (frameData !== undefined) {
            super(frameData);

            this._parameters = [];

            if (this._streamId != 0) {
                throw new Http2Error("Invalid SETTINGS frame stream type",
                    Http2ErrorType.ProtocolError);
            }

            if (this._length % 6 != 0) {
                throw new Http2Error("Invalid SETTINGS frame size",
                    Http2ErrorType.FrameSizeError);
            }

            if (this._flags & SettingsFlags.Ack && this._length != 0) {
                throw new Http2Error("Invalid SETTINGS frame size",
                    Http2ErrorType.FrameSizeError);
            }

            var index: number = 9;
            while (index < this._length) {
                var parameter: number = frameData.readUIntBE(index, 2);
                var value: number = frameData.readUIntBE(index + 2, 4);
                if (parameter == SettingsParams.EnablePush) {
                    if (value != 0 && value != 1) {
                        throw new Http2Error("Invalid SETTINGS frame" +
                            " parameter value", Http2ErrorType.ProtocolError);
                    }
                } else if (parameter == SettingsParams.InitialWindowSize) {
                    if (value > Math.pow(2, 31) - 1) {
                        throw new Http2Error("Invalid SETTINGS frame" +
                            " parameter value", Http2ErrorType.ProtocolError);
                    }
                } else if (parameter == SettingsParams.MaxFrameSize) {
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

    getValue(parameter: SettingsParams): number {
        for (var item of this._parameters) {
            if (item.param === parameter) {
                return item.value;
            }
        }

        for (var item of SettingsFrame.DefaultParameters) {
            if (item.param === parameter) {
                return item.value;
            }
        }

        return null;
    }

    getBytes(): Buffer {
        var buffer = super.getBytes();
        if (!(this._flags & SettingsFlags.Ack)) {
            var index: number = Frame.HeaderSize;
            for (var item of this._parameters) {
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

            if (this._streamId != 0) {
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
        var buffer = super.getBytes();
        buffer.writeUIntBE(this._lastStreamId & 0x7ffffff, Frame.HeaderSize, 4);
        buffer.writeUIntBE(this._errorCode, Frame.HeaderSize + 4, 4);
        return buffer;
    }
}