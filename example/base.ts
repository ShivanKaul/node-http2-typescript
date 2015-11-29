import {Server, ServerCallback, ServerConfig, ResponseConfig}
    from "../lib/server";

var config = <ServerConfig>{
    "address": "10.52.129.2",
    "port": 80
};

var server = new Server(config);
server.onRequest(<ResponseConfig>{
    method: "GET",
    url: "/",
    callback: (data: Buffer, callback: ServerCallback) => {
        callback(undefined, new Buffer("Hello, world!\n"));
    },
    serverPush: [
        <ResponseConfig>{
            method: "GET",
            url: "/1",
            callback: (data: Buffer, callback: ServerCallback) => {
                callback(undefined, new Buffer("Server push 1.\n"));
            }
        },
        <ResponseConfig>{
            method: "GET",
            url: "/2",
            callback: (data: Buffer, callback: ServerCallback) => {
                callback(undefined, new Buffer("Server push 2.\n"));
            }
        },
        <ResponseConfig>{
            method: "GET",
            url: "/3",
            callback: (data: Buffer, callback: ServerCallback) => {
                callback(undefined, new Buffer("Server push 3.\n"));
            }
        }
    ]
});
server.onError((data: Buffer, callback: ServerCallback) => {
    callback(undefined, new Buffer("Not found."));
});