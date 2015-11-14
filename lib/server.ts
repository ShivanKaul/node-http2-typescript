/// <reference path="../vendor/node.d.ts" />

import * as net from "net";
import {Connection} from "./connection";

interface ServerConfig {
    port?: number;
}

export class Server {
    private _server: net.Server;
    private _port: number;
    private _connections: Connection[];

    constructor(config: ServerConfig) {
        this._server = net.createServer(function (socket) {
            this._connections.add(new Connection(socket));
        });
        if (config.port) {
            this._port = config.port;
        } else {
            this._port = 80;
        }
        this._server.listen(this._port);
    }
}
