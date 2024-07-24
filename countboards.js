        // lists all the trams on the boards - this is not a list of trams it's each mention on a board
        var trains = [];
        console.log(tramData);

        tramData.value.forEach(board => {
            for (let j = 0; j < 4; j++) {
                if (board['Dest'+j] != '') {
                    let train = {
                        destination: board['Dest' + j],
                        currentBoard: board['StationLocation'],
                        wait: board['Wait' + j]
                    };
                    if (trains.some(e => JSON.stringify(e) == JSON.stringify(train)) == false) {
                        trains.push(train);
                    };
                };
            };
        });
        
        trains.sort((a,b) => (Number(a.wait) - Number(b.wait))); 