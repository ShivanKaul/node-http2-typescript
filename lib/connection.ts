/// <reference path="../vendor/node.d.ts" />

import {Socket} from "net";

export class Connection {
    private _socket: Socket;

    constructor(socket: Socket) {
        this._socket = socket;
        this._socket.on("data", (data) => this.onData(data));
    }

    private onData(data: Buffer): void {

    }
}