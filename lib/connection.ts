/// <reference path="../vendor/node.d.ts" />

import {Socket} from "net";

import {Compression} from "./compression";
import {Http2ErrorType, Http2Error} from "./error"
import {FrameType, Frame, SettingsFlags, SettingsParam, SettingsFrame,
    PingFlags, PingFrame, GoAwayFrame} from "./frame";
import {Server} from "./server";
import {Stream, StreamEntry} from "./stream";
import {HeaderField} from "./frame";

/**
 * Represents an HTTP/2 connection.
 */
export class Connection {
    /**
     * The HTTP/2 client connection preface.
     */
    private static CONNECTION_PREFACE: string =
        "PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n";

    private _server: Server;

    private _socket: Socket;

    private _streams: StreamEntry[];

    private _serverSettings: SettingsFrame;
    private _clientSettings: SettingsFrame;

    private _compression: Compression;

    private _dataBuffer: Buffer;
    private _dataBufferIndex: number;
    private _dataBufferFrameLength: number;

    private _receivedPreface: boolean;
    private _receivedSettingsFrame: boolean;
    private _goAwayFrameSent: boolean;
    private _errorOccurred: boolean;

    private _lastServerSettingsAcknowledged: boolean;
    private _lastPingAcknowledged: boolean;

    /**
     * Initializes a new instance of the Connection class.
     *
     * @param server The server responsible for translating HTTP methods
     *               and URIs into data.
     * @param socket The TCP socket associated with the connection.
     */
    constructor(server: Server, socket: Socket) {
        this._server = server;

        this._socket = socket;
        this._socket.on("data", (data) => this.handleTcpData(data));

        this._streams = [];

        this._serverSettings = new SettingsFrame();
        this._serverSettings.setDefaults();
        this._clientSettings = null;

        this._compression = new Compression(this._serverSettings.getValue(
            SettingsParam.HeaderTableSize));

        this._dataBuffer = new Buffer(this._serverSettings.getValue(
            SettingsParam.MaxFrameSize));
        this._dataBufferIndex = 0;
        this._dataBufferFrameLength = -1;

        this._receivedPreface = false;
        this._receivedSettingsFrame = false;
        this._goAwayFrameSent = false;
        this._errorOccurred = false;

        this._lastServerSettingsAcknowledged = false;
        this._lastPingAcknowledged = false;
    }

    get compression(): Compression {
        return this._compression;
    }

    /**
     * Sends a frame to the server.
     *
     * @param frame The frame to send to the server.
     */
    sendFrame(frame: Frame): void {
        this._socket.write(frame.getBytes());
    }

    /**
     * Sends a GOAWAY frame to the server when an error occurs.
     *
     * @param error The error that occurred.
     */
    sendError(error: Http2Error): void {
        let frame = new GoAwayFrame(undefined,
            this.getLastClientInitiatedStreamId(), error.connectionErrorType);
        this._socket.write(frame.getBytes());
        this._goAwayFrameSent = true;
        this._errorOccurred = true;

        this._socket.end();
    }

    /**
     * Gets the stream with the specified ID.
     *
     * @param id The specified ID.
     *
     * @returns {Stream} The stream with the specified ID.
     */
    private getStreamWithId(id: number): Stream {
        for (let item of this._streams) {
            if (item.streamId === id) {
                return item.stream;
            }
        }

        return null;
    }

    /**
     * Gets the most recent client-initiated stream ID. Client-initiated stream
     * IDs are always odd numbers.
     *
     * @returns {number} The most recent client-initiated stream ID.
     */
    private getLastClientInitiatedStreamId(): number {
        let maxOddId = 0;
        for (let item of this._streams) {
            if (item.streamId % 2 !== 0 && item.streamId > maxOddId) {
                maxOddId = item.streamId;
            }
        }
        return maxOddId;
    }

    /**
     * Called when a frame has been received from the server. Processes the
     * frames by calling the appropriate method.
     *
     * @param frame The frame received from the server.
     */
    private handleFrame(frame: Frame): void {
        try {
            if (frame === null) {
                // Discard unrecognized frames
                return;
            }

            if (!this._receivedPreface) {
                throw new Http2Error("Frame received before preface",
                    Http2ErrorType.ProtocolError);
            }

            if (!this._receivedSettingsFrame) {
                if (frame.type !== FrameType.Settings) {
                    throw new Http2Error("SETTINGS frame not received after" +
                        " preface", Http2ErrorType.ProtocolError);
                } else {
                    this._receivedSettingsFrame = true;
                    this.sendFrame(this._serverSettings);
                    this.handleSettingsFrame(<SettingsFrame>frame);
                    return;
                }
            }

            if (frame.streamId === 0) {
                if (frame.type === FrameType.Settings) {
                    if (frame.flags & SettingsFlags.Ack) {
                        // TODO: Send error using timeout if not acknowledged
                        this._lastServerSettingsAcknowledged = true;
                    } else {
                        this.handleSettingsFrame(<SettingsFrame>frame);
                    }
                    return;
                } else if (frame.type === FrameType.Ping) {
                    if (frame.flags & PingFlags.Ack) {
                        // TODO: Send error using timeout if not acknowledged
                        this._lastPingAcknowledged = true;
                    } else {
                        this.handlePingFrame(<PingFrame>frame);
                    }
                }
            } else {
                let stream: Stream = this.getStreamWithId(frame.streamId);

                if (frame.type === FrameType.Data) {
                    if (stream === null) {
                        throw new Http2Error("DATA frame received for" +
                            " non-existent stream",
                            Http2ErrorType.StreamClosed);
                    }
                    stream.handleFrame(frame);
                    return;
                }
                if (frame.type === FrameType.Headers) {
                    if (stream === null) {
                        this._streams.push({
                            stream: new Stream(this._server, this,
                                frame.streamId, frame),
                            streamId: frame.streamId
                        });
                    } else {
                        stream.handleFrame(frame);
                    }
                    return;
                }
            }
        } catch (error) {
            if (error instanceof Http2Error) {
                this.sendError(error);
            } else {
                throw error;
            }
        }
    }

    /**
     * Called when a SETTINGS frame is received from the client. In response,
     * the server saves the SETTINGS frame and sends an empty SETTINGS frame
     * with the ACK flag enabled.
     *
     * @param frame The SETTINGS frame received from the client.
     */
    private handleSettingsFrame(frame: SettingsFrame): void {
        this._clientSettings = frame;
        this._compression.maxDynamicTableSizeLimit =
            this._clientSettings.getValue(SettingsParam.HeaderTableSize);
        this.sendFrame(new SettingsFrame(undefined, true));
    }

    private handlePingFrame(frame: PingFrame): void {
        this.sendFrame(new PingFrame(undefined, frame.data, true));
    }

    /**
     * Called when data is received from the client. This data is usually
     * processed into frames and passed to the onFrame method.
     *
     * @param data The data received from the client.
     */
    private handleTcpData(data: Buffer): void {
        try {
            // If data buffer too small to hold incoming data, allocate a larger
            // buffer
            if (data.length > this._dataBuffer.length - this._dataBufferIndex) {
                let tempBuffer: Buffer = this._dataBuffer;
                this._dataBuffer = new Buffer(tempBuffer.length + data.length);
                tempBuffer.copy(this._dataBuffer, 0, 0, tempBuffer.length);
            }

            // Copy incoming data to data buffer
            data.copy(this._dataBuffer, this._dataBufferIndex, 0, data.length);
            this._dataBufferIndex += data.length;

            // If the connection preface has not yet been received, check to
            // see if it should have been received
            if (!this._receivedPreface) {
                if (this._dataBufferIndex >=
                    Connection.CONNECTION_PREFACE.length) {
                    let receivedData = this._dataBuffer.toString("utf-8", 0,
                        Connection.CONNECTION_PREFACE.length);
                    // If connection preface has been received, remove from
                    // data buffer and flag it as having been received
                    if (receivedData === Connection.CONNECTION_PREFACE) {
                        this._receivedPreface = true;
                        if (this._dataBufferIndex >
                            Connection.CONNECTION_PREFACE.length) {
                            this._dataBuffer.copy(this._dataBuffer, 0,
                                this._dataBufferIndex, this._dataBufferIndex -
                                Connection.CONNECTION_PREFACE.length);
                            this._dataBufferIndex = this._dataBufferIndex -
                                Connection.CONNECTION_PREFACE.length;
                        } else {
                            this._dataBufferIndex = 0;
                        }
                    } else {
                        // Otherwise, throw error as it should have been
                        // received
                        throw new Http2Error("Connection preface not received",
                            Http2ErrorType.ProtocolError);
                    }
                } else {
                    return;
                }
            }

            while (true) {
                // If the first 3 bytes of a new frame have been processed,
                // determine the frame size
                if (this._dataBufferFrameLength === -1) {
                    if (this._dataBufferIndex >= 3) {
                        this._dataBufferFrameLength =
                            this._dataBuffer.readUIntBE(0, 3) +
                            Frame.HeaderLength;
                        // If frame size exceeds maximum, throw error
                        if (this._dataBufferFrameLength - Frame.HeaderLength >
                            this._serverSettings.getValue(
                                SettingsParam.MaxFrameSize)) {
                            throw new Http2Error("Frame size exceeds maximum",
                                Http2ErrorType.FrameSizeError);
                        }
                    } else {
                        return;
                    }
                }

                // If we have all of the bytes for a frame, remove them from the
                // buffer and create a new frame
                if (this._dataBufferIndex >= this._dataBufferFrameLength) {
                    let frameBuffer: Buffer = new Buffer(
                        this._dataBufferFrameLength);
                    this._dataBuffer.copy(frameBuffer, 0, 0,
                        frameBuffer.length);

                    let frame: Frame = Frame.parse(this._compression,
                        frameBuffer);
                    this.handleFrame(frame);

                    // If there are still bytes left in the buffer, move those
                    // bytes to the beginning of the buffer
                    if (this._dataBufferIndex > this._dataBufferFrameLength) {
                        let tempBuffer = new Buffer(this._dataBuffer.length);
                        this._dataBuffer.copy(tempBuffer, 0,
                            this._dataBufferFrameLength, this._dataBufferIndex);
                        this._dataBuffer = tempBuffer;
                        this._dataBufferIndex = this._dataBufferIndex -
                            this._dataBufferFrameLength;
                    } else {
                        this._dataBufferIndex = 0;
                    }
                    this._dataBufferFrameLength = -1;
                } else {
                    return;
                }
            }
        } catch (error) {
            if (error instanceof Http2Error) {
                this.sendError(error);
            } else {
                throw error;
            }
        }
    }

    get clientSettings(): SettingsFrame {
        return this._clientSettings;
    }
}