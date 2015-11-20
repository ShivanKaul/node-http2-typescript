export const enum Http2ErrorType {
    NoError = 0x0,
    ProtocolError = 0x1,
    InternalError = 0x2,
    FlowControlError = 0x3,
    SettingsTimeout = 0x4,
    StreamClosed = 0x5,
    FrameSizeError = 0x6,
    RefusedStream = 0x7,
    Cancel = 0x8,
    CompressionError = 0x9,
    ConnectError = 0xa,
    EnhanceYourCalm = 0xb,
    InadequateSecurity = 0xc,
    Http11Required = 0xd
}

export class Http2Error extends Error {
    private _connectionErrorType: Http2ErrorType;
    private _streamErrorType: Http2ErrorType;

    constructor(message: string, connectionErrorType: Http2ErrorType,
                streamErrorType?: Http2ErrorType) {
        super(message);

        this._connectionErrorType = connectionErrorType;
        this._streamErrorType = streamErrorType;
    }

    get connectionErrorType(): Http2ErrorType {
        return this._connectionErrorType;
    }

    get streamErrorType(): Http2ErrorType {
        return this._streamErrorType;
    }
}