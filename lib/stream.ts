import {HeadersFrame} from "./frame";
import {Frame} from "./frame";

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
    constructor(frame: Frame) {

    }

    onFrame(frame: Frame): void {

    }
}

export interface StreamEntry {
    stream: Stream;
    streamId: number;
}