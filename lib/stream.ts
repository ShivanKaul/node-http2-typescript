import {Connection} from "./connection";
import {Frame, FrameType, DataFrame, HeaderTypeFlags, HeaderTypeFrame,
    DataFlags, HeadersFlags, HeaderField, HeadersFrame,
    SettingsParam} from "./frame";
import {Server} from "./server";
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
    private _headerFrames: HeaderTypeFrame[];
    private _dataFrames: DataFrame[];
    private _streamClosedByClient: boolean;

    constructor(server: Server, connection: Connection, streamId: number,
                firstReceivedFrame?: Frame) {
        this._server = server;
        this._connection = connection;
        this._streamId = streamId;
        this._state = StreamState.Idle;
        this._lastFrameReceived = null;
        this._headerFrames = [];
        this._dataFrames = [];
        this._streamClosedByClient = false;

        if (firstReceivedFrame !== undefined) {
            this.handleFrame(firstReceivedFrame);
        }
    }

    handleRequest() {
        let headerFields: HeaderField[] = [];
        for (let frame of this._headerFrames) {
            if (frame.type === FrameType.Headers) {
                headerFields = headerFields.concat(
                    (<HeadersFrame>frame).headerFields);
            } else {
                // TODO: Implement support for CONTINUATION frames
            }
        }

        let dataLength: number = 0;
        for (let frame of this._dataFrames) {
            dataLength += frame.data.length;
        }

        let dataBuffer: Buffer;
        if (dataLength !== 0) {
            dataBuffer = new Buffer(dataLength);
            let dataIndex: number = 0;
            for (let frame of this._dataFrames) {
                frame.data.copy(dataBuffer, dataIndex, 0, frame.data.length);
                dataIndex += frame.data.length;
            }
        } else {
            dataBuffer = null;
        }

        this._server.handleRequest(this, headerFields, dataBuffer);
    }

    sendPushPromise() {
        // TODO: Implement this method
        this._state = StreamState.ReservedLocal;
    }

    sendResponse(headers?: HeaderField[], data?: Buffer) {
        if (headers === undefined) {
            headers = [];
            if (data === undefined) {
                // 404 Not Found
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
            // If a CONTINUATION frame is expected, make sure this frame is a
            // CONTINUATION frame
            if (this._headerFrames.length !== 0) {
                let lastFrame: HeaderTypeFrame =
                    this._headerFrames[this._headerFrames.length - 1];
                if (!(lastFrame.flags & HeaderTypeFlags.EndHeaders)) {
                    if (frame.type !== FrameType.Continuation) {
                        throw new Http2Error("CONTINUATION frame expected" +
                            " but not received",
                            Http2ErrorType.ProtocolError);
                    }
                }
            }

            // Verify that the frame received matches the state we are in
            if (this._state === StreamState.Idle) {
                if (frame.type !== FrameType.Headers &&
                    frame.type !== FrameType.PushPromise &&
                    frame.type !== FrameType.Priority) {
                    throw new Http2Error("Frame other than HEADERS or" +
                        " PUSH_PROMISE received in idle state",
                        Http2ErrorType.ProtocolError);
                }
            } else if (this._state === StreamState.ReservedLocal) {
                if (frame.type !== FrameType.RstStream &&
                    frame.type !== FrameType.Priority &&
                    frame.type !== FrameType.WindowUpdate) {
                    throw new Http2Error("Frame other than RST_STREAM," +
                        " PRIORITY, or WINDOW_UPDATE received in reserved" +
                        " (local) state",
                        Http2ErrorType.ProtocolError);
                }
            } else if (this._state === StreamState.ReservedRemote) {
                if (frame.type !== FrameType.Headers &&
                    frame.type !== FrameType.RstStream &&
                    frame.type !== FrameType.Priority) {
                    throw new Http2Error("Frame other than HEADERS," +
                        " RST_STREAM, or PRIORITY received in reserved" +
                        " (remote) state",
                        Http2ErrorType.ProtocolError);
                }
            } else if (this._state === StreamState.HalfClosedRemote) {
                if (frame.type !== FrameType.WindowUpdate &&
                    frame.type !== FrameType.Priority &&
                    frame.type !== FrameType.RstStream) {
                    throw new Http2Error("Frame other than WINDOW_UPDATE," +
                        " PRIORITY, or RST_STREAM received in half-closed" +
                        " (remote) state", undefined,
                        Http2ErrorType.StreamClosed);
                }
            } else if (this._state === StreamState.Closed) {
                if (this._streamClosedByClient) {
                    if (frame.type !== FrameType.Priority) {
                        throw new Http2Error("Frame other than PRIORITY" +
                            " received in closed state", undefined,
                            Http2ErrorType.StreamClosed);
                    }
                }
            }

            // Process DATA frame
            if (frame.streamId === FrameType.Data &&
                this._state !== StreamState.Closed) {
                let dataFrame: DataFrame = <DataFrame>frame;
                this._dataFrames.push(dataFrame);

                if (dataFrame.flags & DataFlags.EndStream) {
                    if (this._state === StreamState.Open) {
                        this._state = StreamState.HalfClosedRemote;
                    } else if (this._state === StreamState.HalfClosedLocal) {
                        this._state = StreamState.Closed;
                    }
                    this.handleRequest();
                }
            }

            // Process HEADERS frame
            if (frame.streamId === FrameType.Headers &&
                this._state !== StreamState.Closed) {
                if (this._headerFrames.length !== 0) {
                    throw new Http2Error("More than one HEADERS frame" +
                        " received for a single stream",
                        Http2ErrorType.ProtocolError);
                }

                let headersFrame: HeadersFrame = <HeadersFrame>frame;
                this._headerFrames.push(<HeaderTypeFrame>frame);

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
                        this.handleRequest();
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