'use strict';

var solutions = new Object();
var locations = new Object();
var hints = new Object();

module.exports.submitPuzzleSolution = function(puzzleName, answer) {
    // convert puzzle name to lowercase
    puzzleName = puzzleName.toLowerCase();
    // strip all spaces/tabs 
    puzzleName = puzzleName.replace(/\s/g, '');
    puzzleName = puzzleName.replace(/'/g, '');
    puzzleName = puzzleName.replace(/,/g, '');

    // convert answer to lowercase
    answer = answer.toLowerCase();
    // strip all spaces/tabs 
    answer = answer.replace(/\s/g, '');
    answer = answer.replace(/,/g, '');
    answer = answer.replace(/'/g, '');

    // look up puzzle
    var actualAnswer = solutions[puzzleName];
    if (actualAnswer == undefined) {
        // failed, return unknown puzzle
        return `Puzzle name "${puzzleName}" not recognized`;
    }

    // compare answer
    if (actualAnswer == answer) {
        // success return location
        return "Correct! The stamp is at the " + locations[puzzleName];
    } else {
        var hintText = hints[puzzleName+"."+answer];
        if (hintText != undefined) {
            return hintText+" (Incorrect answer)" ;
        } else {
            // failed return incorrect
            return "Incorrect answer to puzzle"
        }
    }
}

module.exports.initSolutionEngine = function () {   
    solutions['Test Puzzle'.toLowerCase().replace(/\s/g, '')] = 'TESTSOLUTION'.toLowerCase();

    locations['Test Puzzle'.toLowerCase().replace(/\s/g, '')] = 'test location';

    hints['testpuzzle.test'] = "Close. Keep going with more testing.";
}
