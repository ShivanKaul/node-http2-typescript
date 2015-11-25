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
    port?: number;
}

export interface ResponseConfig {
    method: string;
    url: string;
    callback: HandlerCallback;
}

export class Server {
    private _server: net.Server;
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
        this._server.listen(this._port);

        this._responseConfigs = [];
        this._errorCallback = (data: Buffer, callback: ServerCallback) => {
            callback(undefined, undefined);
        };
    }

    onRequest(method: string, url: string, callback: HandlerCallback) {
        for (let item of this._responseConfigs) {
            if (item.method === method && item.url === url) {
                item.callback = callback;
                return;
            }
        }

        this._responseConfigs.push(<ResponseConfig>{
            method: method,
            url: url,
            callback: callback
        });
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
                    item.callback(data, (headers: HeaderField[],
                                         data: Buffer) => {
                        stream.sendResponse(headers, data);
                    });
                    return;
                }
            }
        }
        this._errorCallback(data, (headers: HeaderField[],
                                   data: Buffer) => {
            stream.sendResponse(headers, data);
        });
    }

    get connections(): Connection[] {
        return this._connections;
    }
}
