/// <reference path="../vendor/node.d.ts" />

import {Socket} from "net";
import {StreamPair} from "./stream";
import {Frame, FrameType, SettingsFrame, SettingsFrameParameters} from "./frame";

export class Connection {
    static CONNECTION_PREFACE: string = "PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n";

    private _socket: Socket;

    private _streams: StreamPair[];

    private _serverSettings: SettingsFrame;
    private _clientSettings: SettingsFrame;

    private _dataBuffer: Buffer;
    private _dataBufferIndex: number;
    private _dataBufferFrameLength: number;

    private _receivedPreface: boolean;
    private _receivedSettingsFrame: boolean;
    private _errorOccurred: boolean;

    constructor(socket: Socket) {
        this._socket = socket;
        this._socket.on("data", (data) => this.onData(data));

        this._streams = [];

        this._serverSettings = new SettingsFrame();
        this._serverSettings.setDefaults();
        this._clientSettings = null;

        this._dataBuffer = new Buffer(this._serverSettings.getValue(
            SettingsFrameParameters.MaxFrameSize));
        this._dataBufferIndex = 0;
        this._dataBufferFrameLength = -1;

        this._receivedPreface = false;
        this._receivedSettingsFrame = false;
        this._errorOccurred = false;
    }

    private sendConnectionPreface(): void {
        this._socket.write(Connection.CONNECTION_PREFACE);
    }

    private sendFrame(frame: Frame): void {
        this._socket.write(frame.getBytes());
    }

    private onFrame(frame: Frame): void {
        if (!this._receivedPreface) {
            // TODO: Handle error
        }

        if (!this._receivedSettingsFrame && frame.type !== FrameType.Settings) {
            // TODO: Handle error
        } else {
            this._clientSettings = <SettingsFrame>frame;
            this.sendConnectionPreface();
            this.sendFrame(this._serverSettings);
        }
    }

    private onData(data: Buffer): void {
        // If data buffer too small to hold incoming data, allocate a larger
        // buffer
        if (data.length > this._dataBuffer.length - this._dataBufferIndex) {
            var tempBuffer: Buffer = this._dataBuffer;
            this._dataBuffer = new Buffer(tempBuffer.length + data.length);
            tempBuffer.copy(this._dataBuffer, 0, 0, tempBuffer.length);
        }

        // Copy incoming data to data buffer
        data.copy(this._dataBuffer, this._dataBufferIndex, 0, data.length);
        this._dataBufferIndex += data.length;

        // If the connection preface been received, process it
        if (!this._receivedPreface) {
            if (this._dataBuffer.length > 24) {
                var receivedData = this._dataBuffer.toString("utf-8", 0, 24);
                if (receivedData == Connection.CONNECTION_PREFACE) {
                    this._receivedPreface = true;
                } else {
                    // TODO: Handle connection preface error
                }
            }

        }

        // If the first 3 bytes of a new frame have been processed, determine
        // the frame size
        if (this._dataBufferFrameLength == -1) {
            if (this._dataBufferIndex >= 24) {
                this._dataBufferFrameLength = this._dataBuffer.readUIntBE(0, 3);
                if (this._dataBufferFrameLength >
                    this._serverSettings.getValue(
                        SettingsFrameParameters.MaxFrameSize)) {
                    // TODO: Handle frame size error
                }
            }
        }

        // If we have all of the bytes for a frame, remove them from the buffer
        // and create a new frame
        if (this._dataBufferIndex >= this._dataBufferFrameLength) {
            var frameBuffer: Buffer = new Buffer(this._dataBufferFrameLength);
            this._dataBuffer.copy(frameBuffer, 0, 0, frameBuffer.length);

            var frame: Frame = Frame.parse(frameBuffer);
            this.onFrame(frame);

            if (this._dataBufferIndex > this._dataBufferFrameLength) {
                this._dataBuffer.copy(this._dataBuffer, 0,
                    this._dataBufferIndex,
                    this._dataBufferIndex - this._dataBufferFrameLength);
                this._dataBufferIndex = this._dataBufferIndex -
                    this._dataBufferFrameLength;
            } else {
                this._dataBufferIndex = 0;
            }
            this._dataBufferFrameLength = -1;
        }
    }
}