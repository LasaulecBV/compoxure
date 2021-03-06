'use strict';

var express = require('express');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var http = require('http');
var fs = require('fs');
var uuid = require('node-uuid');
var stubServer = {};

// This should probably be made its own project!
function initStubServer(fileName, port, hostname) {

    var app = express();

    app.use(cookieParser());
    app.use(bodyParser.urlencoded({extended: true}));

    app.get('/replaced', function(req, res) {
        res.writeHead(200, {"Content-Type": "text/html"});
        res.end('Replaced');
    });

    app.get('/uuid', function(req, res) {
        res.writeHead(200, {"Content-Type": "text/html", "x-static|service-one|bundle": "100"});
        res.end(uuid.v1());
    });

    app.get('/user/:user?', function(req, res) {
        res.writeHead(200, {"Content-Type": "text/html"});
        res.end("User: " + req.params.user || 'Unknown user');
    });

    app.get('/', function(req, res) {
        res.writeHead(200, {"Content-Type": "text/html"});
        var backendHtml = fs.readFileSync('./test/common/' + fileName, { encoding: 'utf8' });
        res.end(backendHtml);
    });

    app.get('/delayed', function(req, res) {
        setTimeout(function() {
            res.writeHead(200, {"Content-Type": "text/html"});
            res.end("Delayed by 100ms");
        },100);
    });

    app.get('/timeout', function(req, res) {
        setTimeout(function() {
            res.writeHead(200, {"Content-Type": "text/html"});
            res.end("Delayed by 6seconds");
        },6000);
    });

    app.get('/500', function(req, res) {
        res.writeHead(500, {"Content-Type": "text/html"});
        res.end("500");
    });

    app.get('/404', function(req, res) {
        res.writeHead(404, {"Content-Type": "text/html"});
        res.end("404");
    });

    var alternate500 = true;
    app.get('/alternate500', function(req, res) {
        alternate500 = !alternate500;
        if(alternate500) {
            res.writeHead(500, {"Content-Type": "text/html"});
            res.end("500");
        } else {
            res.writeHead(200, {"Content-Type": "text/html", "x-static|service-one|top": "100"});
            var backendHtml = fs.readFileSync('./test/common/bundle500.html', { encoding: 'utf8' });
            res.end(backendHtml);
        }
    });

    app.get('/403', function(req, res) {
        res.writeHead(403, {"Content-Type": "text/html"});
        res.end("403");
    });

    app.get('/302', function(req, res) {
       res.writeHead(302, {"location": "/replaced"});
       res.end("");
    });

    app.get('/favicon.ico', function(req, res) {
        res.end("");
    });

    app.get('/broken', function(req) {
        req.socket.end();
    });

    app.get('/millis', function(req, res) {
        res.writeHead(200, {'Content-Type': 'text/html', 'Cache-Control': 'no-store'});
        res.end('Millis since epoch:' + Date.now());
    });

    app.get('/millis-maxage', function(req, res) {
        res.writeHead(200, {'Content-Type': 'text/html', 'Cache-Control': 'max-age=1'});
        res.end('Millis since epoch:' + Date.now());
    });

    app.get('/faulty', function(req, res) {
         setTimeout(function() {
            if(Math.random() > 0.5) {
                res.writeHead(200, {"Content-Type": "text/html"});
                res.end("Faulty service managed to serve good content!");
            } else {
                res.writeHead(500, {"Content-Type": "text/html"});
                res.end("Faulty service broken");
            }
        },100);
    });

    app.get('/intermittentslow', function(req, res) {
        if(Math.random() > 0.5) {
            setTimeout(function() {
                res.writeHead(200, {"Content-Type": "text/html"});
                res.end("Why is this service sometimes so slow?");
            },2000);
        } else {
            res.writeHead(200, {"Content-Type": "text/html"});
            var largeHtml = fs.readFileSync('./test/common/large.html', { encoding: 'utf8' });
            res.write(largeHtml);
            setTimeout(function() {
                res.end(largeHtml);
            },100);
        }
    });

    app.get('/403backend', function(req, res) {
        res.writeHead(200, {"Content-Type": "text/html"});
        var backendHtml = fs.readFileSync('./test/common/test403.html', { encoding: 'utf8' });
        res.end(backendHtml);
    });

    app.get('/404backend', function(req, res) {
        res.writeHead(200, {"Content-Type": "text/html"});
        var backendHtml = fs.readFileSync('./test/common/test404.html', { encoding: 'utf8' });
        res.end(backendHtml);
    });

    app.get('/302backend', function(req, res) {
        res.writeHead(200, {"Content-Type": "text/html"});
        var backendHtml = fs.readFileSync('./test/common/test302.html', { encoding: 'utf8' });
        res.end(backendHtml);
    });

    app.get('/ignore404backend', function(req, res) {
        res.writeHead(200, {"Content-Type": "text/html"});
        var backendHtml = fs.readFileSync('./test/common/ignore404.html', { encoding: 'utf8' });
        res.end(backendHtml);
    });

    app.get('/selectFnBackend', function(req, res) {
        res.writeHead(200, {"Content-Type": "text/html"});
        var backendHtml = fs.readFileSync('./test/common/selectFnBackend.html', { encoding: 'utf8' });
        res.end(backendHtml);
    });

    app.get('/noCacheBackend', function(req, res) {
        res.writeHead(200, {"Content-Type": "text/html"});
        var backendHtml = fs.readFileSync('./test/common/noCacheBackend.html', { encoding: 'utf8' });
        res.end(backendHtml);
    });

    app.get('/bundles', function(req, res) {
        res.writeHead(200, {"Content-Type": "text/html"});
        var backendHtml = fs.readFileSync('./test/common/bundles.html', { encoding: 'utf8' });
        res.end(backendHtml);
    });

    app.get('/post', function(req, res) {
        res.writeHead(200, {"Content-Type": "text/html"});
        res.end("GET /post");
    });

    app.post('/post', function(req, res) {
        res.writeHead(200, {"Content-Type": "text/html"});
        res.end("POST " + req.cookies['PostCookie']);
    });

    app.get('/differenthost', function(req, res) {
        res.writeHead(200, {"Content-Type": "text/html"});
        res.end(req.headers.host);
    });

    app.get('/tracer', function(req, res) {
        res.writeHead(200, {"Content-Type": "text/plain"});
        res.end(req.headers['x-tracer']);
    });

    app.get('/header/:name', function(req, res) {
        res.writeHead(200, {"Content-Type": "text/plain" });
        res.end(req.headers[req.params.name]);
    });

    app.get('/service-one', function(req, res) {
        res.writeHead(200, {"Content-Type": "text/html", "x-static|service-one|top": "100", "x-static|service-one": "100"});
        res.end('Service One - I have a bundle, hear me roar.');
    });

    app.get('/service-two', function(req, res) {
        res.writeHead(200, {"Content-Type": "text/html"});
        res.end('Service Two - my bundle is superior, but I have no version.');
    });

    app.get('/static/:service/:version/html/:file', function(req, res) {
        res.writeHead(200, {"Content-Type": "text/html"});
        res.end(req.params.service + " >> " + req.params.version + " >> " + req.params.file);
    });

    app.get('/cookie', function(req, res) {
        res.writeHead(200, {"Content-Type": "text/plain"});
        res.end(req.headers.cookie);
    });

    app.get('/set-cookie', function(req, res) {
        res.cookie('hello', 'world');
        res.writeHead(200, {"Content-Type": "text/plain"});
        res.end('<div cx-url="{{server:local}}/set-fragment-cookie"></div><div cx-url="{{server:local}}/set-fragment-cookie"></div>');
    });

    app.get('/set-fragment-cookie', function(req, res) {
        res.cookie('another', 'cookie');
        res.cookie('hello', 'again');
        res.writeHead(200, {"Content-Type": "text/plain"});
        res.end('Fragment Cookies Set');
    });

    app.get('/country', function(req, res) {
        res.writeHead(200, {"Content-Type": "text/plain"});
        var geo = req.query ? req.query.geo : undefined;

        res.end(geo || '');
    });

    app.get('/lang', function(req, res) {
        res.writeHead(200, {"Content-Type": "text/plain"});
        res.end(req.headers['accept-language']);
    });

    app.get('/ua', function(req, res) {
        res.writeHead(200, {"Content-Type": "text/plain"});
        res.end(req.headers['user-agent']);
    });

    app.get('/device', function(req, res) {
        res.writeHead(200, {"Content-Type": "text/plain"});
        res.end(req.headers['x-device']);
    });

    return function(next) {
        app.listen(port).on('listening', next);
    };
}

module.exports = {
    init: initStubServer
};
