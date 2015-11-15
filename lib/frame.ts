/// <reference path="../vendor/node.d.ts" />

import {Settings} from "./connection";

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
    private static HEADER_SIZE = 9;

    protected _length: number;
    protected _type: FrameType;
    protected _flags: number;
    protected _streamId: number;

    constructor(frameData?: Buffer, length?: number, type?: FrameType,
                flags?: number, streamId?: number) {
        if (frameData != undefined) {
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

    getBytes(): Buffer {
        var buffer = new Buffer(this._length + Frame.HEADER_SIZE);
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
    HeaderTableSize = 0x1,
    EnablePush = 0x2,
    MaxConcurrentStreams = 0x3,
    InitialWindowSize = 0x4,
    MaxFrameSize = 0x5,
    MaxHeaderListSize = 0x6
}

export interface SettingsFrameParameterPair {
    paramType: SettingsFrameParameters;
    paramValue: number;
}

export class SettingsFrame extends Frame {
    static FrameType = FrameType.Settings;

    private parameters: SettingsFrameParameterPair[];

    constructor(frameData?: Buffer, settings?: Settings) {
        super(frameData);

        if (this._length % 6 != 0) {
            // TODO: Handle frame size error
        }
        if (this._flags & SettingsFrameFlags.Ack && this._length != 0) {
            // TODO: Handle settings ACK error
        }

        if (!(this._flags & SettingsFrameFlags.Ack)) {
            var index: number = 9;
            while (index < this._length) {

            }
        }
    }

    getBytes(): Buffer {
        var buffer = super.getBytes();
        return buffer;
    }
}