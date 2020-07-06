
/* include required package for nodejs app */
var express = require("express");
var app = express();
require('dotenv').config();

var cron = require('node-schedule');
var memcached = require('./src/config/db');
const josnData = require('./src/config/events.json');
var rule = new cron.RecurrenceRule();

rule.second = 20;

let path = '/visitors/events';

cron.scheduleJob(rule, function () {
    readKeys();
    getRandomIdAndData();
})

let getRandomIdAndData = function(request, resp){
    let trackId = josnData.tackingId[Math.floor(Math.random() * josnData.tackingId.length)];
    if (trackId) {
        josnData && josnData.events ? josnData.events.map(event => {
            if (trackId === event.value.trackingId) {
                event["time"] = new Date();
                memcached.add(trackId, event, 186400, function (err) {
                    // if (err) throw new err;
                });
                if(request){
                    resp.send({
                        status: 200,
                        message: 'success'
                    })
                }
            }
        }) : null
    }
}

var readKeys = function (request, resp) {
    memcached.items(function (err, result) {
        var key_array = [];
        if (err)
            console.error(err);
        // for each server...
        result.forEach(function (itemSet) {
            var keys = Object.keys(itemSet);
            // we don't need the "server" key, but the other indicate the slab id's
            keys.pop();
            // Here get key item's length
            var keys_length = keys.length;

            keys.forEach(function (stats) {
                // get a cachedump for each slabid and slab.number
                memcached.cachedump(itemSet.server, parseInt(stats), parseInt(itemSet[stats].number), function (err, response) {
                    // dump the shizzle
                    if (typeof response.key == "undefined" && response.length > 1) {
                        response.forEach(function (key_obj) {
                            key_array.push(key_obj.key);
                        });
                    } else key_array.push(response.key);

                    keys_length--;

                    // read.
                    if (keys_length == 0) {
                        let trackedData = [];
                        memcached.getMulti(key_array, function (err, data) {
                            let signup = {
                                totalEventsCaptured: Object.keys(data).length,
                                eventsCapturedByTrackingIds: {}
                            }
                            trackedData.push(data);
                            josnData.tackingId.map((id, index) => {
                                if (signup.eventsCapturedByTrackingIds && trackedData && trackedData[0] && trackedData[0][id] && trackedData[0][id].value && !signup.eventsCapturedByTrackingIds[trackedData[0][id].value.trackingId]) {
                                    signup.eventsCapturedByTrackingIds[trackedData[0][id].value.trackingId] = 1;
                                } else if (signup.eventsCapturedByTrackingIds && trackedData && trackedData[0] && trackedData[0][id] && [trackedData[0][id].value.trackingId]) {
                                    signup.eventsCapturedByTrackingIds[trackedData[0][id].value.trackingId] += 1;
                                }
                            })
                            if (request) {
                                resp.send({
                                    status: 200,
                                    message: 'success',
                                    data: signup
                                })
                            }
                            console.log('event captured data:...', signup)
                            memcached.end();// Kills Memcache Connection
                        });
                    }
                });
            });
        });
    });
};

app.get(path, function (req, res) {
    readKeys(req, res);
})

app.post(path, function (req, res) {
    getRandomIdAndData(req, res);
})


app.listen(process.env.PORT, function () {
    console.log("Server running on port " + process.env.PORT);
});
