import {Server, ServerConfig} from "../lib/server";
import {ServerCallback} from "../lib/server";

var config = <ServerConfig>{
    "port": 80
};

var server = new Server(config);
server.onRequest("GET", "/", (data: Buffer, callback: ServerCallback) => {
    callback(undefined, new Buffer("Hello, world!"));
});
server.onError((data: Buffer, callback: ServerCallback) => {
    callback(undefined, new Buffer("404!"));
});