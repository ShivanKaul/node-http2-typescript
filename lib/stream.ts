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

}

export interface StreamPair {
    stream: Stream;
    streamId: number;
}