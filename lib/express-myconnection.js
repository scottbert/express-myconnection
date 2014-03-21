/*jshint forin:true, noarg:true, noempty:true, eqeqeq:true, bitwise:true, strict:true, undef:true, node:true, unused:true, curly:true, white:true, indent:4, maxerr:50 */
var 
    connection, // This is used as a singleton in a single connection strategy
    pool; // Pool singleton

/**
 * Handling connection disconnects, as defined here: https://github.com/felixge/node-mysql
 */
function handleDisconnect(mysql, dbConfig) {
    "use strict";
    console.log('in handle disconnect.');
    connection = mysql.createConnection(dbConfig);

    connection.connect(function (err) {
        if (err) {
            console.log('error when connecting to db:', err);
            setTimeout(handleDisconnect, 2000);
        }
        console.log('connected.');
    });
    connection.on('error', function (err) {
        console.log('db error', err);
        if (err.code === 'PROTOCOL_CONNECTION_LOST') {
            console.log('handling disconnect');
            handleDisconnect();
        } else {
            throw err;
        }
    });
}

/**
 * Returns middleware that will handle mysql db connections
 *
 * @param {Object} mysql - mysql module
 * @param {Object} dbConfig - object with mysql db options
 * @param {String} or undefined strategy - default is single strategy
 * @return {Function}
 * @api public
 */
module.exports = function (mysql, dbConfig, strategy) {
    "use strict";
    if (mysql === null) {
        throw new Error('Missing mysql module param');
    }
    if (dbConfig === null) {
        throw new Error('Missing dbConfig module param');
    }
    if (strategy === 'pool') {
        pool = mysql.createPool(dbConfig);
    } else {
        handleDisconnect(mysql, dbConfig);
    }
    return function (req, res, next) {
        var poolConnection,
            requestConnection;

        if (strategy === 'single') {
            // getConnection will return singleton connection
            req.getConnection = function (callback) {
                callback(null, connection);
            };

        } else if (strategy === 'pool') {
            // getConnection handled by mysql pool
            req.getConnection = function (callback) {
                // Returning cached connection from a pool, caching is on request level
                if (poolConnection) {
                    return callback(null, poolConnection);
                }
                // Getting connection from a pool
                pool.getConnection(function (err, connection) {
                    if (err) {
                        return callback(err);
                    }
                    poolConnection = connection;
                    callback(null, poolConnection);
                });
            };
        } else if (strategy === 'request') {
            // getConnection creates new connection per request
            req.getConnection = function (callback) {
                // Returning cached connection, caching is on request level
                if (requestConnection) {
                    return callback(null, requestConnection);
                }
                // Creating new connection
                var connection = mysql.createConnection(dbConfig);
                connection.connect(function (err) {
                    if (err) {
                        return callback(err);
                    }
                    requestConnection = connection;
                    callback(null, requestConnection);
                });
            };
        }
        var end = res.end;
        res.end = function (data, encoding) {
            // Ending request connection if available
            if (requestConnection) {
                requestConnection.end();
            }
            // Releasing pool connection if available
            if (poolConnection) {
                poolConnection.release();
            }
            end(data, encoding);
        };
        next();
    };
};
