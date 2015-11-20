import {Server, ServerConfig} from "../lib/server";
import {ResponseCallback} from "../lib/server";

var config = <ServerConfig>{
    "port": 80
};

var server = new Server(config);
server.onRequest("GET", "/", (callback: ResponseCallback) => {
    callback(undefined, new Buffer("Hello, world!"));
});