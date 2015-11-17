import {HeadersFlags, HeadersFrame} from "./frame";
import {Frame, FrameType} from "./frame";
import {Server} from "./server";

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

    private _state: StreamState;
    private _endHeaders: boolean;

    constructor(server: Server, frame: Frame) {
        this._server = server;

        this._state = StreamState.Idle;
        this._endHeaders = false;

        this.onFrame(frame);
    }

    sendResponse(data: Buffer) {

    }

    onFrame(frame: Frame): void {
        if (frame.streamId === FrameType.Headers) {
            var headersFrame: HeadersFrame = <HeadersFrame>frame;
            if (headersFrame.flags & HeadersFlags.EndHeaders) {
                this._endHeaders = true;
            }
            if (headersFrame.flags & HeadersFlags.EndStream) {
                this._state = StreamState.HalfClosedRemote;
                this._server.onRequest(this, headersFrame.headerFields);
            }
        }
    }
}

export interface StreamEntry {
    stream: Stream;
    streamId: number;
}