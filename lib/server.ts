/// <reference path="../vendor/node.d.ts" />

import * as net from "net";
import {Connection} from "./connection";
import {HeaderField} from "./frame";
import {Stream} from "./stream";

export interface HandlerCallback {
    (data: Buffer, cb: ServerCallback): void
}

export interface ServerCallback {
    (headers: HeaderField[], data: Buffer): void
}

export interface ServerConfig {
    address: String;
    port?: number;
}

export interface ResponseConfig {
    method: string;
    url: string;
    callback: HandlerCallback;
    serverPush: ResponseConfig[];
}

export class Server {
    private _server: net.Server;
    private _address: String;
    private _port: number;
    private _connections: Connection[];
    private _responseConfigs: ResponseConfig[];
    private _errorCallback: HandlerCallback;

    constructor(config: ServerConfig) {
        this._connections = [];
        this._server = net.createServer((socket) => {
            this._connections.push(new Connection(this, socket));
        });
        if (config.port) {
            this._port = config.port;
        } else {
            this._port = 80;
        }
        if (config.address) {
            this._address = config.address;
        }
        this._server.listen(this._port);

        this._responseConfigs = [];
        this._errorCallback = (data: Buffer, callback: ServerCallback) => {
            callback(undefined, undefined);
        };
    }

    onRequest(responseConfig: ResponseConfig) {
        for (let item of this._responseConfigs) {
            if (item.method === responseConfig.method &&
                item.url === responseConfig.url) {
                item.callback = responseConfig.callback;
                item.serverPush = responseConfig.serverPush;
                return;
            }
        }

        this._responseConfigs.push(responseConfig);
    }

    onError(callback: HandlerCallback) {
        this._errorCallback = callback;
    }

    handleRequest(stream: Stream, headerFields: HeaderField[],
                  data: Buffer): void {
        let methodField: HeaderField;
        for (let field of headerFields) {
            if (field.name === ":method") {
                methodField = field;
                break;
            }
        }

        let pathField: HeaderField;
        for (let field of headerFields) {
            if (field.name === ":path") {
                pathField = field;
                break;
            }
        }

        for (let item of this._responseConfigs) {
            if (item.method.toLowerCase() === methodField.value.toLowerCase()) {
                if (item.url.toLowerCase() === pathField.value.toLowerCase()) {
                    ((item: ResponseConfig, address: String) => {
                        item.callback(data, (headers: HeaderField[],
                                             data: Buffer) => {
                            stream.sendHeaders(headers, data === undefined &&
                                item.serverPush.length === 0);
                            for (let i = 0; i < item.serverPush.length; i++) {
                                let serverPushConf: ResponseConfig =
                                    item.serverPush[i];
                                ((serverPushConf: ResponseConfig,
                                  address: String) => {
                                    serverPushConf.callback(data,
                                        (headers: HeaderField[], data: Buffer) => {
                                            if (headers === undefined) {
                                                headers = [];
                                                headers.push(<HeaderField>{
                                                    name: ":scheme",
                                                    value: "http"
                                                }, <HeaderField>{
                                                    name: ":method",
                                                    value: serverPushConf.method
                                                }, <HeaderField>{
                                                    name: ":path",
                                                    value: serverPushConf.url
                                                }, <HeaderField>{
                                                    name: ":authority",
                                                    value: address
                                                });
                                            }
                                            stream.sendPushPromise(headers, data);
                                        });
                                })(serverPushConf, address);
                            }
                            if (data !== undefined ||
                                item.serverPush.length !== 0) {
                                stream.sendData(data);
                            }
                        });
                    })(item, this._address);
                    return;
                }
            }
        }
        this._errorCallback(data, (headers: HeaderField[],
                                   data: Buffer) => {
            stream.sendHeaders(headers, data === undefined);
            stream.sendData(data);
        });
    }

    get connections(): Connection[] {
        return this._connections;
    }
}
