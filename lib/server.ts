/// <reference path="../vendor/node.d.ts" />

import * as net from "net";
import {Connection} from "./connection";
import {HeaderField} from "./frame";
import {Stream} from "./stream";

export interface ServerConfig {
    port?: number;
}

export interface ResponseConfig {
    method: string;
    url: string;
    callback(cb: (data: Buffer) => void): void;
}

export class Server {
    private _server: net.Server;
    private _port: number;
    private _connections: Connection[];
    private _responseConfigs: ResponseConfig[];

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
    }

    onRequest(method: string, url: string,
              callback: (cb: (data: Buffer) => void) => void) {
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

    handleRequest(stream: Stream, headerFields: HeaderField[]): void {
        let methodField: HeaderField;
        for (let field of headerFields) {
            if (field.name === ":method") {
                methodField = field;
            }
        }

        let pathField: HeaderField;
        for (let field of headerFields) {
            if (field.name === ":path") {
                pathField = field;
            }
        }

        for (let item of this._responseConfigs) {
            if (item.method.toLowerCase() === methodField.value.toLowerCase()) {
                if (item.url.toLowerCase() === pathField.value.toLowerCase()) {
                    item.callback((data: Buffer) => {
                        stream.sendResponse(data);
                    })
                }
            }
        }
    }
}
