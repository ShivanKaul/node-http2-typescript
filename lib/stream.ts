import {Connection} from "./connection";
import {Frame, FrameType, DataFrame, HeadersFlags,
    HeadersFrame, SettingsParam} from "./frame";
import {Server} from "./server";
import {HeaderField} from "./frame";
import {Http2Error} from "./error";

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
    private _endHeaders: boolean;

    constructor(server: Server, connection: Connection, frame: Frame,
                streamId: number) {
        this._server = server;
        this._connection = connection;

        this._streamId = streamId;
        this._state = StreamState.Idle;
        this._endHeaders = false;

        this.handleFrame(frame);
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
    }

    sendError(error: Http2Error): void {
        // TODO: Send RST_STREAM frame or pass up to connection
    }

    handleFrame(frame: Frame): void {
        try {
            if (frame.streamId === FrameType.Headers) {
                let headersFrame: HeadersFrame = <HeadersFrame>frame;
                if (headersFrame.flags & HeadersFlags.EndHeaders) {
                    this._endHeaders = true;
                }
                if (headersFrame.flags & HeadersFlags.EndStream) {
                    this._state = StreamState.HalfClosedRemote;
                    this._server.handleRequest(this, headersFrame.headerFields);
                }
            }
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