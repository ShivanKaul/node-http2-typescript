/// <reference path="../vendor/node.d.ts" />

import {Socket} from "net";
import {Frame} from "./frame";
import {StreamPair} from "./stream";

export class Connection {
    static CONNECTION_PREFACE: string = "PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n";

    private _socket: Socket;
    private _streams: StreamPair[];
    private _settings: Settings;
    private _receivedConnectionPreface: boolean;
    private _dataBuffer: Buffer;
    private _dataBufferIndex: number;
    private _dataBufferFrameLength: number;

    constructor(socket: Socket) {
        this._socket = socket;
        this._socket.on("data", (data) => this.onData(data));
        this._settings = new Settings();
        this._receivedConnectionPreface = false;
        this._dataBuffer = new Buffer(this._settings.maxFrameSize);
        this._dataBufferIndex = 0;
        this._dataBufferFrameLength = -1;
    }

    private sendConnectionPreface(): void {
        this._socket.write(Connection.CONNECTION_PREFACE);
    }

    private sendFrame(frame: Frame): void {
        this._socket.write(frame.getBytes());
    }

    private onFrame(frame: Frame): void {

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

        // If the connection preface been received
        if (!this._receivedConnectionPreface) {
            if (this._dataBuffer.length > 24) {
                var receivedData = this._dataBuffer.toString("utf-8", 0, 24);
                if (receivedData == Connection.CONNECTION_PREFACE) {
                    this._receivedConnectionPreface = true;
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
                if (this._dataBufferFrameLength > this._settings.maxFrameSize) {
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

/**
 * Settings associated with a Connection.
 */
export class Settings {
    static DEFAULT_HEADER_TABLE_SIZE: number = 4096;
    static DEFAULT_ENABLE_PUSH: boolean = true;
    static DEFAULT_MAX_CONCURRENT_STREAMS: number = null;
    static DEFAULT_INITIAL_WINDOW_SIZE: number = 65535;
    static DEFAULT_MAX_FRAME_SIZE: number = 16384;

    /**
     * The maximum size of the header compression table used to decode header
     * blocks. The default value is 4096 octets.
     */
    private _headerTableSize: number;
    /**
     * If true, server push is enabled. The default value is true.
     */
    private _enablePush: boolean;
    /**
     * The maximum number of concurrent streams that the client will allow.
     * A value of null indicates that there is no limit. The default value is
     * null.
     */
    private _maxConcurrentStreams: number;
    /**
     * The initial window size for stream-level flow-control. The default value
     * is 65,535 octets.
     */
    private _initialWindowSize: number;
    /**
     * The maximum frame size that the client will receive. The maximum value
     * is 16,777,215 octets. The default value is 16,384 octets.
     */
    private _maxFrameSize: number;

    constructor() {
        this.headerTableSize = Settings.DEFAULT_HEADER_TABLE_SIZE;
        this.enablePush = Settings.DEFAULT_ENABLE_PUSH;
        this.maxConcurrentStreams = Settings.DEFAULT_MAX_CONCURRENT_STREAMS;
        this.initialWindowSize = Settings.DEFAULT_INITIAL_WINDOW_SIZE;
        this.maxFrameSize = Settings.DEFAULT_MAX_FRAME_SIZE;
    }

    get headerTableSize(): number {
        return this._headerTableSize;
    }

    set headerTableSize(headerTableSize: number) {
        this._headerTableSize = headerTableSize;
    }

    get enablePush(): boolean {
        return this._enablePush;
    }

    set enablePush(enablePush: boolean) {
        this._enablePush = enablePush;
    }

    get maxConcurrentStreams(): number {
        return this._maxConcurrentStreams;
    }

    set maxConcurrentStreams(maxConcurrentStreams: number) {
        this._maxConcurrentStreams = maxConcurrentStreams;
    }

    get initialWindowSize(): number {
        return this._initialWindowSize;
    }

    set initialWindowSize(initialWindowSize: number) {
        this._initialWindowSize = initialWindowSize;
    }

    get maxFrameSize(): number {
        return this._maxFrameSize;
    }

    set maxFrameSize(maxFrameSize: number) {
        this._maxFrameSize = maxFrameSize;
    }
}