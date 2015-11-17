import {Server, ServerConfig} from "../lib/server";

var config = <ServerConfig>{
    "port": 80
};

var server = new Server(config);
server.onRequest("GET", "/", (callback: (data: Buffer) => void) => {
    callback(new Buffer("Hello, world!"));
});