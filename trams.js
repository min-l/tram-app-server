const https = require('https');
const map = require('./map.json');
const { time } = require('console');
const express = require('express');
const { kill } = require('process');
const app = express();
const port = 3000;
const trainTimeout = 480000; //480000 = 8 mins
const shortTrainTimeout = 180000;
/*const timeZone = new Date().getTimezoneOffset() / -60;*/
const timeZone = 0;
var currentTrains = [];
var currentNotices = [];
var currentStations = {};
var killable = false;

/*
const options = {
    hostname: 'api.tfgm.com',
    path: '/odata/Metrolinks',
    headers: {
        'Ocp-Apim-Subscription-Key':'xxx'
    }
};
*/

const options = require("./options.json");

const edging = [
    ['Ashton via MCUK','Ashton-Under-Lyne'],
    ['Eccles via MediaCityUK','Eccles'],
    ['Deansgate Castlefield','Deansgate - Castlefield'],
    ['Ashton-under-Lyne','Ashton-Under-Lyne'],
    ['Weaste via MediaCityUK','Weaste'],
    ['Trafford Palazzo','Barton Dock Road']
];

function normaliseNames(name) {
    edging.forEach(edge => {name = name.replace(edge[0],edge[1])});
    return name;
}

function evaluateTime(timeInput) {
    let timeOutput = new Date(timeInput);
    return timeOutput.getTime() - (timeZone * 3600000);
};

function getEndTime(stopname) {
    switch (stopname) {
        case "Eccles":
            return "1";
        case "The Trafford Centre":
        case "Ashton-Under-Lyne":
        case "East Didsbury":
        case "Victoria":
            return "2";
        case "Rochdale Town Centre":
        case "Altrincham":
        case "Manchester Airport":
        case "Piccadilly":
        default:
            return "3";
        case "Bury":
            return "6";
    }
}

function trainsUpkeep() {
    //console.log(currentTrains);
    currentTrains.forEach(tcheck => {
        if (Date.now() > trainTimeout + evaluateTime(tcheck.dTime) || (Date.now() > shortTrainTimeout + evaluateTime(tcheck.dTime) && tcheck.progress == 1)) {
            console.log(tcheck);
            currentTrains.splice(currentTrains.indexOf(tcheck),1);
        }
    });
    if (new Date().getHours() == 3 && killable == true) {
        console.log('Quitting to clear memory.');
        process.exit();
    }
}

function trainsCheck(newTrain) {
    let exists = false;
    currentTrains.forEach(tcheck => {
        if (tcheck.predictNext == newTrain.departed && tcheck.destination == newTrain.destination) {
            currentTrains.splice(currentTrains.indexOf(tcheck),1);
            // console.log('train replaced')
        };
        if (tcheck.departed == newTrain.departed && tcheck.destination == newTrain.destination && tcheck.dTime == newTrain.dTime) {
            exists = true;
        };
    });
    if (exists == false) {
        currentTrains.push(newTrain);
        killable = true;
    };
};


function updateBoard(lastBoards) {
    //console.time('request')
    //console.log('called')
    https.get(options, (res) => {
        let rawData = '';
        res.on('data', (chunk) => { rawData += chunk; });
        res.on('end', () => {
            const tramData = JSON.parse(rawData).value;
            //console.log(tramData);
            let tempNotices = [];
            let tempStations = {};
            tramData.forEach(board => {
                if (!(tempNotices.includes(board.MessageBoard)) && !board.MessageBoard.includes("^F0Next Altrincham Departures:^F0")) {
                    tempNotices.push(board.MessageBoard);
                }
                let stationLocation = normaliseNames(board.StationLocation);
                if (!(stationLocation in tempStations)) {
                    tempStations[stationLocation] = {"Incoming":[],"Outgoing":[],"Incoming/Outgoing":[],"Other":[]};
                }
                for (let i = 0; i < 4; i++) {
                    if (board["Dest" + i] != "") {
                        let upcoming = {
                            "Dest": board["Dest" + i],
                            "Carriages": board["Carriages" + i],
                            "Status": board["Status" + i],
                            "Wait": board["Wait" + i]
                        }
                        try {
                            tempStations[stationLocation][board.Direction].push(upcoming);
                        } catch {
                            tempStations[stationLocation]["Other"].push(upcoming);
                        }
                    }
                }

                let currentBoard = board.Id;
                for (let j = 0; j < 4; j++) {
                    if (board['Status'+j] == "Departing" && lastBoards.find(oldBoard => oldBoard.Id == board.Id)['Status'+j] != "Departing") {
                        let train = {
                            departed: stationLocation,
                            predictNext: '',
                            destination: normaliseNames(board['Dest' + j]),
                            route: '',
                            dTime: board['LastUpdated'],
                            currentTime: '',
                            totalTime: '',
                            progress: 0,
                            minuteOffset: 0
                        };
                        // train.destination = normaliseNames(train.destination);
                        // find next stop
                        let routes = [];
                        if (Object.hasOwn(map.ends,train.destination)) {
                            routes.concat(map.ends[train.destination]);
                        }
                        ['green','purple','lightblue','yellow','pink','brown','red','darkblue'].forEach(colour => {if (!(routes.includes(colour))) {routes.push(colour)}});
                        // console.log(routes)
                        for (let i = 0; i < routes.length && train.route == ''; i++) {
                            if (map.map[routes[i]].includes(train.departed) && map.map[routes[i]].includes(train.destination)) {
                                train.predictNext = map.map[routes[i]][map.map[routes[i]].indexOf(train.departed) + (Math.sign(map.map[routes[i]].indexOf(train.destination) - map.map[routes[i]].indexOf(train.departed)))];
                                train.route = routes[i];
                            }
                        }
                        if (train.predictNext == train.destination) {
                            train.totalTime = getEndTime(train.predictNext);
                            train.currentTime = train.totalTime;
                            train.minuteOffset = Date.now();
                        } else {
                            let found = false;
                            tramData.filter(nextBoards => normaliseNames(nextBoards.StationLocation) == train.predictNext).forEach(dBoard => {
                                for (let i = 0; i < 4 && !(found); i++) {
                                    if (normaliseNames(dBoard['Dest'+i]) == train.destination) {   
                                        train.totalTime = dBoard['Wait'+i];
                                        train.currentTime = dBoard['Wait'+i];
                                        train.minuteOffset = Date.now();
                                        found = true;
                                    }
                                }
                            });
                        }


                        //console.log(train);
                        trainsCheck(train);
                        //currentTrains.push(train);
                    };
                };





            });
            // time update code here:
            currentTrains.forEach(tcheck => {
                if (tcheck.predictNext == tcheck.destination) {
                    let minuteProgress = (Date.now() - tcheck.minuteOffset) / 60000;
                    if (minuteProgress > 1) {
                        tcheck.minuteOffset = tcheck.minuteOffset + 60000;
                        tcheck.currentTime = String(+tcheck.currentTime - 1);
                        minuteProgress -= 1;
                    }
                    let tempProgress = (1/(1 + +tcheck.totalTime)) * (+tcheck.totalTime - tcheck.currentTime + minuteProgress);
                    if (tempProgress > 1) {tempProgress = 1;};
                    tcheck.progress = tempProgress;
                } else {
                    let found = false;
                    tramData.filter(nextBoards => nextBoards.StationLocation == tcheck.predictNext).forEach(dBoard => {
                        for (let i = 0; i < 4 && !(found); i++) {
                            if (normaliseNames(dBoard['Dest'+i]) == tcheck.destination) {
                                if (tcheck.currentTime != dBoard['Wait'+i]) {
                                    // console.log((Date.now() - tcheck.minuteOffset) / 60000)
                                    tcheck.minuteOffset = Date.now();
                                }
                                tcheck.currentTime = dBoard['Wait'+i];
                                found = true;
                            }
                        }
                    });
                    let minuteProgress = (Date.now() - tcheck.minuteOffset) / 60000;
                    if (minuteProgress > 1) {
                        minuteProgress = 1;
                    }
                    let tempProgress = (1/(1 + +tcheck.totalTime)) * (+tcheck.totalTime - tcheck.currentTime + minuteProgress);
                    if (tempProgress > tcheck.progress) {
                        tcheck.progress = tempProgress;
                    }
                }
            })

            currentNotices = tempNotices.slice(0);
            currentStations = structuredClone(tempStations);

            setTimeout(updateBoard.bind(null,tramData),5000);
            // setTimeout(updateBoard.bind(null,tramData),5000 - console.timeEnd('request'));
        })
    });



};



https.get(options, (res) => {
    let rawData = '';
    res.on('data', (chunk) => { rawData += chunk; });
    res.on('end', () => {
        const tramData = JSON.parse(rawData).value;
        setTimeout(updateBoard.bind(null,tramData),1000);
    })
});


setInterval(trainsUpkeep,4000);

app.get('/active', function (req, res) {
    res.send(currentTrains);
});

app.get('/map', function (req, res) {
    res.send(map);
});

app.get('/notice', function (req, res) {
    res.send(currentNotices);
});

app.get('/stations/:station', function (req, res) {
    let station = req.params.station;
    station = station.replaceAll("_"," ");
    if (station in currentStations) {
        res.send(currentStations[station]);
    } else {
        res.status(404).send('No station by that name');
    }
});

app.listen(port, function () {
    console.log('listening on '+port);
  });