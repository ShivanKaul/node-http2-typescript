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
    private static HeaderSize = 9;

    protected _length: number;
    private _type: FrameType;
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
        buffer.writeUIntBE(this._streamId & (0 << 31), 5, 4);
        return buffer;
    }
}

export const enum SettingsFrameFlags {
    Ack = 0x1
}

export const enum SettingsFrameParameters {
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

export interface SettingsFrameParameterPair {
    paramType: SettingsFrameParameters;
    paramValue: number;
}

export class SettingsFrame extends Frame {
    static FrameType = FrameType.Settings;
    static DefaultParametersLength = 30;
    static DefaultParameters = [{
        paramType: SettingsFrameParameters.HeaderTableSize,
        paramValue: 4096
    }, {
        paramType: SettingsFrameParameters.EnablePush,
        paramValue: 1
    }, {
        paramType: SettingsFrameParameters.MaxConcurrentStreams,
        paramValue: null
    }, {
        paramType: SettingsFrameParameters.InitialWindowSize,
        paramValue: 65535
    }, {
        paramType: SettingsFrameParameters.MaxFrameSize,
        paramValue: 16384
    }, {
        paramType: SettingsFrameParameters.MaxHeaderListSize,
        paramValue: 1024
    }];

    private _parameters: SettingsFrameParameterPair[];

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

            if (this._flags & SettingsFrameFlags.Ack && this._length != 0) {
                throw new Http2Error("Invalid SETTINGS frame size",
                    Http2ErrorType.FrameSizeError);
            }

            var index: number = 9;
            while (index < this._length) {
                var parameter: number = frameData.readUIntBE(index, 2);
                var value: number = frameData.readUIntBE(index + 2, 4);
                if (parameter == SettingsFrameParameters.EnablePush) {
                    if (value != 0 && value != 1) {
                        throw new Http2Error("Invalid SETTINGS frame" +
                            " parameter value", Http2ErrorType.ProtocolError);
                    }
                } else if (parameter == SettingsFrameParameters.InitialWindowSize) {
                    if (value > Math.pow(2, 31) - 1) {
                        throw new Http2Error("Invalid SETTINGS frame" +
                            " parameter value", Http2ErrorType.ProtocolError);
                    }
                } else if (parameter == SettingsFrameParameters.MaxFrameSize) {
                    if (value > Math.pow(2, 24) - 1) {
                        throw new Http2Error("Invalid SETTINGS frame" +
                            " parameter value", Http2ErrorType.ProtocolError);
                    }
                }
                this._parameters.push({
                    paramType: parameter,
                    paramValue: value
                });
                index += 6;
            }
        } else {
            super(undefined, SettingsFrame.DefaultParametersLength,
                SettingsFrame.FrameType, ack ? SettingsFrameFlags.Ack : 0, 0);
        }
    }

    setDefaults(): void {
        this._parameters = SettingsFrame.DefaultParameters;
        this._length = SettingsFrame.DefaultParametersLength;
    }

    getValue(parameter: SettingsFrameParameters): number {
        for (var item of this._parameters) {
            if (item.paramType === parameter) {
                return item.paramValue;
            }
        }

        for (var item of SettingsFrame.DefaultParameters) {
            if (item.paramType === parameter) {
                return item.paramValue;
            }
        }

        return null;
    }

    getBytes(): Buffer {
        var buffer = super.getBytes();
        if (!(this._flags & SettingsFrameFlags.Ack)) {
            var index: number = 9;
            for (var item of this._parameters) {
                buffer.writeUIntBE(item.paramType, index, 2);
                buffer.writeUIntBE(item.paramValue, index + 2, 4);
            }
        }
        return buffer;
    }
}