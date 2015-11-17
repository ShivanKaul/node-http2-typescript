import {Connection} from "./connection";
import {Frame, FrameType, DataFrame, HeadersFlags,
    HeadersFrame} from "./frame";
import {Server} from "./server";
import {HeaderField} from "./frame";

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

    sendResponse(data?: Buffer) {
        if (data === undefined) {
            // 404 File Not Found
            let headers: HeaderField[] = [];
            headers.push(<HeaderField>{
                name: ":status",
                value: "404"
            });

            let headersFrame: HeadersFrame = new HeadersFrame(
                this._connection.compression, undefined, headers,
                this._streamId, false, true, false, undefined, undefined,
                undefined);
            this._connection.sendFrame(headersFrame);

            let dataFrame: DataFrame = new DataFrame(undefined,
                new Buffer("404: File Not Found."), this._streamId, true);
            this._connection.sendFrame(dataFrame);
        } else {
            // 200 OK
            let headers: HeaderField[] = [];
            headers.push(<HeaderField>{
                name: ":status",
                value: "200"
            });

            let headersFrame: HeadersFrame = new HeadersFrame(
                this._connection.compression, undefined, headers,
                this._streamId, false, true, false, undefined, undefined,
                undefined);
            this._connection.sendFrame(headersFrame);

            let dataFrame: DataFrame = new DataFrame(undefined, data,
                this._streamId, true);
            this._connection.sendFrame(dataFrame);
        }
    }

    handleFrame(frame: Frame): void {
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
}

export interface StreamEntry {
    stream: Stream;
    streamId: number;
}