/// <reference path="../vendor/node.d.ts" />

import * as net from "net";
import {Connection} from "./connection";
import {HeaderField} from "./frame";
import {Stream} from "./stream";

interface ServerConfig {
    port?: number;
}

export class Server {
    private _server: net.Server;
    private _port: number;
    private _connections: Connection[];

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
    }

    onRequest(stream: Stream, headerFields: HeaderField[]): void {

    }
}
