import {Connection} from "./connection";
import {Frame, FrameType, DataFrame, HeadersFlags,
    HeadersFrame, SettingsParam} from "./frame";
import {Server} from "./server";
import {HeaderField} from "./frame";
import {Http2ErrorType, Http2Error} from "./error";

export enum StreamState {
    Idle,
    ReservedLocal,
    ReservedRemote,
    Open,
    HalfClosedLocal,
    HalfClosedRemote,
    Closed
}

export class Stream {
    private _server: Server;
    private _connection: Connection;
    private _streamId: number;
    private _state: StreamState;
    private _lastFrameReceived: Frame;
    private _headerFrames: Frame[];

    constructor(server: Server, connection: Connection, frame: Frame,
                streamId: number) {
        this._server = server;
        this._connection = connection;
        this._streamId = streamId;
        this._state = StreamState.Idle;
        this._lastFrameReceived = null;
        this._headerFrames = [];

        this.handleFrame(frame);
    }

    sendPushPromise() {
        // TODO: Implement this method
        this._state = StreamState.ReservedLocal;
    }

    sendResponse(headers?: HeaderField[], data?: Buffer) {
        if (headers === undefined) {
            headers = [];
            if (data === undefined) {
                // 404 File Not Found
                headers.push(<HeaderField>{
                    name: ":status",
                    value: "404"
                });
            } else {
                // 200 OK
                headers.push(<HeaderField>{
                    name: ":status",
                    value: "200"
                });
            }
        }

        // TODO: Implement support for CONTINUATION frames
        if (data === undefined) {
            let headersFrame: HeadersFrame = new HeadersFrame(
                this._connection.compression, undefined, headers,
                this._streamId, true, true, false, undefined, undefined,
                undefined);
            this._connection.sendFrame(headersFrame);
        } else {
            let headersFrame: HeadersFrame = new HeadersFrame(
                this._connection.compression, undefined, headers,
                this._streamId, false, true, false, undefined, undefined,
                undefined);
            this._connection.sendFrame(headersFrame);
        }

        if (this._state === StreamState.Idle) {
            this._state = StreamState.Open;
        } else if (this._state === StreamState.ReservedLocal) {
            this._state = StreamState.HalfClosedRemote;
        }

        if (data !== undefined) {
            let dataIndex: number = 0;
            let maxFrameSize: number = this._connection.clientSettings.getValue(
                SettingsParam.MaxFrameSize);
            while (data.length - dataIndex > maxFrameSize) {
                let dataBuffer: Buffer = new Buffer(SettingsParam.MaxFrameSize);
                data.copy(dataBuffer, 0, dataIndex,
                    dataIndex + dataBuffer.length);
                let dataFrame: DataFrame = new DataFrame(undefined, dataBuffer,
                    this._streamId, false);
                this._connection.sendFrame(dataFrame);
                dataIndex += dataBuffer.length;
            }

            let dataBuffer: Buffer = new Buffer(data.length - dataIndex);
            data.copy(dataBuffer, 0, dataIndex, dataIndex + dataBuffer.length);
            let dataFrame: DataFrame = new DataFrame(undefined, dataBuffer,
                this._streamId, true);
            this._connection.sendFrame(dataFrame);
        }

        if (this._state === StreamState.Open) {
            this._state = StreamState.HalfClosedLocal;
        } else {
            this._state = StreamState.Closed;
        }
    }

    sendError(error: Http2Error): void {
        if (error.streamErrorType !== undefined) {
            // TODO: Send RST_STREAM
            this._state = StreamState.Closed;
        }

        if (error.connectionErrorType !== undefined) {
            this._connection.sendError(error);
        }
    }

    handleFrame(frame: Frame): void {
        try {
            if (frame.streamId === FrameType.Headers) {
                if (this._headerFrames.length !== 0) {
                    throw new Http2Error("More than one HEADERS frame" +
                        " received for a single stream",
                        Http2ErrorType.ProtocolError);
                }

                if (this._state === StreamState.ReservedLocal) {
                    throw new Http2Error("Received HEADERS frame while in" +
                        " reserved (local) state",
                        Http2ErrorType.ProtocolError);
                } else if (this._state === StreamState.HalfClosedRemote) {
                    throw new Http2Error("Received HEADERS frame while in" +
                        " half-closed (remote) state", undefined,
                        Http2ErrorType.StreamClosed);
                } else if (this._state === StreamState.Closed) {
                    throw new Http2Error("Received HEADERS frame while in" +
                        " closed state", Http2ErrorType.ProtocolError,
                        Http2ErrorType.StreamClosed);
                }

                let headersFrame: HeadersFrame = <HeadersFrame>frame;
                if (headersFrame.flags & HeadersFlags.EndHeaders) {
                    if (this._state === StreamState.Idle) {
                        this._state = StreamState.Open;
                    } else if (this._state === StreamState.ReservedRemote) {
                        this._state = StreamState.HalfClosedLocal;
                    }

                    if (headersFrame.flags & HeadersFlags.EndStream) {
                        if (this._state === StreamState.Open) {
                            this._state = StreamState.HalfClosedRemote;
                        } else if (this._state === StreamState.HalfClosedLocal) {
                            this._state = StreamState.Closed;
                        }

                        this._headerFrames.push(frame);

                        let headerFields: HeaderField[] = [];
                        for (let frame of this._headerFrames) {
                            if (frame.type === FrameType.Headers) {
                                headerFields = headerFields.concat(
                                    (<HeadersFrame>frame).headerFields);
                            } else {
                                // TODO: Implement support for CONTINUATION frames
                            }
                        }

                        this._server.handleRequest(this, headerFields);
                    }
                }
            }

            this._lastFrameReceived = frame;
        }
        catch (error) {
            if (error instanceof Http2Error) {
                this.sendError(error);
            } else {
                throw error;
            }
        }
    }
}

export interface StreamEntry {
    stream: Stream;
    streamId: number;
}