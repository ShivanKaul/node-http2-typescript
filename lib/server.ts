/// <reference path="../vendor/node.d.ts" />

import * as net from "net";

interface ServerConfig {
  port?: number;
}

export class Server {
    private _server: net.Server;
    private _port: number;
    constructor(config:ServerConfig) {
        this._server = net.createServer( function (c) {
          //TODO: Pass connection socket to new Connection Object
        });
        if(config.port){
          this._port = config.port;
        } else {
          this._port = 80;
        }
        this._server.listen(this._port);
    }
}
