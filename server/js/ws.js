
var cls = require("./lib/class"),
    express = require('express'),
    path = require('path'),
    Types = require('../../shared/js/gametypes.js'),
    WS = {};

module.exports = WS;


/**
 * Abstract Server and Connection classes
 */
var Server = cls.Class.extend({
    init: function(port) {
        this.port = port;
    },
    
    onConnect: function(callback) {
        this.connection_callback = callback;
    },
    
    onError: function(callback) {
        this.error_callback = callback;
    },
    
    broadcast: function(message) {
        throw "Not implemented";
    },
    
    forEachConnection: function(callback) {
        _.each(this._connections, callback);
    },
    
    addConnection: function(connection) {
        this._connections[connection.id] = connection;
    },
    
    removeConnection: function(id) {
        delete this._connections[id];
    },
    
    getConnection: function(id) {
        return this._connections[id];
    }
});

/**
 * MultiVersionWebsocketServer
 * 
 * Websocket server supporting draft-75, draft-76 and version 08+ of the WebSocket protocol.
 * Fallback for older protocol versions borrowed from https://gist.github.com/1219165
 */
WS.MultiVersionWebsocketServer = Server.extend({
    _connections: {},
    _counter: 1,

    init: function(port) {
        var self = this;
        
        this._super(port);
        
        this._app = express();
        this._server = require('http').Server(this._app);
        this._server.listen(this.port, function() {            
            log.info("Listening on port "+port);
        });
        this._app.use(express.static(__dirname + '/../../client'));

        this._app.get('/', function(req, res) {
            res.sendFile('index.html');
        });

        this._app.get('/shared/js/gametypes.js', function(req, res) {
            res.sendFile(path.resolve(__dirname + '../../../shared/js/gametypes.js'));
        });

        io = require('socket.io').listen(this._server);
        io.on('connection', function(socket) {
            socket.id = self._createId();
            socket.close = socket.disconnect;

            self.addConnection(socket);

            socket.on('error', function() {
                if(self.error_callback) {
                    self.error_callback(arguments);
                }
            });

            if(self.connection_callback) {
                self.connection_callback(socket);
            }
        });

    },
    
    _createId: function() {
        return '5' + Utils.random(99) + '' + (this._counter++);
    },
    
    broadcast: function(message) {
        this.forEachConnection(function(connection) {
            connection.emit("message", message);
        });
    },
    
    onRequestStatus: function(status_callback) {
        this.status_callback = status_callback;
    }
});

